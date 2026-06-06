import type { Team } from "@/lib/world-cup-data";

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
  const eloHome = logistic(home.elo - away.elo);
  const formHome = 0.5 + (home.form - away.form) / 100;
  const scoringHome = 0.5 + (home.attack - away.defense - (away.attack - home.defense)) / 100;
  const syntheticHistory = 0.5 + ((home.id.charCodeAt(0) - away.id.charCodeAt(0)) % 9) / 100;

  const historyShare = historyWeight / 100;
  const rawHome =
    eloHome * 0.42 +
    formHome * 0.23 +
    scoringHome * (0.35 - historyShare) +
    syntheticHistory * historyShare;
  const draw = Math.max(0.18, 0.29 - Math.abs(rawHome - 0.5) * 0.2);
  const remaining = 1 - draw;
  const homeWin = Math.min(0.82, Math.max(0.08, rawHome * remaining));
  const awayWin = remaining - homeWin;
  const agreement = 1 - Math.abs(eloHome - formHome) * 0.7;

  return {
    home: Math.round(homeWin * 100),
    draw: Math.round(draw * 100),
    away: Math.round(awayWin * 100),
    confidence: Math.round(68 + agreement * 20),
    upsetRisk: Math.round(Math.min(homeWin, awayWin) * 100 + draw * 45),
    factors: [
      {
        label: "长期实力",
        value: `${Math.abs(home.elo - away.elo)} Elo 差距`,
        impact: home.elo >= away.elo ? "home" : "away",
      },
      {
        label: "近期状态",
        value: `${Math.abs(home.form - away.form)} 分差距`,
        impact: home.form >= away.form ? "home" : "away",
      },
      {
        label: "攻防匹配",
        value: home.attack + home.defense >= away.attack + away.defense ? `${home.name}占优` : `${away.name}占优`,
        impact: home.attack + home.defense >= away.attack + away.defense ? "home" : "away",
      },
    ],
  };
}
