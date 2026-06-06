import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "csv-parse";

const sourcePath = resolve("data/raw/international-results/results.csv");
const outputPath = resolve("src/data/world-cup-2026-schedule.json");

const groups = {
  A: ["Mexico", "South Africa", "South Korea", "Czech Republic"],
  B: ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"],
  C: ["Brazil", "Morocco", "Haiti", "Scotland"],
  D: ["United States", "Paraguay", "Australia", "Turkey"],
  E: ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
  F: ["Netherlands", "Japan", "Sweden", "Tunisia"],
  G: ["Belgium", "Egypt", "Iran", "New Zealand"],
  H: ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
  I: ["France", "Senegal", "Iraq", "Norway"],
  J: ["Argentina", "Algeria", "Austria", "Jordan"],
  K: ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
  L: ["England", "Croatia", "Ghana", "Panama"],
};

const groupByTeam = new Map(
  Object.entries(groups).flatMap(([group, teams]) => teams.map((team) => [team, group])),
);
const matches = [];
const parser = createReadStream(sourcePath).pipe(parse({ columns: true, skip_empty_lines: true, trim: true }));

for await (const row of parser) {
  if (row.tournament !== "FIFA World Cup" || !row.date.startsWith("2026-06-")) continue;
  const group = groupByTeam.get(row.home_team);
  if (!group || group !== groupByTeam.get(row.away_team)) continue;

  matches.push({
    id: `wc26-${matches.length + 1}`,
    date: row.date,
    group,
    homeSourceName: row.home_team,
    awaySourceName: row.away_team,
    city: row.city,
    country: row.country,
    neutral: row.neutral === "TRUE",
    kickoffStatus: "TBD",
  });
}

matches.sort((a, b) => a.date.localeCompare(b.date) || a.group.localeCompare(b.group));

await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      metadata: {
        source: "martj42/international_results",
        competition: "FIFA World Cup",
        edition: 2026,
        stage: "Group stage",
        kickoffTimesAvailable: false,
        matchCount: matches.length,
      },
      groups,
      matches,
    },
    null,
    2,
  )}\n`,
);

console.log(`Generated ${matches.length} confirmed group-stage fixtures across ${Object.keys(groups).length} groups.`);
