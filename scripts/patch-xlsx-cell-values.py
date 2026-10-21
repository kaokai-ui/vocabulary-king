import html
import json
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


def shared_string_values(xml_text):
    root = ET.fromstring(xml_text)
    values = []
    for item in root.findall(f"{{{MAIN_NS}}}si"):
        values.append("".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t")))
    return root, values


def cell_map(xml_text):
    root = ET.fromstring(xml_text)
    return {
        cell.attrib["r"]: cell
        for cell in root.iter(f"{{{MAIN_NS}}}c")
        if "r" in cell.attrib
    }


def column_number(address):
    match = re.fullmatch(r"([A-Z]+)[0-9]+", address)
    if not match:
        raise ValueError(f"Invalid cell address: {address}")
    value = 0
    for character in match.group(1):
        value = value * 26 + ord(character) - ord("A") + 1
    return value


def insert_cell(xml_text, address, value, mode, shared_index=None):
    address_match = re.fullmatch(r"([A-Z]+)([0-9]+)", address)
    if not address_match:
        raise ValueError(f"Invalid cell address: {address}")
    target_column = column_number(address)
    target_row = address_match.group(2)
    row_pattern = re.compile(
        rf"<(?P<tag>(?:[A-Za-z_][\w.-]*:)?row)\b(?=[^>]*\br=\"{re.escape(target_row)}\")(?P<attrs>[^>]*)>(?P<body>.*?)</(?P=tag)>",
        re.DOTALL,
    )
    match = row_pattern.search(xml_text)
    if not match:
        raise ValueError(f"Could not locate row {target_row} for missing cell {address}")

    row_tag = match.group("tag")
    prefix = row_tag[:-3] if row_tag.endswith(":row") else ""
    if mode == "s":
        if shared_index is None:
            raise ValueError(f"Missing shared string index for cell {address}")
        body = f"<{prefix}v>{shared_index}</{prefix}v>"
    elif mode == "inlineStr":
        body = f'<{prefix}is><{prefix}t xml:space="preserve">{escape_text(value)}</{prefix}t></{prefix}is>'
    else:
        raise ValueError(f"Unsupported target string mode: {mode}")
    new_cell = f'<{prefix}c r="{address}" t="{mode}">{body}</{prefix}c>'

    row_body = match.group("body")
    cell_open_pattern = re.compile(
        r"<(?P<tag>(?:[A-Za-z_][\w.-]*:)?c)\b(?P<attrs>[^>]*?)(?:/?>)"
    )
    insert_at = len(row_body)
    for cell_match in cell_open_pattern.finditer(row_body):
        reference = re.search(r'\br="([A-Z]+)([0-9]+)"', cell_match.group("attrs"))
        if not reference or reference.group(2) != target_row:
            continue
        if column_number(reference.group(1) + target_row) > target_column:
            insert_at = cell_match.start()
            break

    updated_body = row_body[:insert_at] + new_cell + row_body[insert_at:]
    replacement = (
        f"<{row_tag}{match.group('attrs')}>"
        f"{updated_body}"
        f"</{row_tag}>"
    )
    return xml_text[:match.start()] + replacement + xml_text[match.end():]


def cell_value(cell, shared_values):
    if cell is None:
        return ""
    value = cell.find(f"{{{MAIN_NS}}}v")
    cell_type = cell.attrib.get("t")
    if cell_type == "s":
        if value is None or value.text is None:
            return ""
        if not shared_values:
            raise ValueError("Cell references a shared string, but workbook has no shared string table")
        return shared_values[int(value.text)]
    if cell_type == "inlineStr":
        inline = cell.find(f"{{{MAIN_NS}}}is")
        if inline is None:
            return ""
        return "".join(node.text or "" for node in inline.iter(f"{{{MAIN_NS}}}t"))
    return "" if value is None or value.text is None else value.text


def count_shared_references(archive, worksheet_paths):
    total = 0
    for part in worksheet_paths:
        root = ET.fromstring(archive.read(part))
        for cell in root.iter(f"{{{MAIN_NS}}}c"):
            if cell.attrib.get("t") == "s" and cell.find(f"{{{MAIN_NS}}}v") is not None:
                total += 1
    return total


def escape_text(value):
    return html.escape(value, quote=False)


def insert_shared_string(xml_text, value):
    existing_open = re.search(r"<(?P<prefix>[A-Za-z_][\w.-]*:)?sst\b(?P<attrs>[^>]*)>", xml_text)
    if not existing_open:
        raise ValueError("Could not locate the shared string table root element")
    prefix = existing_open.group("prefix") or ""
    item = f'<{prefix}si><{prefix}t xml:space="preserve">{escape_text(value)}</{prefix}t></{prefix}si>'
    closing = re.search(rf"</{re.escape(prefix)}sst\s*>", xml_text)
    if not closing:
        raise ValueError("Could not locate the shared string table closing element")
    updated = xml_text[:closing.start()] + item + xml_text[closing.start():]
    return updated


def set_root_attribute(xml_text, name, value):
    match = re.search(r"<(?P<tag>(?:[A-Za-z_][\w.-]*:)?sst)\b(?P<attrs>[^>]*)>", xml_text)
    if not match:
        raise ValueError("Could not locate the shared string table root element")
    attrs = match.group("attrs")
    attr_pattern = re.compile(rf"\s{re.escape(name)}=\"[^\"]*\"")
    replacement = f' {name}="{value}"'
    if attr_pattern.search(attrs):
        attrs = attr_pattern.sub(replacement, attrs, count=1)
    else:
        attrs += replacement
    opening = f"<{match.group('tag')}{attrs}>"
    return xml_text[:match.start()] + opening + xml_text[match.end():]


def patch_cell(xml_text, address, value, mode, shared_index=None):
    pattern = re.compile(
        rf"<(?P<tag>(?:[A-Za-z_][\w.-]*:)?c)\b(?=[^>]*\br=\"{re.escape(address)}\")(?P<attrs>[^>]*)>(?P<body>.*?)</(?P=tag)>",
        re.DOTALL,
    )
    match = pattern.search(xml_text)
    self_closing = False
    if not match:
        empty_pattern = re.compile(
            rf"<(?P<tag>(?:[A-Za-z_][\w.-]*:)?c)\b(?=[^>]*\br=\"{re.escape(address)}\")(?P<attrs>[^>]*)/>"
        )
        match = empty_pattern.search(xml_text)
        self_closing = match is not None
    if not match:
        raise ValueError(f"Could not locate target cell {address}")

    tag = match.group("tag")
    attrs = match.group("attrs")
    if re.search(r"<(?:[A-Za-z_][\w.-]*:)?f(?:\s|>)", match.group(0)):
        raise ValueError(f"Refusing to replace formula cell {address}")
    attr_type = re.compile(r"\s+t=\"[^\"]*\"")
    if attr_type.search(attrs):
        attrs = attr_type.sub(f' t="{mode}"', attrs, count=1)
    else:
        attrs += f' t="{mode}"'
    opening = f"<{tag}{attrs}>"
    prefix = tag[:-1] if tag.endswith(":c") else ""
    if mode == "s":
        body = f"<{prefix}v>{shared_index}</{prefix}v>"
    elif mode == "inlineStr":
        body = f'<{prefix}is><{prefix}t xml:space="preserve">{escape_text(value)}</{prefix}t></{prefix}is>'
    else:
        raise ValueError(f"Unsupported target string mode: {mode}")
    replacement = f"{opening}{body}</{tag}>"
    return xml_text[:match.start()] + replacement + xml_text[match.end():]


def patch_workbook(input_path, operations_path, output_path):
    with open(operations_path, "r", encoding="utf-8") as handle:
        operations = json.load(handle)
    if not operations:
        raise ValueError("No cell operations were supplied")

    with zipfile.ZipFile(input_path, "r") as source:
        parts_by_sheet = sheet_parts(source)
        worksheet_paths = [part for part in parts_by_sheet.values() if part.startswith("xl/worksheets/")]
        shared_part = "xl/sharedStrings.xml"
        has_shared_strings = shared_part in source.namelist()
        if has_shared_strings:
            shared_xml = source.read(shared_part).decode("utf-8")
            shared_root, shared_values = shared_string_values(shared_xml)
            shared_index = {value: index for index, value in enumerate(shared_values)}
            reference_count = count_shared_references(source, worksheet_paths)
        else:
            shared_xml = None
            shared_root = None
            shared_values = []
            shared_index = {}
            reference_count = 0

        grouped = {}
        for operation in operations:
            worksheet = operation["worksheet"]
            if worksheet not in parts_by_sheet:
                raise ValueError(f"Missing worksheet {worksheet}")
            grouped.setdefault(parts_by_sheet[worksheet], []).append(operation)

        worksheet_xml = {}
        net_new_references = 0
        for part, part_operations in grouped.items():
            original_xml = source.read(part).decode("utf-8")
            current_xml = original_xml
            cells = cell_map(original_xml)
            for operation in part_operations:
                address = operation["address"]
                cell = cells.get(address)
                actual_value = cell_value(cell, shared_values)
                if actual_value != operation["oldValue"]:
                    raise ValueError(f"Source value changed before patch at {part}!{address}")
                if cell is not None and cell.find(f"{{{MAIN_NS}}}f") is not None:
                    raise ValueError(f"Refusing to replace formula cell {part}!{address}")

                if has_shared_strings:
                    if operation["newValue"] not in shared_index:
                        shared_index[operation["newValue"]] = len(shared_values)
                        shared_values.append(operation["newValue"])
                        shared_xml = insert_shared_string(shared_xml, operation["newValue"])
                    new_index = shared_index[operation["newValue"]]
                    if cell is None or cell.attrib.get("t") != "s":
                        net_new_references += 1
                    if cell is None:
                        current_xml = insert_cell(current_xml, address, operation["newValue"], "s", new_index)
                    else:
                        current_xml = patch_cell(current_xml, address, operation["newValue"], "s", new_index)
                else:
                    if cell is None:
                        current_xml = insert_cell(current_xml, address, operation["newValue"], "inlineStr")
                    else:
                        current_xml = patch_cell(current_xml, address, operation["newValue"], "inlineStr")
            worksheet_xml[part] = current_xml.encode("utf-8")

        if has_shared_strings:
            shared_xml = set_root_attribute(shared_xml, "count", reference_count + net_new_references)
            if "uniqueCount" in shared_root.attrib:
                shared_xml = set_root_attribute(shared_xml, "uniqueCount", len(shared_values))

        output_directory = os.path.dirname(os.path.abspath(output_path))
        os.makedirs(output_directory, exist_ok=True)
        descriptor, temporary_path = tempfile.mkstemp(prefix=".xlsx-patch-", suffix=".xlsx", dir=output_directory)
        os.close(descriptor)
        try:
            with zipfile.ZipFile(temporary_path, "w") as destination:
                destination.comment = source.comment
                for info in source.infolist():
                    if has_shared_strings and info.filename == shared_part:
                        payload = shared_xml.encode("utf-8")
                    else:
                        payload = worksheet_xml.get(info.filename, source.read(info.filename))
                    destination.writestr(info, payload)
            os.replace(temporary_path, output_path)
        except Exception:
            if os.path.exists(temporary_path):
                os.unlink(temporary_path)
            raise


def main():
    if len(sys.argv) != 4:
        raise ValueError("usage: patch-xlsx-cell-values.py <input.xlsx> <operations.json> <output.xlsx>")
    patch_workbook(sys.argv[1], sys.argv[2], sys.argv[3])


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
