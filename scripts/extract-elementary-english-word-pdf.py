from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from pypdf import PdfReader


PROJECT_ROOT = Path.cwd()
SOURCE_PDF = PROJECT_ROOT / "Source" / "elementary.english_word_m.pdf"
OUTPUT_BASENAME = "elementary.english_word_m.extracted"

MANUAL_WORD_FIXES = {
    1: "a (an)",
    28: "a.m.",
    113: "bored",
    121: "bow",
    155: "cap",
    166: "cell phone",
    180: "chicken",
    206: "Coke",
    228: "cousin",
    229: "cover",
    238: "dance",
    250: "department store",
    257: "dining room",
    263: "dodge ball",
    270: "dozen",
    274: "dream",
    290: "Easter",
    299: "elementary school",
    344: "face",
    353: "favorite",
    397: "forty",
    387: "French fries",
    410: "giraffe",
    420: "green",
    452: "have",
    455: "he",
    472: "high school",
    483: "how",
    488: "hundred",
    503: "jacket",
    512: "juice",
    513: "July",
    514: "jump",
    516: "junior high school",
    522: "know",
    523: "koala",
    533: "library",
    544: "love",
    571: "Monday",
    579: "must",
    580: "my",
    590: "newspaper",
    603: "north",
    619: "one",
    646: "p.m.",
    655: "piano",
    661: "playground",
    669: "pretty",
    671: "put",
    676: "rabbit",
    700: "restroom",
    701: "rice",
    708: "robot",
    702: "o'clock",
    742: "Saturday",
    768: "shake",
    811: "somebody",
    814: "sometime",
    903: "shoe(s)",
    954: "someone / somebody",
    984: "(beef) steak",
    1005: "sunny",
    1006: "supermarket",
    1035: "tenth",
    1051: "third",
    1054: "thirteenth",
    1065: "tidy",
    1079: "tooth",
    1089: "treat",
    1108: "two",
    1114: "understand",
    1119: "USA",
    1177: "without",
    1200: "zoo",
}

MANUAL_MEANING_FIXES = {
    1097: "T 恤",
}

VALID_MULTIWORD_WORDS = {
    "(beef) steak",
    "a (an)",
    "a few",
    "a little",
    "a lot",
    "cell phone",
    "department store",
    "dining room",
    "dodge ball",
    "elementary school",
    "French fries",
    "high school",
    "junior high school",
    "someone / somebody",
}


def read_pdf_text() -> str:
    reader = PdfReader(str(SOURCE_PDF))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


def collapse_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def strip_headers(text: str) -> str:
    cleaned_lines = []

    for line in text.splitlines():
        normalized_line = line.strip().replace("\u3000", " ")

        if "1200" in normalized_line and "(" in normalized_line and ")" in normalized_line:
            continue

        cleaned_lines.append(normalized_line)

    return "\n".join(cleaned_lines)


def remove_duplicate_phrase(text: str) -> str:
    value = collapse_spaces(text)
    parts = value.split()

    if len(parts) % 2 == 0 and parts[: len(parts) // 2] == parts[len(parts) // 2 :]:
        return " ".join(parts[: len(parts) // 2])

    deduped = []

    for part in parts:
        if deduped and deduped[-1].lower() == part.lower():
            continue

        deduped.append(part)

    return " ".join(deduped)


def normalize_word(raw_word: str, number: int) -> str:
    if number in MANUAL_WORD_FIXES:
        return MANUAL_WORD_FIXES[number]

    word = remove_duplicate_phrase(raw_word)
    word = re.sub(r"\s+([,.)])", r"\1", word)
    word = re.sub(r"([(])\s+", r"\1", word)
    word = word.replace(" / ", "/")
    word = collapse_spaces(word)

    if word.lower() not in VALID_MULTIWORD_WORDS and "/" not in word:
        compact = word.replace(" ", "")

        if re.fullmatch(r"[A-Za-z().'-]+", compact):
            return compact

    return word


def split_numbered_segments(line: str) -> list[str]:
    normalized_line = line.replace("\u3000", " ").strip()

    if not normalized_line:
        return []

    segments = re.split(r"(?:(?<=^)|(?<=\s))(?=\d{1,4}\.\s*)", normalized_line)
    return [segment.strip() for segment in segments if segment.strip()]


def split_meaning_and_word(text: str) -> tuple[str, str]:
    normalized_text = collapse_spaces(text)

    if normalized_text and not re.search(r"[\u4e00-\u9fff]", normalized_text):
        return "", normalized_text

    first_english_match = re.search(r"[A-Za-z]", normalized_text)

    if not first_english_match:
        return normalized_text, ""

    split_index = first_english_match.start()
    return normalized_text[:split_index].strip(" ,;"), normalized_text[split_index:].strip()


def finalize_entry(current: dict[str, object] | None, rows: list[dict[str, str | int]]) -> None:
    if not current:
        return

    number = int(current["number"])
    meaning = collapse_spaces(" ".join(current["meaning_parts"]))
    raw_word = collapse_spaces(" ".join(current["word_parts"]))
    word = normalize_word(raw_word, number)

    if not meaning or not word:
        return

    rows.append(
        {
            "number": number,
            "word": word,
            "meaning": meaning,
            "raw_word": raw_word,
        }
    )


def parse_entries(text: str) -> list[dict[str, str | int]]:
    cleaned_text = strip_headers(text)
    rows = []
    current: dict[str, object] | None = None

    for raw_line in cleaned_text.splitlines():
        for segment in split_numbered_segments(raw_line):
            match = re.match(r"^(\d{1,4})\.\s*(.*)$", segment)

            if match:
                finalize_entry(current, rows)
                number = int(match.group(1))
                segment_meaning, segment_word = split_meaning_and_word(match.group(2))

                if number in MANUAL_MEANING_FIXES:
                    segment_meaning = MANUAL_MEANING_FIXES[number]
                    segment_word = ""

                current = {
                    "number": number,
                    "meaning_parts": [segment_meaning] if segment_meaning else [],
                    "word_parts": [segment_word] if segment_word else [],
                }
                continue

            if not current:
                continue

            segment_meaning, segment_word = split_meaning_and_word(segment)

            if segment_word:
                if segment_meaning:
                    current["meaning_parts"].append(segment_meaning)

                current["word_parts"].append(segment_word)
            elif not current["word_parts"]:
                current["meaning_parts"].append(segment_meaning)
            else:
                current["word_parts"].append(segment_meaning)

    finalize_entry(current, rows)
    return rows


def build_suspicious_rows(rows: list[dict[str, str | int]]) -> list[dict[str, str | int]]:
    suspicious = []

    for row in rows:
        word = str(row["word"])
        normalized_word = word.lower()

        if normalized_word in {value.lower() for value in VALID_MULTIWORD_WORDS}:
            continue

        if re.search(r"\b[a-zA-Z]{1,3}\s+[a-zA-Z]{1,3}\b", word):
            suspicious.append(row)
            continue

        if "  " in word or word.endswith("/") or word.startswith("/"):
            suspicious.append(row)
            continue

        if " " in word and "/" not in word:
            suspicious.append(row)

    return suspicious


def write_csv(rows: list[dict[str, str | int]], file_path: Path) -> None:
    with file_path.open("w", encoding="utf-8-sig", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=["number", "word", "meaning"])
        writer.writeheader()

        for row in rows:
            writer.writerow(
                {
                    "number": row["number"],
                    "word": row["word"],
                    "meaning": row["meaning"],
                }
            )


def write_json(rows: list[dict[str, str | int]], file_path: Path) -> None:
    payload = [
        {
            "number": row["number"],
            "word": row["word"],
            "meaning": row["meaning"],
        }
        for row in rows
    ]
    file_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_markdown(rows: list[dict[str, str | int]], file_path: Path) -> None:
    lines = ["# Elementary English Word 1200", "", "| No. | Word | Meaning |", "| --- | --- | --- |"]

    for row in rows:
        word = str(row["word"]).replace("|", "\\|")
        meaning = str(row["meaning"]).replace("|", "\\|")
        lines.append(f"| {row['number']} | {word} | {meaning} |")

    file_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_suspicious_report(rows: list[dict[str, str | int]], file_path: Path) -> None:
    lines = ["# Suspicious Extracted Entries", ""]

    for row in rows:
        lines.append(f"- {row['number']}: `{row['word']}` <- raw: `{row['raw_word']}` / meaning: {row['meaning']}")

    file_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    text = read_pdf_text()
    rows = parse_entries(text)
    suspicious_rows = build_suspicious_rows(rows)

    if len(rows) != 1200:
        raise ValueError(f"Expected 1200 entries, got {len(rows)}")

    output_dir = SOURCE_PDF.parent
    csv_path = output_dir / f"{OUTPUT_BASENAME}.csv"
    json_path = output_dir / f"{OUTPUT_BASENAME}.json"
    md_path = output_dir / f"{OUTPUT_BASENAME}.md"
    suspicious_path = output_dir / f"{OUTPUT_BASENAME}.suspicious.md"

    write_csv(rows, csv_path)
    write_json(rows, json_path)
    write_markdown(rows, md_path)
    write_suspicious_report(suspicious_rows, suspicious_path)

    print(f"Extracted entries: {len(rows)}")
    print(f"CSV: {csv_path}")
    print(f"JSON: {json_path}")
    print(f"Markdown: {md_path}")
    print(f"Suspicious entries: {len(suspicious_rows)}")
    print(f"Suspicious report: {suspicious_path}")


if __name__ == "__main__":
    main()
