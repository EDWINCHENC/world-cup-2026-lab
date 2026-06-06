import historyData from "@/data/history-features.json";

export type TeamHistoryFeature = {
  matchesAvailable: number;
  recentMatchesUsed: number;
  lastMatchDate: string | null;
  eloRating: number;
  formScore: number;
  adjustedFormScore: number;
  attackScore: number;
  defenseScore: number;
  recentRecord: {
    wins: number;
    draws: number;
    losses: number;
  };
};

export type HeadToHeadFeature = {
  teamAId: string;
  teamBId: string;
  meetings: number;
  effectiveSample: number;
  weightedTeamAScore: number;
  lastMeetingDate: string | null;
  teamAWins: number;
  draws: number;
  teamBWins: number;
};

export const historyMetadata = historyData.metadata;

export function getTeamHistory(teamId: string): TeamHistoryFeature | undefined {
  return historyData.teamFeatures[teamId as keyof typeof historyData.teamFeatures];
}

export function getHeadToHead(homeId: string, awayId: string) {
  const key = [homeId, awayId].toSorted().join("__") as keyof typeof historyData.headToHead;
  const feature = historyData.headToHead[key] as HeadToHeadFeature | undefined;
  if (!feature) return undefined;

  const homeIsTeamA = feature.teamAId === homeId;
  return {
    ...feature,
    weightedHomeScore: homeIsTeamA ? feature.weightedTeamAScore : 1 - feature.weightedTeamAScore,
    homeWins: homeIsTeamA ? feature.teamAWins : feature.teamBWins,
    awayWins: homeIsTeamA ? feature.teamBWins : feature.teamAWins,
  };
}
