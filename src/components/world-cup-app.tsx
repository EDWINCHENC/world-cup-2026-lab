"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronRight,
  CircleGauge,
  Database,
  Flame,
  Info,
  LoaderCircle,
  Radar,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { historyMetadata } from "@/lib/history";
import { groups, matches, teamById, teams, type Match, type Team } from "@/lib/world-cup-data";
import { predictMatch } from "@/lib/predictor";
import { cn } from "@/lib/utils";

type View = "today" | "groups" | "predict" | "more";
type PredictionPhase = "idle" | "analyzing" | "result";

const analysisStages = [
  { label: "读取历史交锋", detail: "应用近期比赛时间衰减", icon: Database },
  { label: "评估近期状态", detail: "分析近阶段攻防表现", icon: Activity },
  { label: "运行混合模型", detail: "融合 Elo 与攻防匹配", icon: BrainCircuit },
  { label: "校准最终概率", detail: "检查模型分歧与可信度", icon: ShieldCheck },
];

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
        <p className="text-xs text-muted-foreground">世界排名 {team.rank}</p>
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

function FeaturedMatch({ match, onPredict }: { match: Match; onPredict: (home: Team, away: Team) => void }) {
  const home = teamById.get(match.homeId)!;
  const away = teamById.get(match.awayId)!;
  const result = predictMatch(home, away);

  return (
    <Card className="featured-card relative overflow-hidden border-white/10 bg-card/85 py-0">
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>小组赛 · {match.group}组 · 第2轮</span>
          <Badge variant="outline" className="border-orange-400/30 text-orange-300">
            <Flame data-icon="inline-start" /> 爆冷 {result.upsetRisk}%
          </Badge>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <TeamMark team={home} large />
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-3xl font-black italic">VS</span>
            <span className="text-sm text-muted-foreground">今天 {match.time}</span>
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
        <div className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-2xl border border-cyan-400/10 bg-cyan-400/5 p-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="text-cyan-300" /> 模型可信度</div>
            <div className="mt-2 flex items-end gap-2"><strong className="text-3xl text-cyan-300">{result.confidence}%</strong><span className="pb-1 text-xs text-muted-foreground">5 个模型方向一致</span></div>
          </div>
          <CircleGauge className="size-12 text-cyan-300" strokeWidth={1.4} />
        </div>
        <Button size="lg" className="h-14 text-base font-bold shadow-[0_0_30px_rgba(190,255,0,.18)]" onClick={() => onPredict(home, away)}>
          <Sparkles data-icon="inline-start" /> 开始预测
        </Button>
      </CardContent>
    </Card>
  );
}

function MatchRow({ match, onPredict }: { match: Match; onPredict: (home: Team, away: Team) => void }) {
  const home = teamById.get(match.homeId)!;
  const away = teamById.get(match.awayId)!;
  const result = predictMatch(home, away);
  return (
    <button onClick={() => onPredict(home, away)} className="group grid w-full grid-cols-[56px_1fr_auto] items-center gap-3 rounded-2xl border border-white/8 bg-card/55 p-3 text-left transition hover:border-primary/40 hover:bg-card">
      <div>
        <p className="font-mono font-bold">{match.time}</p>
        <p className="text-xs text-muted-foreground">{match.group}组</p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span>{home.flag}</span><span>{home.name}</span><span className="text-xs text-muted-foreground">vs</span><span>{away.name}</span><span>{away.flag}</span>
        </div>
        <ProbabilityBar home={result.home} draw={result.draw} away={result.away} />
      </div>
      <div className="flex items-center gap-1 text-right">
        <div><strong className="text-primary">{Math.max(result.home, result.away)}%</strong><p className="text-[10px] text-orange-400">爆冷 {result.upsetRisk}%</p></div>
        <ChevronRight className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
    </button>
  );
}

function TodayView({ onPredict }: { onPredict: (home: Team, away: Team) => void }) {
  return (
    <div className="flex flex-col gap-7">
      <header className="flex items-start justify-between">
        <div><h1 className="text-xl font-black tracking-tight">世界杯预测实验室</h1><p className="mt-1 text-xs text-muted-foreground"><span className="mr-1 text-primary">●</span> 数据已更新 · 10分钟前</p></div>
        <Button variant="outline" size="icon" className="rounded-full border-white/10 bg-white/5"><Info /></Button>
      </header>
      <section><h2 className="max-w-xs text-4xl font-black leading-tight tracking-tight">今天该看哪场？<span className="text-primary">↗</span></h2></section>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Badge className="h-9 shrink-0 px-4"><Radar data-icon="inline-start" /> 今日最值得看</Badge>
        <Badge variant="outline" className="h-9 shrink-0 border-orange-400/30 px-4 text-orange-300"><Flame data-icon="inline-start" /> 最大爆冷可能</Badge>
        <Badge variant="outline" className="h-9 shrink-0 border-white/10 px-4"><ShieldCheck data-icon="inline-start" /> 强队稳胆</Badge>
      </div>
      <FeaturedMatch match={matches[1]} onPredict={onPredict} />
      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between"><div><h2 className="text-xl font-bold">今日比赛</h2><p className="text-xs text-muted-foreground">均为北京时间</p></div><span className="text-sm text-muted-foreground">共 {matches.length} 场</span></div>
        {matches.map((match) => <MatchRow key={match.id} match={match} onPredict={onPredict} />)}
      </section>
    </div>
  );
}

function GroupsView({ onSelect }: { onSelect: (team: Team) => void }) {
  const [activeGroup, setActiveGroup] = useState("C");
  const group = groups.find((item) => item.name === activeGroup)!;
  return (
    <div className="flex flex-col gap-6">
      <header><h1 className="text-3xl font-black">小组强度</h1><p className="mt-2 text-sm text-muted-foreground">选择两支球队，直接运行对阵预测。</p></header>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {groups.map((item) => <Button key={item.name} variant={activeGroup === item.name ? "default" : "outline"} size="sm" onClick={() => setActiveGroup(item.name)}>Group {item.name}</Button>)}
      </div>
      <Card className="border-primary/15 bg-primary/5">
        <CardHeader><CardTitle className="flex items-center justify-between">Group {group.name}<Badge>死亡之组 {group.strength}</Badge></CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-black/20 p-4"><p className="text-xs text-muted-foreground">整体强度</p><strong className="mt-2 block text-3xl text-primary">{group.strength}</strong><Progress value={group.strength} className="mt-3" /></div>
          <div className="rounded-2xl bg-black/20 p-4"><p className="text-xs text-muted-foreground">实力接近</p><strong className="mt-2 block text-3xl text-cyan-300">{group.closeness}</strong><Progress value={group.closeness} className="mt-3" /></div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        {group.teams.map((team) => (
          <button key={team.id} onClick={() => onSelect(team)} className="flex flex-col items-start gap-4 rounded-3xl border border-white/8 bg-card/60 p-4 text-left transition hover:border-primary/50">
            <span className="text-4xl">{team.flag}</span><div><p className="text-lg font-bold">{team.name}</p><p className="text-xs text-muted-foreground">Elo {team.elo} · 状态 {team.form}</p></div><span className="text-xs font-semibold text-primary">选择预测 →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PredictView({ initialHome, initialAway }: { initialHome: Team; initialAway: Team }) {
  const [homeId, setHomeId] = useState(initialHome.id);
  const [awayId, setAwayId] = useState(initialAway.id);
  const [historyWeight, setHistoryWeight] = useState(15);
  const [phase, setPhase] = useState<PredictionPhase>("idle");
  const [activeStage, setActiveStage] = useState(0);
  const home = teamById.get(homeId)!;
  const away = teamById.get(awayId)!;
  const result = useMemo(() => predictMatch(home, away, historyWeight), [home, away, historyWeight]);

  useEffect(() => {
    if (phase !== "analyzing") return;

    const stageTimers = analysisStages.slice(1).map((_, index) =>
      window.setTimeout(() => setActiveStage(index + 1), (index + 1) * 720),
    );
    const resultTimer = window.setTimeout(() => {
      setPhase("result");
      window.setTimeout(() => {
        document.getElementById("prediction-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
    }, analysisStages.length * 720 + 350);

    return () => {
      stageTimers.forEach(window.clearTimeout);
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
      <Card className="border-white/8 bg-card/55"><CardContent className="flex flex-col gap-3 p-4"><div className="flex justify-between text-sm"><span>历史交锋权重</span><strong className="text-primary">{historyWeight}%</strong></div><Slider value={[historyWeight]} min={5} max={25} step={1} disabled={phase === "analyzing"} onValueChange={(value) => { setHistoryWeight(typeof value === "number" ? value : value[0]); setPhase("idle"); }} /><p className="text-xs text-muted-foreground">越近期的比赛权重越高；样本不足时自动向整体实力收缩。</p></CardContent></Card>
      <Button size="lg" className="h-14 text-base font-bold shadow-[0_0_32px_rgba(190,255,0,.16)]" disabled={phase === "analyzing"} onClick={runPrediction}>
        {phase === "analyzing" ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
        {phase === "analyzing" ? "模型分析中..." : phase === "result" ? "重新运行预测" : "开始预测"}
      </Button>
      {phase === "analyzing" ? (
        <Card className="analysis-card overflow-hidden border-cyan-400/20 bg-cyan-400/5">
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
      {phase === "result" ? (
        <div id="prediction-result" className="prediction-result scroll-mt-5 flex flex-col gap-4">
          <div className="result-announcement flex items-center justify-center gap-2 text-sm font-bold text-primary"><Sparkles /> 预测已生成</div>
          <Card className="result-card relative overflow-hidden border-primary/30 bg-primary/5">
            <CardContent className="relative flex flex-col gap-5 p-5">
              <div className="grid grid-cols-3 text-center">
                <div><strong className="result-number text-4xl text-primary"><CountUpNumber value={result.home} /></strong><p className="mt-1 text-xs text-muted-foreground">{home.name}胜</p></div>
                <div><strong className="result-number text-4xl text-cyan-300"><CountUpNumber value={result.draw} /></strong><p className="mt-1 text-xs text-muted-foreground">平局</p></div>
                <div><strong className="result-number text-4xl text-orange-400"><CountUpNumber value={result.away} /></strong><p className="mt-1 text-xs text-muted-foreground">{away.name}胜</p></div>
              </div>
              <ProbabilityBar home={result.home} draw={result.draw} away={result.away} />
              <div className="flex items-center justify-between rounded-xl border border-cyan-300/10 bg-black/25 p-3"><span className="text-sm">模型可信度</span><strong className="text-lg text-cyan-300"><CountUpNumber value={result.confidence} /> · 较高</strong></div>
            </CardContent>
          </Card>
          <section><h2 className="mb-3 text-lg font-bold">决定结果的因素</h2><div className="flex flex-col gap-2">{result.factors.map((factor) => <div key={factor.label} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-card/50 p-4"><div><p className="font-semibold">{factor.label}</p><p className="text-xs text-muted-foreground">{factor.value}</p></div><Badge variant="outline" className={factor.impact === "home" ? "shrink-0 border-primary/30 text-primary" : factor.impact === "away" ? "shrink-0 border-orange-400/30 text-orange-300" : "shrink-0 border-cyan-300/30 text-cyan-300"}>{factor.impact === "home" ? home.name : factor.impact === "away" ? away.name : "均衡"}</Badge></div>)}</div></section>
        </div>
      ) : null}
    </div>
  );
}

export function WorldCupApp() {
  const [view, setView] = useState<View>("today");
  const [selected, setSelected] = useState<[Team, Team]>([teamById.get("bra")!, teamById.get("mar")!]);

  const startPrediction = (home: Team, away: Team) => {
    setSelected([home, away]);
    setView("predict");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectFromGroup = (team: Team) => {
    const opponent = teams.find((item) => item.group === team.group && item.id !== team.id) ?? teams[0];
    startPrediction(team, opponent);
  };

  return (
    <main className="stadium-grid min-h-screen bg-background pb-28 text-foreground">
      <div className="mx-auto w-full max-w-xl px-4 py-6 md:max-w-3xl md:px-8 md:py-10">
        {view === "today" ? <TodayView onPredict={startPrediction} /> : null}
        {view === "groups" ? <GroupsView onSelect={selectFromGroup} /> : null}
        {view === "predict" ? <PredictView key={`${selected[0].id}-${selected[1].id}`} initialHome={selected[0]} initialAway={selected[1]} /> : null}
        {view === "more" ? <div className="flex flex-col gap-5"><h1 className="text-3xl font-black">更多数据</h1><Card><CardContent className="p-5"><h2 className="font-bold">历史数据已接入</h2><p className="mt-2 text-sm text-muted-foreground">本地历史库包含 {historyMetadata.totalPlayedMatches.toLocaleString()} 场已完赛国家队比赛，数据截止 {historyMetadata.latestPlayedDate}。</p><div className="mt-4 flex flex-wrap gap-2"><Badge variant="outline">来源：martj42/international_results</Badge><Badge variant="outline">许可：CC0-1.0</Badge><Badge variant="outline">近期半衰期：{historyMetadata.recencyHalfLifeYears} 年</Badge></div></CardContent></Card><Card><CardContent className="p-5"><h2 className="font-bold">模型过去表现</h2><p className="mt-2 text-sm text-muted-foreground">时间切分回测与 Brier Score 将在下一阶段接入。</p></CardContent></Card></div> : null}
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto grid max-w-xl grid-cols-4 border-t border-white/8 bg-[#07111d]/95 px-2 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
        {([
          ["today", "今日", CalendarDays],
          ["groups", "小组", Users],
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
