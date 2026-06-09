import { getTeamHistory } from "@/lib/history";
import { predictMatch } from "@/lib/predictor";
import { groups, type Team } from "@/lib/world-cup-data";

export type ScoreScenario = {
  outcome: "home" | "draw" | "away";
  label: string;
  homeGoals: number;
  awayGoals: number;
  probability: number;
  recommended: boolean;
};

export type ScorePrediction = {
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  scenarios: ScoreScenario[];
  recommended: ScoreScenario;
};

export type DarkHorseInsight = {
  team: Team;
  index: number;
  expectedPoints: number;
  strongerNonLoss: number;
  reason: string;
};

const clamp = (minimum: number, value: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function poisson(lambda: number, goals: number) {
  let factorial = 1;
  for (let value = 2; value <= goals; value += 1) factorial *= value;
  return (Math.exp(-lambda) * lambda ** goals) / factorial;
}

export function predictScore(home: Team, away: Team): ScorePrediction {
  const result = predictMatch(home, away);
  const eloDifference = home.elo - away.elo;
  const homeMatchup = home.attack - away.defense;
  const awayMatchup = away.attack - home.defense;
  const expectedHomeGoals = clamp(0.35, 1.32 + homeMatchup * 0.018 + eloDifference / 900, 3.4);
  const expectedAwayGoals = clamp(0.3, 1.12 + awayMatchup * 0.018 - eloDifference / 900, 3.2);
  const outcomeWeights = { home: result.home / 100, draw: result.draw / 100, away: result.away / 100 };
  const candidates: Omit<ScoreScenario, "recommended">[] = [];

  for (let homeGoals = 0; homeGoals <= 5; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= 5; awayGoals += 1) {
      const outcome = homeGoals > awayGoals ? "home" : homeGoals < awayGoals ? "away" : "draw";
      candidates.push({
        outcome,
        label: outcome === "home" ? `${home.name}胜` : outcome === "away" ? `${away.name}胜` : "平局",
        homeGoals,
        awayGoals,
        probability: poisson(expectedHomeGoals, homeGoals) * poisson(expectedAwayGoals, awayGoals) * outcomeWeights[outcome],
      });
    }
  }

  const bestByOutcome = (["home", "draw", "away"] as const).map((outcome) =>
    candidates.filter((candidate) => candidate.outcome === outcome).toSorted((a, b) => b.probability - a.probability)[0],
  );
  const recommendedCandidate = bestByOutcome.toSorted((a, b) => b.probability - a.probability)[0];
  const scenarios = bestByOutcome.map((scenario) => ({
    ...scenario,
    probability: Math.max(1, Math.round(scenario.probability * 100)),
    recommended: scenario === recommendedCandidate,
  }));

  return {
    expectedHomeGoals: Number(expectedHomeGoals.toFixed(2)),
    expectedAwayGoals: Number(expectedAwayGoals.toFixed(2)),
    scenarios,
    recommended: scenarios.find((scenario) => scenario.recommended)!,
  };
}

export const darkHorseRanking: DarkHorseInsight[] = groups
  .flatMap((group) => {
    const favoriteElo = Math.max(...group.teams.map((team) => team.elo));
    return group.teams
      .filter((team) => team.elo < favoriteElo)
      .map((team) => {
        const opponents = group.teams.filter((opponent) => opponent.id !== team.id);
        const strongerOpponents = opponents.filter((opponent) => opponent.elo > team.elo);
        const predictions = opponents.map((opponent) => predictMatch(team, opponent));
        const expectedPoints = predictions.reduce((sum, prediction) => sum + prediction.home * 0.03 + prediction.draw * 0.01, 0);
        const strongerNonLoss = strongerOpponents.length
          ? strongerOpponents.reduce((sum, opponent) => {
              const prediction = predictMatch(team, opponent);
              return sum + prediction.home + prediction.draw;
            }, 0) / strongerOpponents.length
          : 50;
        const history = getTeamHistory(team.id);
        const form = history?.adjustedFormScore ?? team.form;
        const defense = history?.defenseScore ?? team.defense;
        const expectedPointsScore = clamp(0, (expectedPoints / 6) * 100, 100);
        const index = Math.round(expectedPointsScore * 0.45 + strongerNonLoss * 0.25 + form * 0.15 + defense * 0.15);
        const strongestSignal =
          defense >= 85 ? `防守韧性 ${defense}` : form >= 55 ? `近期超预期状态 ${form}` : `对强队不败概率 ${Math.round(strongerNonLoss)}%`;

        return {
          team,
          index,
          expectedPoints: Number(expectedPoints.toFixed(1)),
          strongerNonLoss: Math.round(strongerNonLoss),
          reason: `${strongestSignal}，小组预期积分 ${expectedPoints.toFixed(1)}`,
        };
      });
  })
  .toSorted((a, b) => b.index - a.index);
