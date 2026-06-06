from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


PAGE_GROUPS = {
    1: range(1, 10),
    2: range(10, 19),
    3: range(19, 28),
    4: range(28, 37),
    5: range(37, 46),
    6: range(46, 55),
}


EXACT_SPACE_JOIN_PREV = {
    "PDA/personal digital",
    "zip/ZIP/zone improvement",
}


def normalize_line(line: str) -> str:
    line = line.rstrip("\n")
    if re.fullmatch(r"(?:[A-Za-z]\s+){3,}[A-Za-z]", line.strip()):
        line = line.replace(" ", "")
    return " ".join(line.split()).strip()


def is_header(line: str, level: int) -> bool:
    return bool(
        not line
        or re.fullmatch(rf"LEVEL\s+{level}", line)
        or re.fullmatch(r"\d+", line)
        or re.fullmatch(rf"LEVEL\s+{level} \(1,080 words\)", line)
    )


def merge_with_previous(entries: list[str], line: str) -> bool:
    if not entries:
        return False

    prev = entries[-1]

    if prev.endswith("/"):
        entries[-1] = prev + line
        return True

    if prev in EXACT_SPACE_JOIN_PREV:
        entries[-1] = prev + " " + line
        return True

    return False


def clean_entry(entry: str) -> str:
    entry = re.sub(r"\s*/\s*", "/", entry)
    entry = re.sub(r"\s+", " ", entry).strip()
    return entry


def extract_levels(pdf_path: Path) -> dict[str, list[str]]:
    reader = PdfReader(str(pdf_path))
    result: dict[str, list[str]] = {}

    for level, pages in PAGE_GROUPS.items():
        entries: list[str] = []
        for page_index in pages:
            text = reader.pages[page_index].extract_text() or ""
            for raw_line in text.splitlines():
                line = normalize_line(raw_line)
                if is_header(line, level):
                    continue
                if merge_with_previous(entries, line):
                    continue
                entries.append(line)
        result[f"Level {level}"] = [clean_entry(entry) for entry in entries]

    return result


def main() -> int:
    pdf_path = (
        Path(sys.argv[1])
        if len(sys.argv) > 1
        else Path("senior") / "詞彙分級表.pdf"
    )
    output_path = (
        Path(sys.argv[2])
        if len(sys.argv) > 2
        else Path("outputs") / "vocab_levels.json"
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    data = extract_levels(pdf_path)
    output_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    for level_name, entries in data.items():
        print(f"{level_name}: {len(entries)} entries")
    print(f"Saved {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
