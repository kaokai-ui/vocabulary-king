from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


ROW_RE = re.compile(
    r"^\s*\d+\s+(.+?)\s+(名詞|動詞|形容詞|副詞|介系詞|代名詞|限定詞|連接詞|助動詞|感嘆詞)\s+(.+?)\s*$"
)
SKIP_LINES = {"國中單字王 2000 單字題庫表(字母)", "114 年版"}


def extract_rows(pdf_path: Path) -> list[dict[str, str]]:
    reader = PdfReader(str(pdf_path))
    rows: list[dict[str, str]] = []

    for page in reader.pages:
        lines = [line.strip() for line in (page.extract_text() or "").splitlines()]
        index = 0
        while index < len(lines):
            line = lines[index]
            if not line or line in SKIP_LINES or re.fullmatch(r"\d+", line):
                index += 1
                continue

            match = ROW_RE.match(line)
            if not match:
                index += 1
                continue

            word = match.group(1).strip()
            meaning = match.group(3).strip()
            index += 1

            while index < len(lines):
                next_line = lines[index].strip()
                if not next_line or next_line in SKIP_LINES or re.fullmatch(r"\d+", next_line):
                    index += 1
                    continue
                if ROW_RE.match(next_line):
                    break
                meaning += next_line
                index += 1

            rows.append({"word": word, "meaning": meaning})

    return rows


def main() -> int:
    pdf_path = (
        Path(sys.argv[1]) if len(sys.argv) > 1 else Path("國中單字王 2000 .pdf")
    )
    output_path = (
        Path(sys.argv[2])
        if len(sys.argv) > 2
        else Path("outputs") / "juniorhigh2000_pdf_meanings.json"
    )

    rows = extract_rows(pdf_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"Rows: {len(rows)}")
    print(f"Saved {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
