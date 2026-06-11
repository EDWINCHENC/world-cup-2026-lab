export type AiScoreScenario = {
  outcome: "home" | "draw" | "away";
  homeGoals: number;
  awayGoals: number;
  rationale: string;
};

export type AiScorePrediction = {
  recommended: {
    homeGoals: number;
    awayGoals: number;
    confidence: number;
  };
  scenarios: AiScoreScenario[];
  summary: string;
  decisiveFactors: string[];
  riskNote: string;
};
