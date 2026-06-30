function normalizeExportCell(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").replace(/\t/g, " ").trim();
}

function buildExportRows(words = []) {
  return words.map((word) => ({
    word: normalizeExportCell(word.word),
    meaning: normalizeExportCell(word.meaning),
    level: normalizeExportCell(word.level),
    example: normalizeExportCell(word.example)
  }));
}

function escapeCsvCell(value) {
  const text = normalizeExportCell(value);

  if (!/[",]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, "\"\"")}"`;
}

export function buildWordListCsv(words = []) {
  const rows = buildExportRows(words);
  const header = ["word", "meaning", "level", "example"];
  const lines = [
    header.join(","),
    ...rows.map((row) => header.map((column) => escapeCsvCell(row[column])).join(","))
  ];

  return `\uFEFF${lines.join("\n")}`;
}

export function buildWordListExportFilename(date = new Date()) {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");

  return `vocabulary-king-word-list-${stamp}.csv`;
}

export function downloadWordListCsv(words, date = new Date()) {
  const content = buildWordListCsv(words);
  const filename = buildWordListExportFilename(date);
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}
