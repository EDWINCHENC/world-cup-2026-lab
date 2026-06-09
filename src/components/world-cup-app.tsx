"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Bot,
  BrainCircuit,
  CalendarDays,
  Check,
  CircleGauge,
  Database,
  Eye,
  Flame,
  Info,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { getTeamHistory, historyMetadata } from "@/lib/history";
import { darkHorseRanking, predictScore, type ScorePrediction } from "@/lib/insights";
import { availableMatchDates, groups, matches, scheduleMetadata, teamById, teams, type Match, type Team } from "@/lib/world-cup-data";
import { defaultModelWeights, predictMatch, type ModelWeights, type Prediction } from "@/lib/predictor";
import { cn } from "@/lib/utils";

type View = "today" | "groups" | "predict" | "more";
type PredictionPhase = "idle" | "analyzing" | "result";

const analysisStages = [
  { label: "读取历史交锋", detail: "应用近期比赛时间衰减", icon: Database },
  { label: "评估近期状态", detail: "分析近阶段攻防表现", icon: Activity },
  { label: "运行混合模型", detail: "融合 Elo 与攻防匹配", icon: BrainCircuit },
  { label: "校准最终概率", detail: "检查模型分歧与可信度", icon: ShieldCheck },
];

const formatMatchDate = (date: string) =>
  new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(
    new Date(`${date}T12:00:00+08:00`),
  );
const confidenceLabel = (confidence: number) => (confidence >= 80 ? "较高" : confidence >= 65 ? "中等" : "偏低");

function CountUpNumber({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const duration = 1050;
    const startedAt = performance.now();
    let frame = 0;

    const animate = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 4;
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{display}{suffix}</>;
}

function TeamMark({ team, large = false }: { team: Team; large?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={cn("grid place-items-center rounded-full border border-white/10 bg-white/5 shadow-[0_0_30px_rgba(190,255,0,.08)]", large ? "size-20 text-4xl" : "size-11 text-2xl")}>
        {team.flag}
      </div>
      <div className="text-center">
        <p className={cn("font-bold", large ? "text-xl" : "text-sm")}>{team.name}</p>
        <p className="text-xs text-muted-foreground">Group {team.group}</p>
      </div>
    </div>
  );
}

function ProbabilityBar({ home, draw, away }: { home: number; draw: number; away: number }) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/5">
      <div className="bg-primary transition-all duration-700" style={{ width: `${home}%` }} />
      <div className="bg-cyan-400 transition-all duration-700" style={{ width: `${draw}%` }} />
      <div className="bg-orange-500 transition-all duration-700" style={{ width: `${away}%` }} />
    </div>
  );
}

function ScoreScenarioGrid({ prediction }: { prediction: ScorePrediction }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {prediction.scenarios.map((scenario) => (
        <div key={scenario.outcome} className={cn("relative rounded-2xl border p-3 text-center", scenario.recommended ? "border-primary/45 bg-primary/10" : "border-white/8 bg-white/[.03]")}>
          {scenario.recommended ? <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-2 py-0.5 text-[9px] font-black text-primary-foreground">首选</span> : null}
          <p className="text-[10px] text-muted-foreground">{scenario.label}</p>
          <strong className={cn("mt-1 block font-mono text-2xl", scenario.recommended ? "text-primary" : "text-foreground")}>{scenario.homeGoals}:{scenario.awayGoals}</strong>
          <p className="mt-1 text-[10px] text-muted-foreground">单一比分 {scenario.probability}%</p>
        </div>
      ))}
    </div>
  );
}

function ScoreGuessDrawer({ match, onClose, onPredict }: { match: Match | null; onClose: () => void; onPredict: (home: Team, away: Team) => void }) {
  const home = match ? teamById.get(match.homeId)! : null;
  const away = match ? teamById.get(match.awayId)! : null;
  const score = home && away ? predictScore(home, away) : null;

  return (
    <Drawer open={match !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerContent className="border-white/10 bg-popover/98">
        <DrawerHeader className="text-left">
          <DrawerTitle className="flex items-center gap-2 text-xl font-black"><Bot className="text-primary" /> AI 猜比分</DrawerTitle>
          <DrawerDescription>{home?.name} vs {away?.name} · {match ? formatMatchDate(match.date) : ""}</DrawerDescription>
        </DrawerHeader>
        {home && away && score ? (
          <div className="overflow-y-auto px-4 pb-8">
            <div className="score-oracle mb-4 rounded-3xl border border-primary/20 bg-primary/5 p-5 text-center">
              <p className="text-xs text-muted-foreground">模型最推荐</p>
              <div className="mt-2 flex items-center justify-center gap-4">
                <span className="text-3xl">{home.flag}</span>
                <strong className="font-mono text-6xl text-primary">{score.recommended.homeGoals}:{score.recommended.awayGoals}</strong>
                <span className="text-3xl">{away.flag}</span>
              </div>
              <p className="mt-2 text-sm font-bold">{score.recommended.label} · 预期进球 {score.expectedHomeGoals} / {score.expectedAwayGoals}</p>
            </div>
            <ScoreScenarioGrid prediction={score} />
            <p className="mt-4 text-xs leading-6 text-muted-foreground">基于 Elo、近期攻防评分推导双方预期进球，再使用 Poisson 分布计算具体比分。单一比分天然概率较低，建议结合胜平负概率判断。</p>
            <Button className="mt-4 w-full" onClick={() => onPredict(home, away)}><BarChart3 data-icon="inline-start" /> 查看完整预测</Button>
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

function FeaturedMatch({ match, onPredict, onScore }: { match: Match; onPredict: (home: Team, away: Team) => void; onScore: (match: Match) => void }) {
  const home = teamById.get(match.homeId)!;
  const away = teamById.get(match.awayId)!;
  const result = predictMatch(home, away);

  return (
    <Card className="featured-card relative overflow-hidden border-white/10 bg-card/85 py-0">
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>2026 世界杯 · {match.group}组 · {match.city}</span>
          <Badge variant="outline" className="border-orange-400/30 text-orange-300">
            <Flame data-icon="inline-start" /> 爆冷 {result.upsetRisk}%
          </Badge>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamMark team={home} large />
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-3xl font-black italic">VS</span>
            <span className="text-center text-xs text-muted-foreground">{formatMatchDate(match.date)}<br />开球时间待确认</span>
          </div>
          <TeamMark team={away} large />
        </div>
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 text-center">
            <div><strong className="text-2xl text-primary">{result.home}%</strong><p className="text-xs text-muted-foreground">主胜</p></div>
            <div><strong className="text-2xl text-cyan-300">{result.draw}%</strong><p className="text-xs text-muted-foreground">平局</p></div>
            <div><strong className="text-2xl text-orange-400">{result.away}%</strong><p className="text-xs text-muted-foreground">客胜</p></div>
          </div>
          <ProbabilityBar home={result.home} draw={result.draw} away={result.away} />
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-cyan-400/10 bg-cyan-400/5 px-4 py-3">
          <span className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="size-4 text-cyan-300" /> 模型可信度</span>
          <strong className="text-cyan-300">{result.confidence}% · {confidenceLabel(result.confidence)}</strong>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button className="h-12 font-bold shadow-[0_0_24px_rgba(190,255,0,.12)]" onClick={() => onPredict(home, away)}><BarChart3 data-icon="inline-start" /> 胜率/比分预测</Button>
          <Button variant="outline" className="h-12 border-cyan-300/25 font-bold text-cyan-200" onClick={() => onScore(match)}><Bot data-icon="inline-start" /> AI 猜比分</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MatchRow({ match, onPredict, onScore }: { match: Match; onPredict: (home: Team, away: Team) => void; onScore: (match: Match) => void }) {
  const home = teamById.get(match.homeId)!;
  const away = teamById.get(match.awayId)!;
  const result = predictMatch(home, away);
  return (
    <div className="grid w-full grid-cols-[56px_1fr_auto] items-center gap-3 rounded-2xl border border-white/8 bg-card/55 p-3 text-left transition hover:border-primary/40 hover:bg-card">
      <div>
        <p className="text-xs font-bold">时间待定</p>
        <p className="text-xs text-muted-foreground">{match.group}组</p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span>{home.flag}</span><span>{home.name}</span><span className="text-xs text-muted-foreground">vs</span><span>{away.name}</span><span>{away.flag}</span>
        </div>
        <ProbabilityBar home={result.home} draw={result.draw} away={result.away} />
      </div>
      <div className="flex flex-col gap-1">
        <Button size="sm" className="h-7 px-2 text-[10px]" onClick={() => onPredict(home, away)}>胜率</Button>
        <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] text-cyan-200" onClick={() => onScore(match)}>比分</Button>
      </div>
    </div>
  );
}

function TodayView({ onPredict }: { onPredict: (home: Team, away: Team) => void }) {
  const [selectedDate, setSelectedDate] = useState(availableMatchDates[0]);
  const [scoreMatch, setScoreMatch] = useState<Match | null>(null);
  const selectedMatches = matches.filter((match) => match.date === selectedDate);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between">
        <div><h1 className="text-xl font-black tracking-tight">世界杯预测实验室</h1><p className="mt-1 text-xs text-muted-foreground"><span className="mr-1 text-primary">●</span> 已接入 {scheduleMetadata.matchCount} 场确定小组赛</p></div>
        <Button variant="outline" size="icon" className="rounded-full border-white/10 bg-white/5"><Info /></Button>
      </header>
      <section><h2 className="text-3xl font-black leading-tight tracking-tight">今天该看哪场？<span className="text-primary"> ↗</span></h2></section>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{formatMatchDate(selectedDate)}精选 · {selectedMatches.length} 场</span><select aria-label="选择比赛日期" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="max-w-36 rounded-full border border-white/10 bg-card/75 px-3 py-2 text-xs font-semibold text-foreground">{availableMatchDates.map((date) => <option key={date} value={date}>{formatMatchDate(date)}</option>)}</select></div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2">
        {selectedMatches.map((match) => <div key={match.id} className="w-[calc(100vw-2rem)] max-w-xl shrink-0 snap-center"><FeaturedMatch match={match} onPredict={onPredict} onScore={setScoreMatch} /></div>)}
      </div>
      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between"><div><h2 className="text-xl font-bold">{formatMatchDate(selectedDate)}比赛</h2><p className="text-xs text-muted-foreground">开球时间尚未从可靠来源确认</p></div><span className="text-sm text-muted-foreground">共 {selectedMatches.length} 场</span></div>
        {selectedMatches.map((match) => <MatchRow key={match.id} match={match} onPredict={onPredict} onScore={setScoreMatch} />)}
      </section>
      <ScoreGuessDrawer match={scoreMatch} onClose={() => setScoreMatch(null)} onPredict={onPredict} />
    </div>
  );
}

function GroupsView({ selectedTeam, onSelect, onPredict, onClear }: { selectedTeam: Team | null; onSelect: (team: Team) => void; onPredict: (home: Team, away: Team) => void; onClear: () => void }) {
  const [activeGroup, setActiveGroup] = useState("C");
  const [featuredType, setFeaturedType] = useState<"strongest" | "upset">("strongest");
  const group = groups.find((item) => item.name === activeGroup)!;
  const rankedTeams = group.teams.toSorted((a, b) => b.elo - a.elo);
  const groupMatches = matches.filter((match) => match.group === activeGroup);
  const strongestMatch = groupMatches.toSorted((a, b) => {
    const aStrength = teamById.get(a.homeId)!.elo + teamById.get(a.awayId)!.elo;
    const bStrength = teamById.get(b.homeId)!.elo + teamById.get(b.awayId)!.elo;
    return bStrength - aStrength;
  })[0];
  const upsetMatch = groupMatches.toSorted((a, b) => {
    const aTeams = [teamById.get(a.homeId)!, teamById.get(a.awayId)!];
    const bTeams = [teamById.get(b.homeId)!, teamById.get(b.awayId)!];
    return predictMatch(bTeams[0], bTeams[1]).upsetRisk - predictMatch(aTeams[0], aTeams[1]).upsetRisk;
  })[0];
  const featuredMatch = featuredType === "strongest" ? strongestMatch : upsetMatch;
  const featuredHome = teamById.get(featuredMatch.homeId)!;
  const featuredAway = teamById.get(featuredMatch.awayId)!;
  const featuredPrediction = predictMatch(featuredHome, featuredAway);
  const groupDarkHorse = darkHorseRanking.find((candidate) => candidate.team.group === activeGroup);

  return (
    <div className="flex flex-col gap-6">
      <header><div className="flex items-center gap-2"><h1 className="text-3xl font-black">小组 / 黑马</h1><Badge variant="outline" className="border-orange-400/25 text-orange-300"><Flame data-icon="inline-start" /> 黑马雷达</Badge></div><p className="mt-2 text-sm text-muted-foreground">{selectedTeam ? `已选择 ${selectedTeam.name}，再选择一支球队开始预测。` : "查看组内实力排序，点击两支球队即可预测。"}</p>{selectedTeam ? <Button variant="outline" size="sm" className="mt-3" onClick={onClear}>清除已选球队</Button> : null}</header>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {groups.map((item) => {
          const hasTopDarkHorse = darkHorseRanking.slice(0, 8).some((candidate) => candidate.team.group === item.name);
          return <Button key={item.name} variant={activeGroup === item.name ? "default" : "outline"} size="sm" className="relative" onClick={() => setActiveGroup(item.name)}>Group {item.name}{hasTopDarkHorse ? <span className="absolute -right-1 -top-1 size-2 rounded-full bg-orange-400" /> : null}</Button>;
        })}
      </div>
      <Card className="border-primary/15 bg-primary/5">
        <CardHeader><CardTitle className="flex items-center justify-between">Group {group.name}<Badge>小组强度 {group.strength}</Badge></CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-2xl bg-black/20 p-4"><div className="flex-1"><p className="text-xs text-muted-foreground">整体强度</p><strong className="mt-1 block text-3xl text-primary">{group.strength}</strong><Progress value={group.strength} className="mt-2" /></div><div className="grid gap-1"><Button size="sm" variant={featuredType === "strongest" ? "default" : "outline"} onClick={() => setFeaturedType("strongest")}>最强对阵</Button><Button size="sm" variant={featuredType === "upset" ? "default" : "outline"} className={cn(featuredType === "upset" && "bg-orange-400 text-slate-950 hover:bg-orange-300")} onClick={() => setFeaturedType("upset")}>爆冷对阵</Button></div></div>
          <button type="button" onClick={() => onPredict(featuredHome, featuredAway)} className="flex items-center justify-between rounded-2xl border border-white/8 bg-card/55 p-3 text-left transition hover:border-primary/30">
            <div><p className="text-[10px] font-bold text-muted-foreground">{featuredType === "strongest" ? "组内最高 Elo 对决" : `爆冷风险 ${featuredPrediction.upsetRisk}%`}</p><p className="mt-1 font-black">{featuredHome.flag} {featuredHome.name} <span className="px-1 text-xs text-muted-foreground">VS</span> {featuredAway.name} {featuredAway.flag}</p></div><span className="text-xs font-bold text-primary">预测 →</span>
          </button>
          {groupDarkHorse ? <div className="dark-horse-card relative overflow-hidden rounded-2xl border border-orange-400/20 bg-orange-400/[.04] p-3"><div className="relative flex items-center justify-between"><div><p className="text-[10px] font-bold text-orange-300">本组黑马观察</p><p className="mt-1 font-black">{groupDarkHorse.team.flag} {groupDarkHorse.team.name}</p><p className="mt-1 text-[10px] text-muted-foreground">{groupDarkHorse.reason}</p></div><div className="text-right"><strong className="text-3xl text-orange-300">{groupDarkHorse.index}</strong><p className="text-[9px] text-muted-foreground">黑马指数</p></div></div></div> : null}
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        {rankedTeams.map((team, index) => {
          const darkHorse = groupDarkHorse?.team.id === team.id ? groupDarkHorse : undefined;
          return (
          <button key={team.id} onClick={() => onSelect(team)} className={cn("flex flex-col items-start gap-4 rounded-3xl border bg-card/60 p-4 text-left transition hover:border-primary/50", selectedTeam?.id === team.id ? "border-primary bg-primary/8 shadow-[0_0_24px_rgba(190,255,0,.1)]" : "border-white/8")}>
            <div className="flex w-full items-start justify-between"><span className="text-4xl">{team.flag}</span><div className="text-right"><strong className="font-mono text-2xl text-primary">#{index + 1}</strong><p className="text-[9px] text-muted-foreground">组内实力</p></div></div><div><p className="text-lg font-bold">{team.name}</p><p className="text-xs text-muted-foreground">Elo {team.elo} · {getTeamHistory(team.id)?.matchesAvailable.toLocaleString() ?? 0} 场历史比赛</p></div>{darkHorse ? <Badge variant="outline" className="border-orange-400/25 text-orange-300"><Flame data-icon="inline-start" /> 黑马 {darkHorse.index}</Badge> : null}<span className="text-xs font-semibold text-primary">{selectedTeam?.id === team.id ? "已选择 1/2" : "选择预测 →"}</span>
          </button>
          );
        })}
      </div>
    </div>
  );
}

function PredictionResultScreen({
  home,
  away,
  result,
  onClose,
  onSelectFactor,
}: {
  home: Team;
  away: Team;
  result: Prediction;
  onClose: () => void;
  onSelectFactor: (factor: Prediction["factors"][number]) => void;
}) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const score = predictScore(home, away);
  return (
    <div className="prediction-cinema fixed inset-0 z-40 overflow-y-auto bg-[#030914] text-foreground">
      <div className="prediction-beam pointer-events-none fixed inset-0" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-5 sm:px-8">
        <header className="flex items-center justify-between">
          <div><p className="text-xs font-bold tracking-[.24em] text-primary">MATCH ORACLE</p><p className="mt-1 text-xs text-muted-foreground">历史特征模型 · 比分分布推演</p></div>
          <Button variant="outline" size="icon" className="rounded-full border-white/10 bg-white/5" onClick={onClose}><X /></Button>
        </header>
        <div className="flex flex-1 flex-col justify-center py-10 text-center">
          <div className="result-announcement mx-auto flex items-center gap-2 text-sm font-black text-primary"><Sparkles /> 预测结果已生成</div>
          <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div><span className="text-6xl">{home.flag}</span><h2 className="mt-3 text-2xl font-black">{home.name}</h2></div>
            <div className="score-reveal relative">
              <div className="score-ring absolute inset-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/25" />
              <p className="text-xs font-bold text-muted-foreground">首选比分</p>
              <strong className="result-number relative mt-2 block font-mono text-7xl text-primary sm:text-8xl">{score.recommended.homeGoals}:{score.recommended.awayGoals}</strong>
              <Badge className="mt-3">{score.recommended.label}</Badge>
            </div>
            <div><span className="text-6xl">{away.flag}</span><h2 className="mt-3 text-2xl font-black">{away.name}</h2></div>
          </div>
          <div className="mx-auto mt-10 w-full max-w-xl rounded-3xl border border-white/8 bg-white/[.03] p-5 backdrop-blur">
            <div className="grid grid-cols-3 text-center">
              <div><strong className="result-number text-3xl text-primary"><CountUpNumber value={result.home} /></strong><p className="mt-1 text-xs text-muted-foreground">{home.name}胜</p></div>
              <div><strong className="result-number text-3xl text-cyan-300"><CountUpNumber value={result.draw} /></strong><p className="mt-1 text-xs text-muted-foreground">平局</p></div>
              <div><strong className="result-number text-3xl text-orange-400"><CountUpNumber value={result.away} /></strong><p className="mt-1 text-xs text-muted-foreground">{away.name}胜</p></div>
            </div>
            <ProbabilityBar home={result.home} draw={result.draw} away={result.away} />
            <div className="mt-4 flex items-center justify-between text-xs"><span className="text-muted-foreground">模型可信度</span><strong className="text-cyan-200">{result.confidence}% · {confidenceLabel(result.confidence)}</strong></div>
          </div>
          <div className="mx-auto mt-5 w-full max-w-xl"><ScoreScenarioGrid prediction={score} /></div>
          <div className="mx-auto mt-6 flex w-full max-w-xl gap-2">
            <Button size="lg" className="flex-1" onClick={() => setShowAnalysis((current) => !current)}><Eye data-icon="inline-start" /> {showAnalysis ? "收起分析" : "查看分析"}</Button>
            <Button size="lg" variant="outline" className="border-white/10" onClick={onClose}>调整对阵</Button>
          </div>
        </div>
        {showAnalysis ? (
          <section className="analysis-reveal pb-10"><h2 className="mb-3 text-lg font-black">决定结果的因素</h2><div className="grid gap-2 sm:grid-cols-2">{result.factors.map((factor) => <button type="button" onClick={() => onSelectFactor(factor)} key={factor.label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-card/50 p-4 text-left transition hover:border-primary/35"><div><p className="font-semibold">{factor.label} <span className="text-primary">→</span></p><p className="text-xs text-muted-foreground">{factor.value}</p></div></button>)}</div><p className="mt-4 text-xs leading-6 text-muted-foreground">比分预测基于预期进球与 Poisson 分布；当前尚未接入最终阵容、伤停与赛前赔率。</p></section>
        ) : null}
      </div>
    </div>
  );
}

function PredictView({ initialHome, initialAway }: { initialHome: Team; initialAway: Team }) {
  const [homeId, setHomeId] = useState(initialHome.id);
  const [awayId, setAwayId] = useState(initialAway.id);
  const [modelWeights, setModelWeights] = useState<ModelWeights>(defaultModelWeights);
  const [selectedFactor, setSelectedFactor] = useState<Prediction["factors"][number] | null>(null);
  const [phase, setPhase] = useState<PredictionPhase>("idle");
  const [activeStage, setActiveStage] = useState(0);
  const home = teamById.get(homeId)!;
  const away = teamById.get(awayId)!;
  const result = useMemo(() => predictMatch(home, away, modelWeights), [home, away, modelWeights]);

  useEffect(() => {
    if (phase !== "analyzing") return;

    const scrollTimer = window.setTimeout(() => {
      document.getElementById("analysis-progress")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    const stageTimers = analysisStages.slice(1).map((_, index) =>
      window.setTimeout(() => setActiveStage(index + 1), (index + 1) * 720),
    );
    const resultTimer = window.setTimeout(() => setPhase("result"), analysisStages.length * 720 + 350);

    return () => {
      stageTimers.forEach(window.clearTimeout);
      window.clearTimeout(scrollTimer);
      window.clearTimeout(resultTimer);
    };
  }, [phase]);

  const selectTeam = (side: "home" | "away", id: string) => {
    if (side === "home") setHomeId(id);
    else setAwayId(id);
    setPhase("idle");
  };

  const runPrediction = () => {
    setActiveStage(0);
    setPhase("analyzing");
  };

  const updateWeight = (key: keyof ModelWeights, value: number | readonly number[]) => {
    setModelWeights((current) => ({ ...current, [key]: typeof value === "number" ? value : value[0] }));
    setPhase("idle");
  };

  const weightControls: { id: keyof ModelWeights; label: string; description: string }[] = [
    { id: "elo", label: "长期实力", description: "历史比赛累计形成的 Elo 基础实力" },
    { id: "form", label: "近期状态", description: "按对手强弱校正的最近比赛表现" },
    { id: "matchup", label: "攻防匹配", description: "近期进球与失球形成的攻防特征" },
    { id: "history", label: "历史交锋", description: "采用时间衰减与样本收缩的直接交锋" },
  ];
  const rawWeightTotal = Object.values(modelWeights).reduce((sum, weight) => sum + weight, 0) || 1;

  return (
    <div className="flex flex-col gap-6">
      <header><h1 className="text-3xl font-black">对阵预测</h1><p className="mt-2 text-sm text-muted-foreground">混合 Elo、近期状态、攻防与历史交锋。</p></header>
      <Card className="border-white/10 bg-card/70">
        <CardContent className="grid grid-cols-[1fr_auto_1fr] items-start gap-3 p-5">
          <div className="flex flex-col gap-3"><TeamMark team={home} large /><select aria-label="选择主队" value={homeId} onChange={(event) => selectTeam("home", event.target.value)} className="rounded-xl border border-white/10 bg-background p-2 text-sm">{teams.filter((team) => team.id !== awayId).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div>
          <span className="pt-9 font-mono text-xl font-black">VS</span>
          <div className="flex flex-col gap-3"><TeamMark team={away} large /><select aria-label="选择客队" value={awayId} onChange={(event) => selectTeam("away", event.target.value)} className="rounded-xl border border-white/10 bg-background p-2 text-sm">{teams.filter((team) => team.id !== homeId).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div>
        </CardContent>
      </Card>
      <Card className="border-white/8 bg-card/55">
        <CardHeader className="pb-2"><CardTitle className="flex items-center justify-between text-base"><span>模型权重实验室</span><Button variant="outline" size="sm" onClick={() => { setModelWeights(defaultModelWeights); setPhase("idle"); }}>恢复默认</Button></CardTitle><p className="text-xs text-muted-foreground">拖动相对权重，模型会自动归一化并重新计算。</p></CardHeader>
        <CardContent className="flex flex-col gap-5 p-4 pt-1">
          {weightControls.map((control) => {
            const normalized = Math.round((modelWeights[control.id] / rawWeightTotal) * 100);
            return <div key={control.id} className="flex flex-col gap-2"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold">{control.label}</p><p className="text-xs text-muted-foreground">{control.description}</p></div><Badge variant="outline" className="shrink-0 border-primary/25 text-primary">{normalized}%</Badge></div><Slider aria-label={`${control.label}权重`} value={[modelWeights[control.id]]} min={0} max={100} step={5} disabled={phase === "analyzing"} onValueChange={(value) => updateWeight(control.id, value)} /></div>;
          })}
        </CardContent>
      </Card>
      <Button size="lg" className="h-14 text-base font-bold shadow-[0_0_32px_rgba(190,255,0,.16)]" disabled={phase === "analyzing"} onClick={runPrediction}>
        {phase === "analyzing" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
        {phase === "analyzing" ? "模型分析中..." : phase === "result" ? "重新运行预测" : "开始预测"}
      </Button>
      {phase === "analyzing" ? (
        <Card id="analysis-progress" className="analysis-card scroll-mt-5 overflow-hidden border-cyan-400/20 bg-cyan-400/5">
          <CardContent className="flex flex-col gap-5 p-5">
            <div className="relative mx-auto grid size-24 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/5">
              <div className="analysis-orbit absolute inset-2 rounded-full border border-dashed border-primary/40" />
              <BrainCircuit className="size-10 text-cyan-300" strokeWidth={1.5} />
            </div>
            <div className="text-center">
              <p className="text-lg font-bold">正在吸取比赛数据</p>
              <p className="mt-1 text-xs text-muted-foreground">模型会在完成校准后一次性揭示结果</p>
            </div>
            <div className="flex flex-col gap-2">
              {analysisStages.map((stage, index) => {
                const Icon = stage.icon;
                const isDone = index < activeStage;
                const isActive = index === activeStage;
                return (
                  <div key={stage.label} className={cn("analysis-stage flex items-center gap-3 rounded-2xl border p-3 transition-all", isActive ? "border-primary/35 bg-primary/8" : "border-white/6 bg-black/10", isDone && "opacity-65")}>
                    <span className={cn("grid size-9 place-items-center rounded-full bg-white/5 text-muted-foreground", isActive && "bg-primary text-primary-foreground", isDone && "text-primary")}>
                      {isDone ? <Check /> : <Icon className={cn(isActive && "animate-pulse")} />}
                    </span>
                    <div className="flex-1"><p className="text-sm font-semibold">{stage.label}</p><p className="text-xs text-muted-foreground">{stage.detail}</p></div>
                    {isActive ? <span className="flex gap-1"><i /><i /><i /></span> : null}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
      {phase === "result" ? <PredictionResultScreen home={home} away={away} result={result} onClose={() => setPhase("idle")} onSelectFactor={setSelectedFactor} /> : null}
      <Drawer open={selectedFactor !== null} onOpenChange={(open) => { if (!open) setSelectedFactor(null); }}>
        <DrawerContent className="border-white/10 bg-popover/98">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-xl font-bold">{selectedFactor?.label}</DrawerTitle>
            <DrawerDescription>{selectedFactor?.value}</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-8">
            <div className="rounded-2xl border border-white/8 bg-card/60 p-4">
              <p className="text-sm leading-7 text-muted-foreground">{selectedFactor?.detail}</p>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">点击并调整上方模型权重，可以观察该因素对最终概率的影响。</p>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

export function WorldCupApp() {
  const [view, setView] = useState<View>("today");
  const [selected, setSelected] = useState<[Team, Team]>([teamById.get("bra")!, teamById.get("mar")!]);
  const [pendingTeam, setPendingTeam] = useState<Team | null>(null);

  const startPrediction = (home: Team, away: Team) => {
    setSelected([home, away]);
    setPendingTeam(null);
    setView("predict");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectFromGroup = (team: Team) => {
    if (!pendingTeam) {
      setPendingTeam(team);
      return;
    }
    if (pendingTeam.id === team.id) {
      setPendingTeam(null);
      return;
    }
    startPrediction(pendingTeam, team);
  };

  return (
    <main className="stadium-grid min-h-screen bg-background pb-28 text-foreground">
      <div className="mx-auto w-full max-w-xl px-4 py-6 md:max-w-3xl md:px-8 md:py-10">
        {view === "today" ? <TodayView onPredict={startPrediction} /> : null}
        {view === "groups" ? <GroupsView selectedTeam={pendingTeam} onSelect={selectFromGroup} onPredict={startPrediction} onClear={() => setPendingTeam(null)} /> : null}
        {view === "predict" ? <PredictView key={`${selected[0].id}-${selected[1].id}`} initialHome={selected[0]} initialAway={selected[1]} /> : null}
        {view === "more" ? <div className="flex flex-col gap-5"><h1 className="text-3xl font-black">更多数据</h1><Card><CardContent className="p-5"><h2 className="font-bold">历史数据已接入</h2><p className="mt-2 text-sm text-muted-foreground">本地历史库包含 {historyMetadata.totalPlayedMatches.toLocaleString()} 场已完赛国家队比赛，数据截止 {historyMetadata.latestPlayedDate}。</p><div className="mt-4 flex flex-wrap gap-2"><Badge variant="outline">来源：martj42/international_results</Badge><Badge variant="outline">许可：CC0-1.0</Badge><Badge variant="outline">近期半衰期：{historyMetadata.recencyHalfLifeYears} 年</Badge></div></CardContent></Card><Card><CardContent className="p-5"><h2 className="font-bold">模型过去表现</h2><p className="mt-2 text-sm text-muted-foreground">时间切分回测与 Brier Score 将在下一阶段接入。</p></CardContent></Card></div> : null}
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-xl grid-cols-4 border-t border-white/8 bg-[#07111d]/95 px-2 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
        {([
          ["today", "今日", CalendarDays],
          ["groups", "小组/黑马", Users],
          ["predict", "预测", BarChart3],
          ["more", "更多", CircleGauge],
        ] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setView(id)} className={cn("flex flex-col items-center gap-1 rounded-2xl py-2 text-xs font-semibold text-muted-foreground transition", view === id && "text-primary", id === "predict" && "relative -mt-5")}>
            <span className={cn("grid size-9 place-items-center rounded-full", id === "predict" && "size-14 bg-primary text-primary-foreground shadow-[0_0_28px_rgba(190,255,0,.25)]", view === id && id !== "predict" && "bg-primary/10")}><Icon /></span>{label}
          </button>
        ))}
      </nav>
    </main>
  );
}
