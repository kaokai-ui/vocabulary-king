import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("Source/toefl.json");
const listPath = path.resolve("Source/toefl-name-animal-place-list.md");

const listContent = fs.readFileSync(listPath, "utf8").replace(/^\uFEFF/, "");
const entries = JSON.parse(fs.readFileSync(sourcePath, "utf8").replace(/^\uFEFF/, ""));

const listedHeadwords = new Set(
  listContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^- ([A-Za-z][^：]*)：/);
      return match?.[1]?.trim() ?? null;
    })
    .filter(Boolean)
);

const kept = [];
const removed = [];

for (const entry of entries) {
  const headWord = String(entry?.headWord ?? "").trim();

  if (listedHeadwords.has(headWord)) {
    removed.push(headWord);
    continue;
  }

  kept.push(entry);
}

fs.writeFileSync(sourcePath, JSON.stringify(kept, null, 2) + "\n", "utf8");

console.log(
  JSON.stringify(
    {
      sourcePath,
      listPath,
      listedHeadwordCount: listedHeadwords.size,
      beforeCount: entries.length,
      afterCount: kept.length,
      removedCount: removed.length,
      missingFromSource: [...listedHeadwords].filter((headWord) => !removed.includes(headWord)),
      removedHeadwords: removed
    },
    null,
    2
  )
);
