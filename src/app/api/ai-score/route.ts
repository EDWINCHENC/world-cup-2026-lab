import { getHeadToHead, getTeamHistory } from "@/lib/history";
import { predictScore } from "@/lib/insights";
import { predictMatch } from "@/lib/predictor";
import { matches, teamById } from "@/lib/world-cup-data";
import type { AiScorePrediction } from "@/lib/ai-score-types";

const defaultGeminiBaseUrl = "https://generativelanguage.googleapis.com";
const defaultOpenAiBaseUrl = "https://api.openai.com/v1";
const requestWindowMs = 60_000;
const requestsByIp = new Map<string, { count: number; startedAt: number }>();
const predictionCache = new Map<string, { data: AiScorePrediction; expiresAt: number }>();

type AiProvider = "gemini" | "openai";

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBaseUrl(value: string, variableName: string) {
  const parsedBaseUrl = new URL(value);
  if (!["http:", "https:"].includes(parsedBaseUrl.protocol)) {
    throw new Error(`${variableName} must use HTTP or HTTPS.`);
  }
  return parsedBaseUrl.toString().replace(/\/+$/, "");
}

function getConfig() {
  const provider = (process.env.AI_PROVIDER ?? "gemini").toLowerCase() as AiProvider;
  if (!["gemini", "openai"].includes(provider)) {
    throw new Error("AI_PROVIDER must be gemini or openai.");
  }

  const baseUrl = provider === "openai"
    ? parseBaseUrl(process.env.OPENAI_API_BASE_URL ?? defaultOpenAiBaseUrl, "OPENAI_API_BASE_URL")
    : parseBaseUrl(
      process.env.GEMINI_API_BASE_URL ?? process.env.GEMINI_PROXY_BASE_URL ?? defaultGeminiBaseUrl,
      "GEMINI_API_BASE_URL",
    );
  const apiKey = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
  const model = provider === "openai"
    ? process.env.OPENAI_MODEL ?? "gpt-4.1-mini"
    : process.env.GEMINI_MODEL ?? "gemini-3-flash-preview";

  return {
    provider,
    apiKey,
    baseUrl,
    model,
    cacheKeyPrefix: `${provider}:${baseUrl}:${model}`,
    openAiJsonMode: process.env.OPENAI_JSON_MODE !== "false",
    requestLimit: readPositiveInteger(process.env.AI_SCORE_REQUESTS_PER_MINUTE, 8),
    cacheTtlMs: readPositiveInteger(process.env.AI_SCORE_CACHE_TTL_SECONDS, 43_200) * 1000,
  };
}

function parsePredictionJson(text: string) {
  const normalized = text.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(normalized) as Omit<AiScorePrediction, "model">;
}

function buildResponseSchema() {
  return {
    type: "OBJECT",
    required: ["recommended", "scenarios", "summary", "decisiveFactors", "riskNote"],
    properties: {
      recommended: {
        type: "OBJECT",
        required: ["homeGoals", "awayGoals", "confidence"],
        properties: {
          homeGoals: { type: "INTEGER" },
          awayGoals: { type: "INTEGER" },
          confidence: { type: "INTEGER" },
        },
      },
      scenarios: {
        type: "ARRAY",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "OBJECT",
          required: ["outcome", "homeGoals", "awayGoals", "rationale"],
          properties: {
            outcome: { type: "STRING", enum: ["home", "draw", "away"] },
            homeGoals: { type: "INTEGER" },
            awayGoals: { type: "INTEGER" },
            rationale: { type: "STRING" },
          },
        },
      },
      summary: { type: "STRING" },
      decisiveFactors: { type: "ARRAY", items: { type: "STRING" } },
      riskNote: { type: "STRING" },
    },
  };
}

async function requestGemini(config: ReturnType<typeof getConfig>, prompt: string, signal: AbortSignal) {
  const endpoint = `${config.baseUrl}/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKey!,
    },
    signal,
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        responseMimeType: "application/json",
        responseSchema: buildResponseSchema(),
      },
    }),
  });
  const data = (await response.json()) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  if (!response.ok) throw new Error(data.error?.message ?? `Gemini request failed with ${response.status}.`);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini did not return a prediction.");
  return parsePredictionJson(text);
}

async function requestOpenAi(config: ReturnType<typeof getConfig>, prompt: string, signal: AbortSignal) {
  const endpoint = `${config.baseUrl}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    signal,
    body: JSON.stringify({
      model: config.model,
      temperature: 0.35,
      ...(config.openAiJsonMode ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: "你是谨慎的国际足球赛前分析师。必须只返回合法 JSON，不要使用 Markdown。" },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = (await response.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string | { text?: string }[] } }[];
  };
  if (!response.ok) throw new Error(data.error?.message ?? `OpenAI-compatible request failed with ${response.status}.`);
  const content = data.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : content?.map((part) => part.text ?? "").join("");
  if (!text) throw new Error("OpenAI-compatible API did not return a prediction.");
  return parsePredictionJson(text);
}

async function requestPrediction(config: ReturnType<typeof getConfig>, prompt: string, signal: AbortSignal) {
  return config.provider === "openai"
    ? requestOpenAi(config, prompt, signal)
    : requestGemini(config, prompt, signal);
}

function isRateLimited(ip: string, requestLimit: number) {
  const now = Date.now();
  const record = requestsByIp.get(ip);
  if (!record || now - record.startedAt > requestWindowMs) {
    requestsByIp.set(ip, { count: 1, startedAt: now });
    return false;
  }
  record.count += 1;
  return record.count > requestLimit;
}

function removeExpiredEntries() {
  const now = Date.now();
  for (const [ip, record] of requestsByIp) {
    if (now - record.startedAt > requestWindowMs) requestsByIp.delete(ip);
  }
  for (const [matchId, cached] of predictionCache) {
    if (cached.expiresAt <= now) predictionCache.delete(matchId);
  }
}

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...init?.headers,
    },
  });
}

function validatePrediction(prediction: Omit<AiScorePrediction, "model">) {
  if (!prediction.recommended || !Array.isArray(prediction.scenarios) || prediction.scenarios.length !== 3) {
    throw new Error("AI provider returned an incomplete score prediction.");
  }
  const validScore = (value: number) => Number.isInteger(value) && value >= 0 && value <= 9;
  if (!validScore(prediction.recommended.homeGoals) || !validScore(prediction.recommended.awayGoals)) {
    throw new Error("AI provider returned an invalid recommended score.");
  }
  if (!Array.isArray(prediction.decisiveFactors) || prediction.decisiveFactors.length < 2) {
    throw new Error("AI provider returned incomplete decisive factors.");
  }
}

export async function POST(request: Request) {
  if (process.env.AI_SCORE_ENABLED === "false") {
    return json({ error: "AI 服务已停用。" }, { status: 503 });
  }
  if (Number(request.headers.get("content-length")) > 1024) {
    return json({ error: "请求内容过大。" }, { status: 413 });
  }

  const body = (await request.json().catch(() => null)) as { matchId?: string } | null;
  const match = matches.find((item) => item.id === body?.matchId);
  if (!match) return json({ error: "比赛不存在。" }, { status: 400 });

  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (error) {
    console.error("Invalid AI score configuration:", error);
    return json({ error: "AI 服务配置无效。" }, { status: 503 });
  }
  if (!config.apiKey) return json({ error: "AI 服务尚未配置。" }, { status: 503 });

  removeExpiredEntries();
  const cacheKey = `${config.cacheKeyPrefix}:${match.id}`;
  const cached = predictionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return json(cached.data, { headers: { "X-AI-Cache": "HIT" } });
  }

  const ip = request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "local";
  if (isRateLimited(ip, config.requestLimit)) {
    return json({ error: "请求过于频繁，请稍后再试。" }, { status: 429 });
  }

  const home = teamById.get(match.homeId)!;
  const away = teamById.get(match.awayId)!;
  const homeHistory = getTeamHistory(home.id);
  const awayHistory = getTeamHistory(away.id);
  const headToHead = getHeadToHead(home.id, away.id);
  const probability = predictMatch(home, away);
  const statisticalScore = predictScore(home, away);
  const prompt = `
你是一名谨慎的国际足球赛前分析师。请只依据下方提供的数据，预测一场 2026 世界杯小组赛的比分。
不要假设未提供的伤病、阵容、天气或新闻。比分预测必须与胜平负概率大体一致，并明确不确定性。

比赛：${home.name} vs ${away.name}
日期：${match.date}
地点：${match.city}
小组：${match.group}

长期实力：
- ${home.name}: Elo ${home.elo}
- ${away.name}: Elo ${away.elo}

近期与攻防特征：
- ${home.name}: 校正状态 ${homeHistory?.adjustedFormScore ?? home.form}, 进攻 ${home.attack}, 防守 ${home.defense}, 近20场 ${homeHistory?.recentRecord.wins ?? 0}胜${homeHistory?.recentRecord.draws ?? 0}平${homeHistory?.recentRecord.losses ?? 0}负
- ${away.name}: 校正状态 ${awayHistory?.adjustedFormScore ?? away.form}, 进攻 ${away.attack}, 防守 ${away.defense}, 近20场 ${awayHistory?.recentRecord.wins ?? 0}胜${awayHistory?.recentRecord.draws ?? 0}平${awayHistory?.recentRecord.losses ?? 0}负

本地统计模型：
- 胜平负：${home.name} ${probability.home}% / 平局 ${probability.draw}% / ${away.name} ${probability.away}%
- 可信度：${probability.confidence}%
- Poisson 首选比分：${statisticalScore.recommended.homeGoals}:${statisticalScore.recommended.awayGoals}
- 预期进球：${home.name} ${statisticalScore.expectedHomeGoals} / ${away.name} ${statisticalScore.expectedAwayGoals}

历史交锋：
- 次数：${headToHead?.meetings ?? 0}
- ${home.name}胜 / 平 / ${away.name}胜：${headToHead?.homeWins ?? 0} / ${headToHead?.draws ?? 0} / ${headToHead?.awayWins ?? 0}
- 最近交锋：${headToHead?.lastMeetingDate ?? "无"}

返回简洁中文 JSON。给出一个最推荐比分，并分别提供主胜、平局、客胜三个比分剧本。confidence 为 0-100 的整数。
`.trim();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const prediction = await requestPrediction(config, prompt, controller.signal);
    validatePrediction(prediction);
    predictionCache.set(cacheKey, { data: prediction, expiresAt: Date.now() + config.cacheTtlMs });
    return json(prediction, { headers: { "X-AI-Cache": "MISS" } });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "AI 分析超时，请重试。"
      : "AI 暂时无法完成预测，请稍后重试。";
    console.error("AI score prediction failed:", error);
    return json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
