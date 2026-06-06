import scheduleData from "@/data/world-cup-2026-schedule.json";
import historyData from "@/data/history-features.json";

export type Team = {
  id: string;
  sourceName: string;
  name: string;
  flag: string;
  group: string;
  rank: number | null;
  elo: number;
  form: number;
  attack: number;
  defense: number;
};

export type Match = {
  id: string;
  date: string;
  time: null;
  group: string;
  homeId: string;
  awayId: string;
  city: string;
  watchValue: number;
  upsetRisk: number;
};

type TeamSeed = [id: string, sourceName: string, name: string, flag: string, group: string, rank?: number, elo?: number];

const teamSeeds: TeamSeed[] = [
  ["mex", "Mexico", "墨西哥", "🇲🇽", "A", 17, 1798], ["rsa", "South Africa", "南非", "🇿🇦", "A"], ["kor", "South Korea", "韩国", "🇰🇷", "A", 22, 1769], ["cze", "Czech Republic", "捷克", "🇨🇿", "A"],
  ["can", "Canada", "加拿大", "🇨🇦", "B"], ["bih", "Bosnia and Herzegovina", "波黑", "🇧🇦", "B"], ["qat", "Qatar", "卡塔尔", "🇶🇦", "B"], ["sui", "Switzerland", "瑞士", "🇨🇭", "B"],
  ["bra", "Brazil", "巴西", "🇧🇷", "C", 5, 1986], ["mar", "Morocco", "摩洛哥", "🇲🇦", "C", 14, 1845], ["hai", "Haiti", "海地", "🇭🇹", "C"], ["sco", "Scotland", "苏格兰", "🏴", "C", 39, 1668],
  ["usa", "United States", "美国", "🇺🇸", "D"], ["par", "Paraguay", "巴拉圭", "🇵🇾", "D"], ["aus", "Australia", "澳大利亚", "🇦🇺", "D", 23, 1754], ["tur", "Turkey", "土耳其", "🇹🇷", "D"],
  ["ger", "Germany", "德国", "🇩🇪", "E", 9, 1902], ["cuw", "Curaçao", "库拉索", "🇨🇼", "E"], ["civ", "Ivory Coast", "科特迪瓦", "🇨🇮", "E"], ["ecu", "Ecuador", "厄瓜多尔", "🇪🇨", "E"],
  ["ned", "Netherlands", "荷兰", "🇳🇱", "F"], ["jpn", "Japan", "日本", "🇯🇵", "F", 15, 1832], ["swe", "Sweden", "瑞典", "🇸🇪", "F"], ["tun", "Tunisia", "突尼斯", "🇹🇳", "F"],
  ["bel", "Belgium", "比利时", "🇧🇪", "G"], ["egy", "Egypt", "埃及", "🇪🇬", "G"], ["irn", "Iran", "伊朗", "🇮🇷", "G"], ["nzl", "New Zealand", "新西兰", "🇳🇿", "G"],
  ["esp", "Spain", "西班牙", "🇪🇸", "H"], ["cpv", "Cape Verde", "佛得角", "🇨🇻", "H"], ["ksa", "Saudi Arabia", "沙特阿拉伯", "🇸🇦", "H"], ["uru", "Uruguay", "乌拉圭", "🇺🇾", "H"],
  ["fra", "France", "法国", "🇫🇷", "I", 2, 2021], ["sen", "Senegal", "塞内加尔", "🇸🇳", "I"], ["irq", "Iraq", "伊拉克", "🇮🇶", "I"], ["nor", "Norway", "挪威", "🇳🇴", "I"],
  ["arg", "Argentina", "阿根廷", "🇦🇷", "J", 1, 2058], ["alg", "Algeria", "阿尔及利亚", "🇩🇿", "J"], ["aut", "Austria", "奥地利", "🇦🇹", "J"], ["jor", "Jordan", "约旦", "🇯🇴", "J"],
  ["por", "Portugal", "葡萄牙", "🇵🇹", "K"], ["cod", "DR Congo", "刚果（金）", "🇨🇩", "K"], ["uzb", "Uzbekistan", "乌兹别克斯坦", "🇺🇿", "K"], ["col", "Colombia", "哥伦比亚", "🇨🇴", "K"],
  ["eng", "England", "英格兰", "🏴", "L"], ["cro", "Croatia", "克罗地亚", "🇭🇷", "L", 10, 1888], ["gha", "Ghana", "加纳", "🇬🇭", "L"], ["pan", "Panama", "巴拿马", "🇵🇦", "L"],
];

export const teams: Team[] = teamSeeds.map(([id, sourceName, name, flag, group, rank = null, seedElo]) => {
  const history = historyData.teamFeatures[id as keyof typeof historyData.teamFeatures];
  return {
    id,
    sourceName,
    name,
    flag,
    group,
    rank,
    elo: history?.eloRating ?? seedElo ?? 1500,
    form: history?.formScore ?? 70,
    attack: history?.attackScore ?? 70,
    defense: history?.defenseScore ?? 70,
  };
});

export const teamById = new Map(teams.map((team) => [team.id, team]));
export const teamBySourceName = new Map(teams.map((team) => [team.sourceName, team]));

export const matches: Match[] = scheduleData.matches.map((match) => ({
  id: match.id,
  date: match.date,
  time: null,
  group: match.group,
  homeId: teamBySourceName.get(match.homeSourceName)!.id,
  awayId: teamBySourceName.get(match.awaySourceName)!.id,
  city: match.city,
  watchValue: 75,
  upsetRisk: 25,
}));

export const availableMatchDates = [...new Set(matches.map((match) => match.date))];

export const groups = "ABCDEFGHIJKL".split("").map((name) => {
  const groupTeams = teams.filter((team) => team.group === name);
  const averageElo = Math.round(groupTeams.reduce((sum, team) => sum + team.elo, 0) / groupTeams.length);
  const sortedElo = groupTeams.map((team) => team.elo).toSorted((a, b) => b - a);
  return {
    name,
    teams: groupTeams,
    strength: Math.round(55 + (averageElo - 1650) / 7),
    closeness: Math.round(80 - (sortedElo[0] - sortedElo.at(-1)!) / 10),
  };
});

export const scheduleMetadata = scheduleData.metadata;
