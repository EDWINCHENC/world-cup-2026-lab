import type { Team } from "@/lib/world-cup-data";
import { getHeadToHead, getTeamHistory } from "@/lib/history";

export type Prediction = {
  home: number;
  draw: number;
  away: number;
  confidence: number;
  upsetRisk: number;
  factors: { label: string; value: string; impact: "home" | "away" | "neutral" }[];
};

const logistic = (difference: number) => 1 / (1 + 10 ** (-difference / 400));

export function predictMatch(home: Team, away: Team, historyWeight = 15): Prediction {
  const homeHistory = getTeamHistory(home.id);
  const awayHistory = getTeamHistory(away.id);
  const headToHead = getHeadToHead(home.id, away.id);
  const eloHome = logistic(home.elo - away.elo);
  const homeForm = homeHistory?.formScore ?? home.form;
  const awayForm = awayHistory?.formScore ?? away.form;
  const homeAttack = homeHistory?.attackScore ?? home.attack;
  const awayAttack = awayHistory?.attackScore ?? away.attack;
  const homeDefense = homeHistory?.defenseScore ?? home.defense;
  const awayDefense = awayHistory?.defenseScore ?? away.defense;
  const formHome = Math.min(0.88, Math.max(0.12, 0.5 + (homeForm - awayForm) / 100));
  const scoringHome = Math.min(
    0.88,
    Math.max(0.12, 0.5 + (homeAttack - awayDefense - (awayAttack - homeDefense)) / 100),
  );
  const historyReliability = headToHead ? headToHead.effectiveSample / (headToHead.effectiveSample + 1.5) : 0;
  const historicalHome = headToHead
    ? 0.5 + (headToHead.weightedHomeScore - 0.5) * historyReliability
    : 0.5;

  const historyShare = historyWeight / 100;
  const rawHome =
    eloHome * 0.42 +
    formHome * 0.23 +
    scoringHome * (0.35 - historyShare) +
    historicalHome * historyShare;
  const draw = Math.max(0.18, 0.29 - Math.abs(rawHome - 0.5) * 0.2);
  const remaining = 1 - draw;
  const homeWin = Math.min(0.82, Math.max(0.08, rawHome * remaining));
  const awayWin = remaining - homeWin;
  const agreement = 1 - Math.abs(eloHome - formHome) * 0.7;
  const dataCoverage = Math.min(1, ((homeHistory?.recentMatchesUsed ?? 0) + (awayHistory?.recentMatchesUsed ?? 0)) / 40);
  const headToHeadLabel = headToHead?.meetings
    ? `${headToHead.meetings}次交锋：${home.name}${headToHead.homeWins}胜 ${headToHead.draws}平 ${headToHead.awayWins}负`
    : "暂无直接交锋，已回归整体实力";

  return {
    home: Math.round(homeWin * 100),
    draw: Math.round(draw * 100),
    away: Math.round(awayWin * 100),
    confidence: Math.round(62 + agreement * 18 + dataCoverage * 8),
    upsetRisk: Math.round(Math.min(homeWin, awayWin) * 100 + draw * 45),
    factors: [
      {
        label: "长期实力",
        value: `${Math.abs(home.elo - away.elo)} Elo 差距`,
        impact: home.elo >= away.elo ? "home" : "away",
      },
      {
        label: "真实历史交锋",
        value: headToHeadLabel,
        impact: historicalHome > 0.52 ? "home" : historicalHome < 0.48 ? "away" : "neutral",
      },
      {
        label: "近期状态",
        value: `${home.name} ${homeHistory?.recentRecord.wins ?? 0}胜${homeHistory?.recentRecord.draws ?? 0}平 · ${away.name} ${awayHistory?.recentRecord.wins ?? 0}胜${awayHistory?.recentRecord.draws ?? 0}平`,
        impact: homeForm >= awayForm ? "home" : "away",
      },
    ],
  };
}
