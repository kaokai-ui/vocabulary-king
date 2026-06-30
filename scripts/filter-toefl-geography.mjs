import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("Source/toefl.json");

const removedHeadwords = new Set([
  "Afghanistan",
  "Africa",
  "African",
  "Alaska",
  "Alaskan",
  "Amsterdam",
  "Arab",
  "Arabian",
  "Athens",
  "Athenian",
  "Atlantic",
  "Australian",
  "Austrian",
  "Baltic",
  "Berlin",
  "Boston",
  "British",
  "Caledonian",
  "California",
  "Californian",
  "Caribbean",
  "Chicago",
  "Chile",
  "Cincinnati",
  "Columbia",
  "Cuban",
  "Denmark",
  "Dutch",
  "Dutchman",
  "Egypt",
  "Euphrates",
  "Eurasia",
  "Eurasian",
  "Finnish",
  "Florida",
  "French",
  "Galilean",
  "Georgia",
  "German",
  "Grecian",
  "Greece",
  "Greek",
  "Guinea",
  "Haiti",
  "Hampshire",
  "Harlem",
  "Hawaii",
  "Himalaya",
  "Hispanic",
  "Hollywood",
  "Holland",
  "Iceland",
  "Illinois",
  "Indian",
  "Indiana",
  "Indonesia",
  "Indus",
  "Interstate",
  "Iraq",
  "Irish",
  "Israel",
  "Italian",
  "Italy",
  "Kenya",
  "London",
  "Lowa",
  "Maine",
  "Manhattan",
  "Marseille",
  "Massachusetts",
  "Mediterranean",
  "Mexican",
  "Mexico",
  "Miami",
  "Michigan",
  "Minneapolis",
  "Minnesota",
  "Mississippi",
  "Mississippian",
  "Missouri",
  "Mongolia",
  "Netherland",
  "Netherlands",
  "Nevada",
  "Norway",
  "Norwegian",
  "Oakland",
  "Oceania",
  "Ohio",
  "Oklahoma",
  "Ontario",
  "Oregon",
  "Pakistan",
  "Paris",
  "Parisian",
  "Pennsylvania",
  "Peru",
  "Philadelphia",
  "Philippine",
  "Portugal",
  "Reykjavik",
  "Rome",
  "Russian",
  "Scotland",
  "Scottish",
  "Seattle",
  "Soviet",
  "Spain",
  "Spanish",
  "Stamford",
  "Sweden",
  "Swiss",
  "Switzerland",
  "Tasmania",
  "Tennessee",
  "Texas",
  "Thai",
  "Thailand",
  "Thames",
  "Toronto",
  "Turkic",
  "Utah",
  "Vancouver",
  "Venice",
  "Virginian",
  "Washington",
  "Washingtonian",
  "Yorkshire",
  "Yucatan",
  "Zealand"
]);

const entries = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
const removed = [];
const kept = [];

for (const entry of entries) {
  const headWord = String(entry?.headWord ?? "").trim();

  if (removedHeadwords.has(headWord)) {
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
      beforeCount: entries.length,
      afterCount: kept.length,
      removedCount: removed.length,
      removedHeadwords: removed
    },
    null,
    2
  )
);
