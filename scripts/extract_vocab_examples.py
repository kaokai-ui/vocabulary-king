from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


ENTRY_RE = re.compile(r"(?P<word>[A-Za-z][A-Za-z0-9 .'\-]*?)\s+/[^/]+/\s+\([^)]+\)")
SECTION_HEADER_RE = re.compile(
    r"\d+\.\s*字\s*彙\s*7000.*?(?=[A-Za-z][A-Za-z0-9 .'\-]*\s+/)"
)


def normalize_page_text(text: str) -> str:
    text = text.replace("ﬁ", "fi").replace("ﬂ", "fl")
    text = text.replace("\n", " ")
    text = re.sub(r"\s+", " ", text)
    text = SECTION_HEADER_RE.sub("", text)
    return text.strip()


def compress_cjk_spacing(text: str) -> str:
    text = re.sub(r"\s*\.\.\.\s*", "...", text)
    text = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])", "", text)
    text = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[、，。：；？！）])", "", text)
    text = re.sub(r"(?<=[（(])\s+(?=[\u4e00-\u9fff])", "", text)
    text = re.sub(r"(?<=[\u4e00-\u9fff])\s+(?=[）)])", "", text)
    text = re.sub(r"(?<=[、（(])\s+(?=[\u4e00-\u9fff])", "", text)
    return text.strip()


def normalize_example(text: str) -> str:
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"\(\s+", "(", text)
    text = re.sub(r"\s+\)", ")", text)
    text = compress_cjk_spacing(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def extract_rows(pdf_path: Path) -> list[dict[str, str]]:
    reader = PdfReader(str(pdf_path))
    rows: list[dict[str, str]] = []

    for page_number, page in enumerate(reader.pages, start=1):
        text = normalize_page_text(page.extract_text() or "")

        matches = list(ENTRY_RE.finditer(text))
        for index, match in enumerate(matches):
            start = match.start()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
            chunk = text[start:end].strip()

            body = chunk[match.end() - match.start() :].strip()
            example_start = re.search(r"[A-Za-z]", body)
            if not example_start:
                raise ValueError(f"Could not find example sentence on page {page_number}: {chunk}")

            meaning = compress_cjk_spacing(body[: example_start.start()].strip())
            example = normalize_example(body[example_start.start() :].strip())
            word = re.sub(r"\s+", " ", match.group("word")).strip()

            rows.append(
                {
                    "英文單字": word,
                    "意思": meaning,
                    "例句": example,
                }
            )

    return rows


def main() -> int:
    pdf_path = (
        Path(sys.argv[1])
        if len(sys.argv) > 1
        else Path("senior") / "英文單字 7000_ + 例如.pdf"
    )
    output_path = (
        Path(sys.argv[2])
        if len(sys.argv) > 2
        else Path("outputs") / "vocab_examples.json"
    )

    rows = extract_rows(pdf_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Rows: {len(rows)}")
    print(f"Saved {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
