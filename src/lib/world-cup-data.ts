export type Team = {
  id: string;
  name: string;
  flag: string;
  group: string;
  rank: number;
  elo: number;
  form: number;
  attack: number;
  defense: number;
};

export type Match = {
  id: string;
  time: string;
  group: string;
  homeId: string;
  awayId: string;
  watchValue: number;
  upsetRisk: number;
};

export const teams: Team[] = [
  { id: "bra", name: "巴西", flag: "🇧🇷", group: "C", rank: 5, elo: 1986, form: 82, attack: 88, defense: 81 },
  { id: "mar", name: "摩洛哥", flag: "🇲🇦", group: "C", rank: 14, elo: 1845, form: 78, attack: 76, defense: 84 },
  { id: "fra", name: "法国", flag: "🇫🇷", group: "D", rank: 2, elo: 2021, form: 86, attack: 91, defense: 85 },
  { id: "aus", name: "澳大利亚", flag: "🇦🇺", group: "D", rank: 23, elo: 1754, form: 69, attack: 70, defense: 73 },
  { id: "ger", name: "德国", flag: "🇩🇪", group: "A", rank: 9, elo: 1902, form: 79, attack: 84, defense: 78 },
  { id: "sco", name: "苏格兰", flag: "🏴", group: "A", rank: 39, elo: 1668, form: 65, attack: 68, defense: 70 },
  { id: "arg", name: "阿根廷", flag: "🇦🇷", group: "B", rank: 1, elo: 2058, form: 91, attack: 90, defense: 88 },
  { id: "nga", name: "尼日利亚", flag: "🇳🇬", group: "B", rank: 28, elo: 1726, form: 73, attack: 78, defense: 69 },
  { id: "jpn", name: "日本", flag: "🇯🇵", group: "E", rank: 15, elo: 1832, form: 84, attack: 82, defense: 79 },
  { id: "cro", name: "克罗地亚", flag: "🇭🇷", group: "E", rank: 10, elo: 1888, form: 75, attack: 79, defense: 82 },
  { id: "mex", name: "墨西哥", flag: "🇲🇽", group: "F", rank: 17, elo: 1798, form: 72, attack: 76, defense: 75 },
  { id: "kor", name: "韩国", flag: "🇰🇷", group: "F", rank: 22, elo: 1769, form: 77, attack: 80, defense: 72 },
];

export const matches: Match[] = [
  { id: "m1", time: "18:00", group: "A", homeId: "ger", awayId: "sco", watchValue: 74, upsetRisk: 18 },
  { id: "m2", time: "21:00", group: "C", homeId: "bra", awayId: "mar", watchValue: 94, upsetRisk: 31 },
  { id: "m3", time: "00:00", group: "D", homeId: "fra", awayId: "aus", watchValue: 79, upsetRisk: 21 },
  { id: "m4", time: "03:00", group: "B", homeId: "arg", awayId: "nga", watchValue: 86, upsetRisk: 24 },
];

export const groups = ["A", "B", "C", "D", "E", "F"].map((name) => {
  const groupTeams = teams.filter((team) => team.group === name);
  const averageElo = Math.round(groupTeams.reduce((sum, team) => sum + team.elo, 0) / groupTeams.length);
  return {
    name,
    teams: groupTeams,
    strength: Math.round(55 + (averageElo - 1700) / 8),
    closeness: Math.round(72 - Math.abs(groupTeams[0].elo - groupTeams[1].elo) / 12),
  };
});

export const teamById = new Map(teams.map((team) => [team.id, team]));
