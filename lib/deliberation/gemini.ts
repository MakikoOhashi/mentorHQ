import { AGENTS } from "@/lib/deliberation/agents";
import { getDeliberationConfig, hasGeminiConfig } from "@/lib/deliberation/config";
import { buildMockDeliberationResponse } from "@/lib/deliberation/mock";
import { getLatestMemoryContext, getLatestMemorySummary, type MemorySummary } from "@/lib/deliberation/session-memory";
import type {
  AgentId,
  CoachDecision,
  DeliberationEvent,
  DeliberationResponse,
  LearnerCase,
  SelectedIntervention
} from "@/lib/deliberation/types";
import { SELECTED_INTERVENTIONS } from "@/lib/deliberation/types";

const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

const speakerLabels: Record<AgentId, string> = {
  misconception: "誤解仮説エージェント",
  memory: "記憶参照エージェント",
  load: "負荷調整エージェント",
  coach: "コーチ"
};

type RawGeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

function truncateForLog(value: string, maxLength = 1000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…[truncated]` : value;
}

function getErrorDetails(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return {
    name: typeof error,
    message: String(error)
  };
}

function parseJsonBlock(text: string): unknown {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonText = fencedMatch?.[1] ?? text;
  return JSON.parse(jsonText);
}

function isFiniteConfidence(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function containsJapanese(text: string): boolean {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text);
}

function isNaturalMessageLength(text: string): boolean {
  const length = text.trim().length;
  return length >= 15 && length <= 40;
}

function normalizeSelectedIntervention(value: string): SelectedIntervention {
  const normalized = value.trim().toLowerCase();

  if (SELECTED_INTERVENTIONS.includes(normalized as SelectedIntervention)) {
    return normalized as SelectedIntervention;
  }

  if (
    normalized.includes("starting") ||
    normalized.includes("起算") ||
    normalized.includes("いつから") ||
    normalized.includes("start_point")
  ) {
    return "starting_point_check";
  }

  if (normalized.includes("contrast") || normalized.includes("compare") || normalized.includes("比較")) {
    return "contrast_check";
  }

  if (normalized.includes("integrated") || normalized.includes("retry") || normalized.includes("再回答")) {
    return "integrated_retry";
  }

  if (normalized.includes("leg") || normalized.includes("breakdown") || normalized.includes("脚")) {
    return "leg_breakdown";
  }

  return "starting_point_check";
}

function sanitizeDecision(raw: unknown): CoachDecision | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Partial<CoachDecision>;
  if (
    typeof candidate.selected_intervention !== "string" ||
    typeof candidate.reason !== "string" ||
    typeof candidate.next_question !== "string" ||
    !containsJapanese(candidate.reason) ||
    !containsJapanese(candidate.next_question)
  ) {
    return null;
  }

  return {
    selected_intervention: normalizeSelectedIntervention(candidate.selected_intervention),
    reason: candidate.reason,
    next_question: candidate.next_question
  };
}

function sanitizeEvent(raw: unknown): DeliberationEvent | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Record<string, unknown>;
  const speaker = candidate.speaker;
  const type = candidate.type;
  const round = candidate.round;
  const message = candidate.message;

  if (
    (speaker !== "misconception" && speaker !== "memory" && speaker !== "load" && speaker !== "coach") ||
    (type !== "observation" &&
      type !== "challenge" &&
      type !== "revision" &&
      type !== "recommendation" &&
      type !== "coach_decision") ||
    typeof round !== "number" ||
    typeof message !== "string" ||
    !containsJapanese(message)
  ) {
    return null;
  }

  if (!isNaturalMessageLength(message)) {
    return null;
  }

  const hypothesis = typeof candidate.hypothesis === "string" ? candidate.hypothesis : undefined;
  if (hypothesis && !containsJapanese(hypothesis)) {
    return null;
  }

  const influenced_by = Array.isArray(candidate.influenced_by)
    ? candidate.influenced_by.filter(
        (value): value is AgentId =>
          value === "misconception" || value === "memory" || value === "load" || value === "coach"
      )
    : undefined;

  const baseEvent = {
    round,
    speaker,
    speaker_label: typeof candidate.speaker_label === "string" ? candidate.speaker_label : speakerLabels[speaker],
    type,
    message,
    hypothesis,
    confidence_before: isFiniteConfidence(candidate.confidence_before) ? candidate.confidence_before : undefined,
    confidence_after: isFiniteConfidence(candidate.confidence_after) ? candidate.confidence_after : undefined,
    influenced_by
  } satisfies DeliberationEvent;

  if (type === "revision") {
    if (
      typeof baseEvent.hypothesis !== "string" ||
      !isFiniteConfidence(baseEvent.confidence_before) ||
      !isFiniteConfidence(baseEvent.confidence_after)
    ) {
      return null;
    }

    return {
      ...baseEvent,
      influenced_by: influenced_by ?? []
    };
  }

  return baseEvent;
}

function normalizeDeliberationEvents(events: DeliberationEvent[]): DeliberationEvent[] {
  const deduped = events.filter((event, index, array) => {
    return (
      index === array.findIndex((candidate) => candidate.speaker === event.speaker && candidate.type === event.type)
    );
  });

  const limited = deduped.slice(0, 6);
  const coachDecisionIndex = limited.findIndex((event) => event.type === "coach_decision");

  if (coachDecisionIndex >= 0 && coachDecisionIndex !== limited.length - 1) {
    const [coachDecision] = limited.splice(coachDecisionIndex, 1);
    limited.push(coachDecision);
  }

  return limited;
}

function injectMemorySummary(events: DeliberationEvent[], memorySummary: MemorySummary | null): DeliberationEvent[] {
  if (!memorySummary) {
    return events;
  }

  return events.map((event) => {
    if (event.speaker !== "memory") {
      return event;
    }

    if (event.message.includes("前回")) {
      return event;
    }

    return {
      ...event,
      message: memorySummary.memoryMessageHint
    };
  });
}

function sanitizeResponse(raw: unknown, memorySummary: MemorySummary | null): DeliberationResponse | null {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as {
    deliberation_events?: unknown[];
    coach_decision?: unknown;
  };

  if (!Array.isArray(candidate.deliberation_events)) {
    return null;
  }

  const deliberationEvents = injectMemorySummary(
    normalizeDeliberationEvents(
    candidate.deliberation_events
    .map((event) => sanitizeEvent(event))
    .filter((event): event is DeliberationEvent => event !== null)
    ),
    memorySummary
  );

  const coachDecision = sanitizeDecision(candidate.coach_decision);

  const hasRevisionEvent = deliberationEvents.some((event) => event.type === "revision");
  const hasCoachDecisionEvent = deliberationEvents.some((event) => event.type === "coach_decision");

  if (!coachDecision || !hasRevisionEvent || !hasCoachDecisionEvent) {
    return null;
  }

  return {
    mode: "ai",
    deliberation_events: deliberationEvents,
    coach_decision: coachDecision
  };
}

function getSanitizeFailureDetails(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return {
      reason: "response is not an object",
      deliberationEventsIsArray: false,
      hasCoachDecision: false,
      hasRevisionEvent: false,
      hasCoachDecisionEvent: false
    };
  }

  const candidate = raw as {
    deliberation_events?: unknown[];
    coach_decision?: unknown;
  };

  const deliberationEventsIsArray = Array.isArray(candidate.deliberation_events);
  const rawEvents: unknown[] = Array.isArray(candidate.deliberation_events) ? candidate.deliberation_events : [];
  const sanitizedEvents = normalizeDeliberationEvents(
    rawEvents
    .map((event) => sanitizeEvent(event))
    .filter((event): event is DeliberationEvent => event !== null)
  );
  const coachDecision = sanitizeDecision(candidate.coach_decision);
  const hasRevisionEvent = sanitizedEvents.some((event) => event.type === "revision");
  const hasCoachDecisionEvent = sanitizedEvents.some((event) => event.type === "coach_decision");

  let reason = "unknown schema validation failure";
  if (!deliberationEventsIsArray) {
    reason = "deliberation_events is not an array";
  } else if (!coachDecision) {
    reason = "coach_decision is missing or invalid";
  } else if (!hasRevisionEvent) {
    reason = "revision event is missing";
  } else if (!hasCoachDecisionEvent) {
    reason = "coach_decision event is missing";
  }

  return {
    reason,
    deliberationEventsIsArray,
    hasCoachDecision: coachDecision !== null,
    hasRevisionEvent,
    hasCoachDecisionEvent
  };
}

function buildPrompt(learnerCase: LearnerCase, memoryContext?: string | null): string {
  return `あなたは MentorHQ の Agent Deliberation JSON を生成します。

${memoryContext ? `${memoryContext}\n\n` : ""}出力は **JSON のみ** にしてください。説明文、前置き、Markdown、コードフェンスは禁止です。

次の shape に厳密に従ってください:
{
  "deliberation_events": [
    {
      "round": 1,
      "speaker": "misconception",
      "speaker_label": "誤解仮説エージェント",
      "type": "observation",
      "message": "日本語",
      "hypothesis": "日本語",
      "confidence_after": 0.84,
      "influenced_by": ["memory"]
    }
  ],
  "coach_decision": {
    "selected_intervention": "starting_point_check",
    "reason": "日本語",
    "next_question": "日本語"
  }
}

必須パターンの JSON 例:
{
  "deliberation_events": [
    {
      "round": 1,
      "speaker": "misconception",
      "speaker_label": "誤解仮説エージェント",
      "type": "observation",
      "message": "3ヶ月は覚えてる。でも、いつからかが抜けてます。",
      "hypothesis": "起算点誤認かも",
      "confidence_after": 0.84,
      "influenced_by": []
    },
    {
      "round": 2,
      "speaker": "memory",
      "speaker_label": "記憶参照エージェント",
      "type": "challenge",
      "message": "前も条件を読み飛ばしてたし、今回もその線あります。",
      "hypothesis": "条件読み落としもありそう",
      "confidence_after": 0.66,
      "influenced_by": ["misconception"]
    },
    {
      "round": 2,
      "speaker": "misconception",
      "speaker_label": "誤解仮説エージェント",
      "type": "revision",
      "message": "なるほど。起算点だけじゃなく条件読み落としも見ます。",
      "hypothesis": "起算点誤認＋条件読み落とし",
      "confidence_before": 0.84,
      "confidence_after": 0.68,
      "influenced_by": ["memory"]
    },
    {
      "round": 3,
      "speaker": "load",
      "speaker_label": "負荷調整エージェント",
      "type": "recommendation",
      "message": "説明はまだ早いです。まず一問で切り分けましょう。",
      "hypothesis": "一問確認が軽い",
      "confidence_after": 0.9,
      "influenced_by": ["misconception", "memory"]
    },
    {
      "round": 4,
      "speaker": "coach",
      "speaker_label": "コーチ",
      "type": "coach_decision",
      "message": "では起算点確認でいきます。ここがいちばん早いです。",
      "hypothesis": "説明前に起算点を確認",
      "confidence_after": 0.88,
      "influenced_by": ["misconception", "memory", "load"]
    }
  ],
  "coach_decision": {
    "selected_intervention": "starting_point_check",
    "reason": "一問で起算点のズレを切り分けやすいからです。",
    "next_question": "その3ヶ月は、いつから数えると思いましたか？"
  }
}

絶対ルール:
- speaker は misconception, memory, load, coach のみ許可。
- speaker_label は日本語にし、以下を使う: 誤解仮説エージェント / 記憶参照エージェント / 負荷調整エージェント / コーチ。
- type は observation, challenge, revision, recommendation, coach_decision のみ許可。
- message は **必ず日本語**。
- message は **日本語で 15〜40 文字程度** にする。
- message は **会議での短い発言** にする。自然で少しくだけた口調にする。
- 「〜を考慮し、仮説を更新します」「〜の可能性があります」など、硬いレポート文体は禁止。
- 説明口調は禁止。会議で口を挟むひと言の温度にする。
- speaker_label や Agent 名を、message 本文に書かない。
- hypothesis は存在する場合 **必ず日本語**。
- hypothesis は UI にほぼ出ない前提なので、短く雑味なく書く。
- coach_decision.reason は **必ず日本語**。
- coach_decision.next_question は **必ず日本語**。
- selected_intervention は次の enum のどれか 1 つのみ許可:
  - leg_breakdown
  - contrast_check
  - starting_point_check
  - integrated_retry
- deliberation_events には **必ず最低 1 件** type: "revision" を含める。
- revision event では **必ず** confidence_before と confidence_after の両方を出す。
- revision event では influenced_by を **空配列にせず、最低 1 件** 入れる。
- coach_decision object とは別に、deliberation_events 内にも **必ず最低 1 件** type: "coach_decision" を含める。
- deliberation_events の **最後の event** は必ず type: "coach_decision" にする。
- deliberation_events は **最大 6 件**。5 件でもよい。
- 同じ speaker と type の重複は避ける。
- coach_decision event の speaker は **必ず** "coach" にする。
- Round 1 は初期観測、Round 2 は challenge/revision、Round 3 は介入の絞り込み、Round 4 は coach_decision にする。
- 多数決は禁止。コーチが理由付きで最終判断する。
- 各 message は短いが、動きが見える具体さを残す。
- confidence_before / confidence_after は存在する場合 0 以上 1 以下の数値にする。
- influenced_by は必要最小限にする。

優先したい並び:
- observation 1件
- challenge 1件
- revision 1件
- recommendation 1件
- coach_decision 1件
- 必要なら追加 1件まで

このケースの判断方針:
- 学習者は「3ヶ月以内」という期間自体には反応しているが、起算点を言語化していない。
- 最初に自然に選ばれる介入は starting_point_check である。
- 他の enum を選ぶのは、出力全体の根拠がそれを強く支持する場合だけにする。
- これは分析レポートではなく、AIスタッフ会議の実況である。

Agent definitions:
${JSON.stringify(AGENTS, null, 2)}

Learner case:
${JSON.stringify(learnerCase, null, 2)}
`;
}

export async function generateDeliberation(learnerCase: LearnerCase): Promise<DeliberationResponse> {
  const config = getDeliberationConfig();
  const hasApiKey = hasGeminiConfig(config);
  const [memoryContext, memorySummary] = await Promise.all([
    getLatestMemoryContext(),
    getLatestMemorySummary()
  ]);

  console.warn("[deliberation][gemini] config", {
    hasApiKey,
    keyLength: config.apiKey.length,
    hasMemoryContext: Boolean(memoryContext)
  });

  console.log("[deliberation][memory]", {
    hasMemoryContext: Boolean(memoryContext),
    memoryLength: memoryContext?.length ?? 0
  });

  if (!hasApiKey) {
    return buildMockDeliberationResponse(memorySummary);
  }

  try {
    console.warn("[deliberation][gemini] request start", {
      model: config.model
    });

    const response = await fetch(
      `${GEMINI_API_ROOT}/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: buildPrompt(learnerCase, memoryContext)
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.65,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      const responseBody = await response.text();

      console.error("[deliberation][gemini] non-ok response", {
        status: response.status,
        statusText: response.statusText,
        body: truncateForLog(responseBody)
      });

      return buildMockDeliberationResponse(memorySummary);
    }

    const responseBody = await response.text();
    const payload = JSON.parse(responseBody) as RawGeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

    console.warn("[deliberation][gemini] response text extracted", {
      hasText: Boolean(text),
      textLength: text.length,
      textPreview: truncateForLog(text)
    });

    if (!text) {
      return buildMockDeliberationResponse(memorySummary);
    }

    let parsed: unknown;

    try {
      parsed = parseJsonBlock(text);
    } catch (error) {
      const details = getErrorDetails(error);

      console.error("[deliberation][gemini] json parse failed", {
        errorName: details.name,
        errorMessage: details.message,
        rawText: truncateForLog(text)
      });

      return buildMockDeliberationResponse(memorySummary);
    }

    const sanitized = sanitizeResponse(parsed, memorySummary);

    if (!sanitized) {
      console.warn("[deliberation][gemini] sanitizeResponse returned null", getSanitizeFailureDetails(parsed));
    }

    if (sanitized) {
      console.warn("[deliberation][gemini] success", {
        mode: sanitized.mode,
        selectedIntervention: sanitized.coach_decision.selected_intervention,
        eventCount: sanitized.deliberation_events.length
      });
    }

    return sanitized ?? buildMockDeliberationResponse(memorySummary);
  } catch (error) {
    const details = getErrorDetails(error);

    console.error("[deliberation][gemini] request failed", {
      errorName: details.name,
      errorMessage: details.message
    });

    return buildMockDeliberationResponse(memorySummary);
  }
}
