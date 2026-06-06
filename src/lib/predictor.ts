import type { Team } from "@/lib/world-cup-data";
import { getHeadToHead, getTeamHistory } from "@/lib/history";

export type Prediction = {
  home: number;
  draw: number;
  away: number;
  confidence: number;
  upsetRisk: number;
  weights: ModelWeights;
  factors: {
    id: "elo" | "history" | "form" | "matchup" | "calibration";
    label: string;
    value: string;
    detail: string;
    impact: "home" | "away" | "neutral";
  }[];
};

export type ModelWeights = {
  elo: number;
  form: number;
  matchup: number;
  history: number;
};

export const defaultModelWeights: ModelWeights = {
  elo: 50,
  form: 20,
  matchup: 15,
  history: 15,
};

const logistic = (difference: number) => 1 / (1 + 10 ** (-difference / 400));
const logit = (probability: number) => Math.log(probability / (1 - probability));
const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

export function predictMatch(home: Team, away: Team, modelWeights: ModelWeights = defaultModelWeights): Prediction {
  const homeHistory = getTeamHistory(home.id);
  const awayHistory = getTeamHistory(away.id);
  const headToHead = getHeadToHead(home.id, away.id);
  const eloHome = logistic(home.elo - away.elo);
  const homeForm = homeHistory?.adjustedFormScore ?? home.form;
  const awayForm = awayHistory?.adjustedFormScore ?? away.form;
  const homeAttack = homeHistory?.attackScore ?? home.attack;
  const awayAttack = awayHistory?.attackScore ?? away.attack;
  const homeDefense = homeHistory?.defenseScore ?? home.defense;
  const awayDefense = awayHistory?.defenseScore ?? away.defense;
  const formDifference = homeForm - awayForm;
  const matchupDifference = homeAttack - awayDefense - (awayAttack - homeDefense);
  const historyReliability = headToHead ? headToHead.effectiveSample / (headToHead.effectiveSample + 1.5) : 0;
  const historicalHome = headToHead
    ? 0.5 + (headToHead.weightedHomeScore - 0.5) * historyReliability
    : 0.5;

  // Elo is the calibrated baseline. Recent form, attack/defence and direct
  // meetings are bounded log-odds adjustments so weak-opponent streaks cannot
  // overwhelm long-term strength.
  const totalWeight = Object.values(modelWeights).reduce((sum, weight) => sum + weight, 0) || 1;
  const weights = Object.fromEntries(
    Object.entries(modelWeights).map(([key, weight]) => [key, weight / totalWeight]),
  ) as ModelWeights;
  const eloScale = weights.elo / (defaultModelWeights.elo / 100);
  const formScale = weights.form / (defaultModelWeights.form / 100);
  const matchupScale = weights.matchup / (defaultModelWeights.matchup / 100);
  const historyScale = weights.history / (defaultModelWeights.history / 100);
  const formAdjustment = Math.max(-0.14, Math.min(0.14, formDifference * 0.005)) * formScale;
  const matchupAdjustment = Math.max(-0.1, Math.min(0.1, matchupDifference * 0.004)) * matchupScale;
  const historyAdjustment = Math.max(-0.06, Math.min(0.06, (historicalHome - 0.5) * 0.6)) * historyScale;
  const rawHome = sigmoid(logit(eloHome) * eloScale + formAdjustment + matchupAdjustment + historyAdjustment);
  const draw = Math.max(0.18, 0.29 - Math.abs(rawHome - 0.5) * 0.2);
  const remaining = 1 - draw;
  const homeWin = Math.min(0.82, Math.max(0.08, rawHome * remaining));
  const awayWin = remaining - homeWin;
  const formDirection = formDifference >= 0 ? 1 : -1;
  const modelsAgree = formDirection === Math.sign(eloHome - 0.5);
  const agreement = modelsAgree ? 1 : 0.5;
  const dataCoverage = Math.min(1, ((homeHistory?.recentMatchesUsed ?? 0) + (awayHistory?.recentMatchesUsed ?? 0)) / 40);
  const headToHeadLabel = headToHead?.meetings
    ? `${headToHead.meetings}次交锋：${home.name}${headToHead.homeWins}胜 ${headToHead.draws}平 ${headToHead.awayWins}负`
    : "暂无直接交锋，已回归整体实力";

  return {
    home: Math.round(homeWin * 100),
    draw: Math.round(draw * 100),
    away: Math.round(awayWin * 100),
    confidence: Math.round(52 + agreement * 18 + dataCoverage * 8),
    upsetRisk: Math.round(Math.min(homeWin, awayWin) * 100 + draw * 45),
    weights,
    factors: [
      {
        id: "elo",
        label: "长期实力",
        value: `${home.name} ${home.elo} · ${away.name} ${away.elo}`,
        detail: `Elo 是根据长期比赛结果动态更新的实力评分。强队战胜弱队获得的分数较少，爆冷则会造成更大变化。本次 ${home.name} 比 ${away.name} 高 ${Math.abs(home.elo - away.elo)} 分，对应不考虑平局时约 ${Math.round(eloHome * 100)}% 的基础优势。`,
        impact: home.elo >= away.elo ? "home" : "away",
      },
      {
        id: "history",
        label: "真实历史交锋",
        value: headToHeadLabel,
        detail: headToHead?.meetings
          ? `历史交锋采用 2.5 年半衰期进行时间衰减，越近期越重要。虽然总战绩为 ${home.name}${headToHead.homeWins}胜${headToHead.draws}平${headToHead.awayWins}负，但衰减后的有效样本量只有 ${headToHead.effectiveSample.toFixed(2)}，因此模型会将结论向整体实力收缩。`
          : "两队没有可用的直接交锋记录，因此此项保持中性，不会凭空影响预测。",
        impact: historicalHome > 0.52 ? "home" : historicalHome < 0.48 ? "away" : "neutral",
      },
      {
        id: "form",
        label: "近期状态",
        value: `已按对手强弱校正：${home.name} ${homeForm} · ${away.name} ${awayForm}`,
        detail: `近期状态使用最近 ${homeHistory?.recentMatchesUsed ?? 0} 与 ${awayHistory?.recentMatchesUsed ?? 0} 场比赛，并按时间、赛事重要性和对手 Elo 校正。原始战绩为 ${home.name} ${homeHistory?.recentRecord.wins ?? 0}胜${homeHistory?.recentRecord.draws ?? 0}平${homeHistory?.recentRecord.losses ?? 0}负，${away.name} ${awayHistory?.recentRecord.wins ?? 0}胜${awayHistory?.recentRecord.draws ?? 0}平${awayHistory?.recentRecord.losses ?? 0}负。`,
        impact: homeForm >= awayForm ? "home" : "away",
      },
      {
        id: "matchup",
        label: "攻防匹配",
        value: `${home.name} 攻${homeAttack}/守${homeDefense} · ${away.name} 攻${awayAttack}/守${awayDefense}`,
        detail: "攻防评分来自近期加权进球与失球。该项用于判断一队的进攻特点是否更可能突破另一队防线；影响设有上限，避免大胜弱队造成失真。",
        impact: matchupDifference > 2 ? "home" : matchupDifference < -2 ? "away" : "neutral",
      },
      {
        id: "calibration",
        label: "模型校正",
        value: "所有自定义权重已自动归一化",
        detail: `当前实际占比：长期实力 ${Math.round(weights.elo * 100)}%、近期状态 ${Math.round(weights.form * 100)}%、攻防匹配 ${Math.round(weights.matchup * 100)}%、历史交锋 ${Math.round(weights.history * 100)}%。模型使用有界修正，避免任何单项完全覆盖其他信息。`,
        impact: "neutral",
      },
    ],
  };
}
