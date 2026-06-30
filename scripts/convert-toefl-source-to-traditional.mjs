import fs from "node:fs";
import path from "node:path";
import OpenCC from "opencc-js";

const sourcePath = path.resolve("Source/toefl.json");
const converter = OpenCC.Converter({ from: "cn", to: "tw" });

function convertValue(value, stats) {
  if (typeof value === "string") {
    const converted = converter(value);

    if (converted !== value) {
      stats.changedStrings += 1;
    }

    stats.totalStrings += 1;
    return converted;
  }

  if (Array.isArray(value)) {
    return value.map((item) => convertValue(item, stats));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, convertValue(child, stats)]));
  }

  return value;
}

const payload = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const stats = {
  totalStrings: 0,
  changedStrings: 0
};
const converted = convertValue(payload, stats);

fs.writeFileSync(sourcePath, JSON.stringify(converted, null, 2) + "\n", "utf8");

console.log(
  JSON.stringify(
    {
      sourcePath,
      entries: Array.isArray(converted) ? converted.length : 0,
      totalStrings: stats.totalStrings,
      changedStrings: stats.changedStrings
    },
    null,
    2
  )
);
