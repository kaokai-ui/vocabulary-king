import os
import posixpath
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


def sheet_parts(archive):
    workbook = ET.fromstring(archive.read("xl/workbook.xml"))
    relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
    targets = {
        relationship.attrib["Id"]: relationship.attrib["Target"]
        for relationship in relationships.findall(f"{{{PKG_REL_NS}}}Relationship")
    }
    result = {}
    for sheet in workbook.findall(f".//{{{MAIN_NS}}}sheet"):
        relationship_id = sheet.attrib.get(f"{{{DOC_REL_NS}}}id")
        target = targets.get(relationship_id)
        if not target:
            raise ValueError(f"Missing relationship for worksheet {sheet.attrib.get('name')}")
        part = target.lstrip("/") if target.startswith("/") else posixpath.normpath(posixpath.join("xl", target))
        result[sheet.attrib["name"]] = part
    return result


def read_shared_strings(archive):
    part = "xl/sharedStrings.xml"
    if part not in archive.namelist():
        return []
    root = ET.fromstring(archive.read(part))
    return [
        "".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t"))
        for item in root.findall(f"{{{MAIN_NS}}}si")
    ]


def cell_text(cell, shared_strings):
    if cell is None:
        return ""
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        inline = cell.find(f"{{{MAIN_NS}}}is")
        return "" if inline is None else "".join(
            node.text or "" for node in inline.iter(f"{{{MAIN_NS}}}t")
        )
    value = cell.find(f"{{{MAIN_NS}}}v")
    if value is None or value.text is None:
        return ""
    if cell_type == "s":
        return shared_strings[int(value.text)]
    return value.text


def row_cell_map(row):
    return {
        cell.attrib["r"]: cell
        for cell in row.findall(f"{{{MAIN_NS}}}c")
        if "r" in cell.attrib
    }


def shift_cell_references(value, deleted_row):
    pattern = re.compile(r"(?P<column>\$?[A-Z]{1,3}\$?)(?P<row>\d+)")

    def replace(match):
        row_number = int(match.group("row"))
        if row_number > deleted_row:
            row_number -= 1
        return match.group("column") + str(row_number)

    return pattern.sub(replace, value)


def rewrite_row_xml(xml_text, deleted_row):
    row_pattern = re.compile(
        r"<row\b(?=[^>]*\br=\"(\d+)\")[^>]*(?:/>|>.*?</row>)",
        re.DOTALL,
    )
    seen = 0

    def replace_row(match):
        nonlocal seen
        fragment = match.group(0)
        opening_end = fragment.find(">") + 1
        opening = fragment[:opening_end]
        row_number_match = re.search(r"\br=\"(\d+)\"", opening)
        if not row_number_match:
            raise ValueError("Could not read a worksheet row number")
        row_number = int(row_number_match.group(1))
        if row_number == deleted_row:
            seen += 1
            return ""
        if row_number < deleted_row:
            return fragment

        new_row_number = row_number - 1
        opening = re.sub(
            r"(\br=\")\d+(\")",
            lambda attr: attr.group(1) + str(new_row_number) + attr.group(2),
            opening,
            count=1,
        )
        remainder = fragment[opening_end:]
        if remainder.endswith("</row>"):
            body = remainder[:-6]
            closing = "</row>"
        else:
            body = remainder
            closing = ""
        body = re.sub(
            r"(\br=\")([A-Z]{1,3})(\d+)(\")",
            lambda attr: attr.group(1)
            + attr.group(2)
            + str(int(attr.group(3)) - 1)
            + attr.group(4)
            if int(attr.group(3)) > deleted_row
            else attr.group(0),
            body,
        )
        return opening + body + closing

    rewritten = row_pattern.sub(replace_row, xml_text)
    if seen != 1:
        raise ValueError(f"Expected exactly one row {deleted_row}, found {seen}")
    return rewritten


def rewrite_ranges(xml_text, deleted_row):
    ref_pattern = re.compile(r"(?P<prefix>\b(?:ref|sqref)=\")(?P<value>[^\"]+)(?P<suffix>\")")
    return ref_pattern.sub(
        lambda match: match.group("prefix")
        + shift_cell_references(match.group("value"), deleted_row)
        + match.group("suffix"),
        xml_text,
    )


def delete_row(input_path, output_path, sheet_name, row_number, word_column, before_word, target_word):
    if os.path.abspath(input_path) == os.path.abspath(output_path):
        raise ValueError("Input and output workbook paths must differ")
    if os.path.exists(output_path):
        raise FileExistsError(f"Refusing to overwrite existing output workbook: {output_path}")

    with zipfile.ZipFile(input_path, "r") as source:
        parts_by_sheet = sheet_parts(source)
        if sheet_name not in parts_by_sheet:
            raise ValueError(f"Missing worksheet {sheet_name}")
        worksheet_part = parts_by_sheet[sheet_name]
        xml_text = source.read(worksheet_part).decode("utf-8")
        root = ET.fromstring(xml_text)
        sheet_data = root.find(f"{{{MAIN_NS}}}sheetData")
        if sheet_data is None:
            raise ValueError("Worksheet has no sheetData element")
        rows = {
            int(row.attrib["r"]): row
            for row in sheet_data.findall(f"{{{MAIN_NS}}}row")
            if "r" in row.attrib
        }
        previous_row = rows.get(row_number - 1)
        target_row = rows.get(row_number)
        shared_strings = read_shared_strings(source)
        previous_value = cell_text(row_cell_map(previous_row).get(f"{word_column}{row_number - 1}"), shared_strings)
        target_value = cell_text(row_cell_map(target_row).get(f"{word_column}{row_number}"), shared_strings)
        if previous_value != before_word:
            raise ValueError(
                f"Deletion guard failed: {word_column}{row_number - 1} is {previous_value!r}, expected {before_word!r}"
            )
        if target_value != target_word:
            raise ValueError(
                f"Deletion guard failed: {word_column}{row_number} is {target_value!r}, expected {target_word!r}"
            )

        formulas = [cell for cell in root.iter(f"{{{MAIN_NS}}}f")]
        if formulas:
            raise ValueError("Refusing row deletion from a worksheet containing formulas")

        updated = rewrite_row_xml(xml_text, row_number)
        updated = rewrite_ranges(updated, row_number)
        updated_root = ET.fromstring(updated)
        updated_sheet_data = updated_root.find(f"{{{MAIN_NS}}}sheetData")
        updated_rows = updated_sheet_data.findall(f"{{{MAIN_NS}}}row")
        if len(updated_rows) != len(sheet_data.findall(f"{{{MAIN_NS}}}row")) - 1:
            raise ValueError("Worksheet row count did not decrease by exactly one")

        output_directory = os.path.dirname(os.path.abspath(output_path))
        descriptor, temporary_path = tempfile.mkstemp(prefix=".xlsx-delete-row-", suffix=".xlsx", dir=output_directory)
        os.close(descriptor)
        try:
            with zipfile.ZipFile(temporary_path, "w") as destination:
                destination.comment = source.comment
                for info in source.infolist():
                    payload = updated.encode("utf-8") if info.filename == worksheet_part else source.read(info.filename)
                    destination.writestr(info, payload)
            os.replace(temporary_path, output_path)
        except Exception:
            if os.path.exists(temporary_path):
                os.unlink(temporary_path)
            raise


def main():
    if len(sys.argv) != 8:
        raise ValueError(
            "usage: delete-xlsx-row.py <input.xlsx> <output.xlsx> <sheet> <row> <word-column> <previous-word> <target-word>"
        )
    _, input_path, output_path, sheet_name, row_number, word_column, before_word, target_word = sys.argv
    delete_row(input_path, output_path, sheet_name, int(row_number), word_column, before_word, target_word)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
