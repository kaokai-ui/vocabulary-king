from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


LEVELS = [f"Level {index}" for index in range(1, 7)]
HEADING_RE = re.compile(r"大考中心字彙表\s*LEVEL\s*(\d)", re.I)
ENTRY_RE = re.compile(
    r"(?P<word>[A-Za-z0-9/().\-]+(?: [A-Za-z0-9/().\-]+)*)\s+"
    r"\[[^\]]+\](?:\s*/\s*\[[^\]]+\])*\s*"
    r"(?:(?:\([^)]+\)|[A-Za-z.]+)\s*)*"
    r"(?P<meaning>[\u4e00-\u9fff].*?)"
    r"(?=\s+[A-Za-z0-9/().\-]+(?: [A-Za-z0-9/().\-]+)*\s+\[[^\]]+\]|$)"
)


def normalize_whitespace(text: str) -> str:
    text = text.replace("\u3000", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def find_level_page_starts(reader: PdfReader) -> dict[int, int]:
    starts: dict[int, int] = {}
    for index, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        match = HEADING_RE.search(text)
        if match:
            starts[int(match.group(1))] = index
    return starts


def extract_level_texts(reader: PdfReader) -> dict[str, str]:
    starts = find_level_page_starts(reader)
    if len(starts) != 6:
        raise ValueError(f"Expected 6 level headings, got {starts}")

    texts: dict[str, str] = {}
    for level in range(1, 7):
        start = starts[level]
        end = starts.get(level + 1, len(reader.pages))
        chunk = " ".join((reader.pages[i].extract_text() or "") for i in range(start, end))
        chunk = re.sub(r"大考中心字彙表\s*LEVEL\s*\d\s*\(?1,080 words\)?", " ", chunk, flags=re.I)
        texts[f"Level {level}"] = normalize_whitespace(chunk)
    return texts


def clean_meaning(text: str) -> str:
    text = normalize_whitespace(text)
    text = re.sub(r"\[(?:[A-Za-z]+|\+?[A-Za-z]+)\]", "", text)
    text = re.sub(r"\b(?:n|vt|vi|adj|adv|prep|conj|pron|aux|art|phr|a|v|int)\.(?:\s*\b(?:n|vt|vi|adj|adv|prep|conj|pron|aux|art|phr|a|v|int)\.)*", "；", text)
    text = re.sub(r"\s*([；、，。：？！])\s*", r"\1", text)
    text = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", text)
    text = re.sub(r"；{2,}", "；", text)
    return text.strip(" ;")


def extract_pdf_meanings(pdf_path: Path) -> dict[str, dict[str, str]]:
    reader = PdfReader(str(pdf_path))
    level_texts = extract_level_texts(reader)
    extracted: dict[str, dict[str, str]] = {}

    for level_name in LEVELS:
        mappings: dict[str, str] = {}
        for match in ENTRY_RE.finditer(level_texts[level_name]):
            word = normalize_whitespace(match.group("word"))
            meaning = clean_meaning(match.group("meaning"))
            if word and meaning:
                mappings[word] = meaning
        extracted[level_name] = mappings

    return extracted


def main() -> int:
    pdf_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("大考中心L1L6.pdf")
    output_path = (
        Path(sys.argv[2]) if len(sys.argv) > 2 else Path("outputs") / "ceec_l1l6_pdf_meanings.json"
    )

    data = extract_pdf_meanings(pdf_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    for level_name, mappings in data.items():
        print(level_name, len(mappings))
    print(f"Saved {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
