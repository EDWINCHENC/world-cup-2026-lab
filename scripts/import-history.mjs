import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "csv-parse";

const sourcePath = resolve("data/raw/international-results/results.csv");
const outputPath = resolve("src/data/history-features.json");
const halfLifeDays = 365.25 * 2.5;
const recentMatchLimit = 20;

const teamNames = {
  alg: "Algeria",
  arg: "Argentina",
  aus: "Australia",
  aut: "Austria",
  bel: "Belgium",
  bih: "Bosnia and Herzegovina",
  bra: "Brazil",
  can: "Canada",
  cpv: "Cape Verde",
  col: "Colombia",
  cod: "DR Congo",
  cro: "Croatia",
  cuw: "Curaçao",
  cze: "Czech Republic",
  ecu: "Ecuador",
  egy: "Egypt",
  eng: "England",
  fra: "France",
  ger: "Germany",
  gha: "Ghana",
  hai: "Haiti",
  irn: "Iran",
  irq: "Iraq",
  civ: "Ivory Coast",
  jpn: "Japan",
  jor: "Jordan",
  kor: "South Korea",
  mar: "Morocco",
  mex: "Mexico",
  ned: "Netherlands",
  nzl: "New Zealand",
  nga: "Nigeria",
  nor: "Norway",
  pan: "Panama",
  par: "Paraguay",
  por: "Portugal",
  qat: "Qatar",
  ksa: "Saudi Arabia",
  sen: "Senegal",
  sco: "Scotland",
  rsa: "South Africa",
  esp: "Spain",
  swe: "Sweden",
  sui: "Switzerland",
  tun: "Tunisia",
  tur: "Turkey",
  usa: "United States",
  uru: "Uruguay",
  uzb: "Uzbekistan",
};

const playedMatches = [];

const parser = createReadStream(sourcePath).pipe(
  parse({
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }),
);

for await (const row of parser) {
  const homeScore = Number(row.home_score);
  const awayScore = Number(row.away_score);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;

  playedMatches.push({
    date: row.date,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeScore,
    awayScore,
    tournament: row.tournament,
    neutral: row.neutral === "TRUE",
  });
}

playedMatches.sort((a, b) => a.date.localeCompare(b.date));
const latestPlayedDate = playedMatches.at(-1)?.date;
if (!latestPlayedDate) throw new Error("No played matches found in source data.");
const referenceTime = Date.parse(`${latestPlayedDate}T00:00:00Z`);
const eloRatings = new Map();

function tournamentWeight(tournament) {
  if (tournament === "FIFA World Cup") return 1.35;
  if (tournament.includes("World Cup qualification")) return 1.2;
  if (tournament.includes("UEFA Nations League")) return 1.1;
  if (tournament === "Friendly") return 0.65;
  return 1;
}

function recencyWeight(date) {
  const ageDays = Math.max(0, (referenceTime - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  return 0.5 ** (ageDays / halfLifeDays);
}

function matchWeight(match) {
  return recencyWeight(match.date) * tournamentWeight(match.tournament);
}

function getElo(teamName) {
  return eloRatings.get(teamName) ?? 1500;
}

for (const match of playedMatches) {
  const homeElo = getElo(match.homeTeam);
  const awayElo = getElo(match.awayTeam);
  const homeAdvantage = match.neutral ? 0 : 70;
  const expectedHome = 1 / (1 + 10 ** (-(homeElo + homeAdvantage - awayElo) / 400));
  const actualHome = match.homeScore > match.awayScore ? 1 : match.homeScore < match.awayScore ? 0 : 0.5;
  const change = 22 * tournamentWeight(match.tournament) * (actualHome - expectedHome);
  eloRatings.set(match.homeTeam, homeElo + change);
  eloRatings.set(match.awayTeam, awayElo - change);
}

function withoutWeight(match) {
  return {
    date: match.date,
    opponent: match.opponent,
    goalsFor: match.goalsFor,
    goalsAgainst: match.goalsAgainst,
    result: match.result,
    tournament: match.tournament,
    neutral: match.neutral,
  };
}

function teamPerspective(match, teamName) {
  const isHome = match.homeTeam === teamName;
  const goalsFor = isHome ? match.homeScore : match.awayScore;
  const goalsAgainst = isHome ? match.awayScore : match.homeScore;
  return {
    date: match.date,
    opponent: isHome ? match.awayTeam : match.homeTeam,
    goalsFor,
    goalsAgainst,
    result: goalsFor > goalsAgainst ? "W" : goalsFor < goalsAgainst ? "L" : "D",
    tournament: match.tournament,
    neutral: match.neutral,
    isHome,
    weight: matchWeight(match),
  };
}

function buildTeamFeature(id, teamName) {
  const matches = playedMatches
    .filter((match) => match.homeTeam === teamName || match.awayTeam === teamName)
    .map((match) => teamPerspective(match, teamName))
    .toReversed();
  const recent = matches.slice(0, recentMatchLimit);
  const totalWeight = recent.reduce((sum, match) => sum + match.weight, 0) || 1;
  const weightedPoints = recent.reduce((sum, match) => sum + match.weight * (match.result === "W" ? 3 : match.result === "D" ? 1 : 0), 0);
  const weightedGoalsFor = recent.reduce((sum, match) => sum + match.weight * match.goalsFor, 0) / totalWeight;
  const weightedGoalsAgainst = recent.reduce((sum, match) => sum + match.weight * match.goalsAgainst, 0) / totalWeight;
  const weightedPerformanceResidual = recent.reduce((sum, match) => {
    const venueAdjustment = match.neutral ? 0 : match.isHome ? 70 : -70;
    const expected = 1 / (1 + 10 ** (-(getElo(teamName) + venueAdjustment - getElo(match.opponent)) / 400));
    const actual = match.result === "W" ? 1 : match.result === "D" ? 0.5 : 0;
    return sum + match.weight * (actual - expected);
  }, 0) / totalWeight;

  return {
    id,
    sourceName: teamName,
    matchesAvailable: matches.length,
    recentMatchesUsed: recent.length,
    lastMatchDate: matches[0]?.date ?? null,
    eloRating: Math.round(getElo(teamName)),
    formScore: Math.round((weightedPoints / (3 * totalWeight)) * 100),
    adjustedFormScore: Math.round(Math.max(0, Math.min(100, 50 + weightedPerformanceResidual * 75))),
    attackScore: Math.round(Math.min(100, 45 + weightedGoalsFor * 22)),
    defenseScore: Math.round(Math.max(0, 100 - weightedGoalsAgainst * 27)),
    recentRecord: {
      wins: recent.filter((match) => match.result === "W").length,
      draws: recent.filter((match) => match.result === "D").length,
      losses: recent.filter((match) => match.result === "L").length,
    },
    recent: recent.slice(0, 8).map(withoutWeight),
  };
}

function pairKey(teamAId, teamBId) {
  return [teamAId, teamBId].toSorted().join("__");
}

function buildHeadToHead(teamAId, teamBId) {
  const teamAName = teamNames[teamAId];
  const teamBName = teamNames[teamBId];
  const matches = playedMatches
    .filter(
      (match) =>
        (match.homeTeam === teamAName && match.awayTeam === teamBName) ||
        (match.homeTeam === teamBName && match.awayTeam === teamAName),
    )
    .map((match) => ({
      ...teamPerspective(match, teamAName),
      weight: matchWeight(match),
    }))
    .toReversed();

  const totalWeight = matches.reduce((sum, match) => sum + match.weight, 0);
  const weightedTeamAScore =
    totalWeight === 0
      ? 0.5
      : matches.reduce(
          (sum, match) => sum + match.weight * (match.result === "W" ? 1 : match.result === "D" ? 0.5 : 0),
          0,
        ) / totalWeight;

  return {
    teamAId,
    teamBId,
    meetings: matches.length,
    effectiveSample: Number(totalWeight.toFixed(2)),
    weightedTeamAScore: Number(weightedTeamAScore.toFixed(4)),
    lastMeetingDate: matches[0]?.date ?? null,
    teamAWins: matches.filter((match) => match.result === "W").length,
    draws: matches.filter((match) => match.result === "D").length,
    teamBWins: matches.filter((match) => match.result === "L").length,
    recent: matches.slice(0, 6).map(withoutWeight),
  };
}

const teamFeatures = Object.fromEntries(
  Object.entries(teamNames).map(([id, name]) => [id, buildTeamFeature(id, name)]),
);
const headToHead = {};
const teamIds = Object.keys(teamNames);

for (let i = 0; i < teamIds.length; i += 1) {
  for (let j = i + 1; j < teamIds.length; j += 1) {
    const key = pairKey(teamIds[i], teamIds[j]);
    const [teamAId, teamBId] = key.split("__");
    headToHead[key] = buildHeadToHead(teamAId, teamBId);
  }
}

const output = {
  metadata: {
    source: "martj42/international_results",
    sourceUrl: "https://github.com/martj42/international_results",
    license: "CC0-1.0",
    latestPlayedDate,
    totalPlayedMatches: playedMatches.length,
    recentMatchLimit,
    recencyHalfLifeYears: 2.5,
  },
  teamFeatures,
  headToHead,
};

await mkdir(resolve("src/data"), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(`Imported ${playedMatches.length.toLocaleString()} played matches.`);
console.log(`Latest played match: ${latestPlayedDate}.`);
console.log(`Generated features for ${teamIds.length} teams and ${Object.keys(headToHead).length} pairings.`);
