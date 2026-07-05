import { getDeliberationConfig, hasGeminiConfig } from "@/lib/deliberation/config";
import type { DailyReview, DailySession, ObservationEvent, TomorrowPlanInput } from "@/lib/deliberation/types";
import type { MemorySummary } from "@/lib/deliberation/session-memory";

const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

type RawGeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

type TomorrowPlanOutput = Pick<
  TomorrowPlanInput,
  "focus_theme" | "practice_items" | "caution_points" | "coach_message"
>;

const FOCUS_THEME_MAX_LENGTH = 20;
const PRACTICE_ITEM_MAX_LENGTH = 40;
const CAUTION_POINT_MAX_LENGTH = 30;

function truncateForLog(value: string, maxLength = 1000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…[truncated]` : value;
}

function sanitizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function parseJsonBlock(text: string): unknown {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonText = fencedMatch?.[1] ?? text;
  return JSON.parse(jsonText);
}

function isObservationType(value: string): value is NonNullable<ObservationEvent["misunderstanding_type"]> {
  return (
    value === "starting_point_confusion" ||
    value === "condition_omission" ||
    value === "stable_progress" ||
    value === "rushed_answer" ||
    value === "memory_based_judgment" ||
    value === "condition_based_judgment" ||
    value === "intuition_based_judgment" ||
    value === "uncertainty_signal" ||
    value === "unknown"
  );
}

function getRepeatedObservation(
  observations: ObservationEvent[],
  memorySummary?: MemorySummary | null
): ObservationEvent["misunderstanding_type"] | "unknown" {
  if (
    memorySummary?.repeatedMisunderstandingDetected &&
    memorySummary.mostRepeatedMisunderstanding &&
    isObservationType(memorySummary.mostRepeatedMisunderstanding)
  ) {
    return memorySummary.mostRepeatedMisunderstanding;
  }

  const counts = observations.reduce<Map<NonNullable<ObservationEvent["misunderstanding_type"]>, number>>((map, observation) => {
    if (!observation.misunderstanding_type) {
      return map;
    }

    map.set(observation.misunderstanding_type, (map.get(observation.misunderstanding_type) ?? 0) + 1);
    return map;
  }, new Map());

  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "unknown";
}

function buildFocusTheme(misunderstanding: ObservationEvent["misunderstanding_type"] | "unknown"): string {
  if (misunderstanding === "memory_based_judgment") {
    return "数字を見た後に条件句まで確認してから判断する";
  }

  if (misunderstanding === "condition_based_judgment") {
    return "条件句を拾う良い流れをそのまま安定させる";
  }

  if (misunderstanding === "intuition_based_judgment") {
    return "直感で答える前に根拠を一言置く";
  }

  if (misunderstanding === "uncertainty_signal") {
    return "迷ったときに判断軸を先に決める";
  }

  if (misunderstanding === "starting_point_confusion") {
    return "起算点を先に言語化してから判断する";
  }

  if (misunderstanding === "condition_omission") {
    return "条件句を拾ってから結論へ進む";
  }

  return "判断根拠を短く置いてから答える";
}

function buildPracticeItems(misunderstanding: ObservationEvent["misunderstanding_type"] | "unknown"): string[] {
  if (misunderstanding === "memory_based_judgment") {
    return [
      "数字が出る肢を2問解き、『どの条件で変わるか』を声に出す",
      "○×を決める前に『いつから・誰が』を一文で言う",
      "数字を見たあとに、主語と条件語を1つずつ拾ってから答える"
    ];
  }

  if (misunderstanding === "condition_based_judgment") {
    return [
      "条件句が入った肢を2問解き、『どの条件で変わるか』を一言で残す",
      "○×を選ぶ前に、根拠語を1つ指で追って確認する",
      "今できている確認の順番で、2肢続けて同じ手順を再現する"
    ];
  }

  if (misunderstanding === "intuition_based_judgment") {
    return [
      "直感で選びたくなる肢を2問解き、答える前に根拠を一言つける",
      "○×を選ぶ前に、条文語か条件語を1つだけ拾う",
      "『なんとなく』と思ったら、その場で根拠語を1つ言ってから答える"
    ];
  }

  if (misunderstanding === "uncertainty_signal") {
    return [
      "迷いやすい肢を2問解き、最初に『数字を見るか条件を見るか』を決める",
      "答える前に、根拠を1文だけ口に出してから○×を選ぶ",
      "選ぶ前に『どこを見直すか』を1つ決めてから判断する"
    ];
  }

  return [
    "基準が変わる肢を2問解き、『何を基準にするか』を先に一文で言う",
    "○×を選ぶ前に、根拠語を1つ見つけてから答える",
    "結論を出す前に、『誰が・いつから・どこへ』のどれかを1つ確認する"
  ];
}

function buildCautionPoints(misunderstanding: ObservationEvent["misunderstanding_type"] | "unknown"): string[] {
  if (misunderstanding === "memory_based_judgment") {
    return [
      "数字だけで正誤を決めない",
      "条件句や手続主体を一緒に確認する"
    ];
  }

  if (misunderstanding === "condition_based_judgment") {
    return [
      "条件を見たあとに結論を急ぎすぎない",
      "根拠を拾えた肢でも言い換えて再確認する"
    ];
  }

  if (misunderstanding === "intuition_based_judgment") {
    return [
      "『なんとなく正しそう』で止めない",
      "短くても具体的な根拠を一言入れる"
    ];
  }

  if (misunderstanding === "uncertainty_signal") {
    return [
      "迷ったまま即答しない",
      "数字か条件のどちらを見るかを決めてから答える"
    ];
  }

  return [
    "結論先行で進みすぎない",
    "判断根拠が曖昧なまま答えない"
  ];
}

function buildCoachMessage(
  misunderstanding: ObservationEvent["misunderstanding_type"] | "unknown",
  focusTheme: string
): string {
  if (misunderstanding === "condition_based_judgment") {
    return `明日は「${focusTheme}」を軸に、今できている条件確認をそのまま安定させます。`;
  }

  if (misunderstanding === "memory_based_judgment") {
    return `明日は「${focusTheme}」を軸に、数字の後ろにある条件まで一緒に見ます。`;
  }

  if (misunderstanding === "intuition_based_judgment") {
    return `明日は「${focusTheme}」を軸に、直感の前に短い根拠を置きます。`;
  }

  if (misunderstanding === "uncertainty_signal") {
    return `明日は「${focusTheme}」を軸に、迷ったときの判断軸を先に作ります。`;
  }

  return `明日は「${focusTheme}」を軸に、判断根拠を置いてから答える流れを整えます。`;
}

function buildFallbackPlan(
  dailySessionId: string,
  dailyReviewId: string,
  observations: ObservationEvent[],
  memorySummary?: MemorySummary | null
): TomorrowPlanInput {
  const misunderstanding = getRepeatedObservation(observations, memorySummary);
  const focusTheme = buildFocusTheme(misunderstanding);

  return {
    daily_session_id: dailySessionId,
    daily_review_id: dailyReviewId,
    focus_theme: focusTheme,
    practice_items: buildPracticeItems(misunderstanding),
    caution_points: buildCautionPoints(misunderstanding),
    coach_message: buildCoachMessage(misunderstanding, focusTheme)
  };
}

function sanitizePlan(raw: unknown): TomorrowPlanOutput | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<TomorrowPlanOutput>;
  const focusTheme = typeof candidate.focus_theme === "string" ? sanitizeText(candidate.focus_theme) : "";
  const coachMessage = typeof candidate.coach_message === "string" ? sanitizeText(candidate.coach_message) : "";
  const practiceItems = Array.isArray(candidate.practice_items)
    ? candidate.practice_items.filter((item): item is string => typeof item === "string").map((item) => sanitizeText(item)).filter(Boolean)
    : [];
  const cautionPoints = Array.isArray(candidate.caution_points)
    ? candidate.caution_points.filter((item): item is string => typeof item === "string").map((item) => sanitizeText(item)).filter(Boolean)
    : [];

  if (
    !focusTheme ||
    !coachMessage ||
    focusTheme.length > FOCUS_THEME_MAX_LENGTH ||
    practiceItems.length !== 3 ||
    practiceItems.some((item) => item.length > PRACTICE_ITEM_MAX_LENGTH) ||
    cautionPoints.length === 0 ||
    cautionPoints.length > 2 ||
    cautionPoints.some((item) => item.length > CAUTION_POINT_MAX_LENGTH)
  ) {
    return null;
  }

  return {
    focus_theme: focusTheme,
    practice_items: practiceItems.slice(0, 3),
    caution_points: cautionPoints.slice(0, 2),
    coach_message: coachMessage
  };
}

function buildSystemInstruction(): string {
  return [
    "あなたは MentorHQ の Tomorrow Plan Generator です。",
    "目的は、Daily Review と Observation と Session Memory をもとに、明日学習を始める前に5〜10秒で読める短い行動メモを返すことです。",
    "Tomorrow Plan は Daily Review の要約ではない。明日何をするかだけを書く。",
    "Observation をそのまま列挙しない。Daily Review を言い換えるだけにしない。",
    "Focus Theme は 1 つだけ返す。",
    "Practice Items は必ず 3 件返す。",
    "Caution Points は 1〜2 件返す。",
    `Focus Theme は ${FOCUS_THEME_MAX_LENGTH}文字以内の短いフレーズにする。`,
    `Practice Items は各${PRACTICE_ITEM_MAX_LENGTH}文字以内にする。`,
    `Caution Points は各${CAUTION_POINT_MAX_LENGTH}文字以内にする。`,
    "各項目は短く、学習者が明日そのまま行動できる粒度にする。",
    "Practice Items は説明文にしない。実際の行動だけを書く。",
    "『〜する練習をする』『〜する際には』のような説明調は禁止。",
    "Caution Points は短い注意だけを書く。",
    "文体は命令ではなく、自分用の付箋メモのようにする。",
    "『〜しましょう』ではなく『〜する』『〜見る』『〜確認する』程度で書く。",
    "抽象語だけで終わらない。『何をするか』が分かる表現にする。",
    "スマホ1画面で一目で読める長さを優先する。",
    "Observation にない内容を断定しない。",
    "過去傾向があれば memorySummary を少しだけ反映してよい。",
    "出力は JSON のみ。Markdown やコードフェンスは禁止。"
  ].join("\n");
}

function buildPrompt(params: {
  dailyReview: DailyReview;
  observations: ObservationEvent[];
  memorySummary?: MemorySummary | null;
  dailySession: Pick<DailySession, "question_ids" | "observation_count" | "status" | "review_status">;
}): string {
  const observationContext = params.observations.map((observation) => ({
    question_id: observation.question_id,
    question_index: observation.question_index,
    statement_index: observation.statement_index,
    learner_choice: observation.learner_choice,
    correct_or_wrong: observation.correct_or_wrong,
    observation_note: observation.observation_note
  }));

  return `次の情報をもとに、Tomorrow Plan を生成してください。

Tomorrow Plan は「明日、学習を始める前に5〜10秒で見るメモ」です。
Review の要約ではなく、明日そのままやる行動だけを書いてください。

出力 shape:
{
  "focus_theme": "...",
  "practice_items": ["...", "...", "..."],
  "caution_points": ["...", "..."],
  "coach_message": "..."
}

ルール:
- focus_theme は 1 つ
- focus_theme は ${FOCUS_THEME_MAX_LENGTH}文字以内
- practice_items は 3 件ちょうど
- practice_items は各${PRACTICE_ITEM_MAX_LENGTH}文字以内
- caution_points は 2 件まで
- caution_points は各${CAUTION_POINT_MAX_LENGTH}文字以内
- 各項目は短く、スマホで一目で読める長さにする
- 学習者が明日そのまま実行できる内容にする
- Action First。説明より先に行動を書く
- Observation をそのまま列挙しない
- Daily Review の言い換えにしない
- Daily Review の内容を踏まえて、明日の行動に変換する
- memorySummary があれば過去傾向を少し反映する
- 「何をするか」が分かる表現にする
- 抽象語だけで終わらない
- Practice Items は説明文にしない
- 「〜する練習をする」「〜する際には」のような書き方は禁止
- 例: 「いつから」を先に探す
- 例: 熟慮期間の起算点を復習する
- 例: 判断前に基準語を確認する
- 例: 決議要件だけ解き直す
- 悪い例: 問題文を読む際、まず「いつから」「何を基準に」を特定する練習をする。
- 悪い例: 新しい問題に挑戦する際、結論を出す前に必ず起点を声に出して確認する。
- Caution Points は短い注意だけにする
- 例: 数字だけで判断しない
- 例: 起点を飛ばさない
- 例: 条件を読み飛ばさない
- 例: 迷った理由を確認する
- 悪い例: 最終的に正解できても、起算点や判断基準に迷った場合は、その過程を必ず振り返る。
- 悪い例: 「分かったつもり」にならず、問題文の指示を正確に読み取り、焦らず起点を設定する。
- 文体は「〜する」「〜見る」「〜確認する」程度にする
- Coach Message は短く、明日の姿勢を一言で示す

daily_session:
${JSON.stringify(params.dailySession, null, 2)}

daily_review:
${JSON.stringify(params.dailyReview, null, 2)}

observation_events:
${JSON.stringify(observationContext, null, 2)}

memory_summary:
${JSON.stringify(params.memorySummary ?? null, null, 2)}
`;
}

export async function buildTomorrowPlanInput(params: {
  dailySessionId: string;
  dailyReview: DailyReview;
  observations: ObservationEvent[];
  memorySummary?: MemorySummary | null;
  dailySession: Pick<DailySession, "question_ids" | "observation_count" | "status" | "review_status">;
}): Promise<TomorrowPlanInput> {
  const fallback = buildFallbackPlan(
    params.dailySessionId,
    params.dailyReview.id,
    params.observations,
    params.memorySummary
  );
  const config = getDeliberationConfig();

  if (!hasGeminiConfig(config)) {
    return fallback;
  }

  try {
    const prompt = buildPrompt(params);

    console.info("[tomorrow-plan][gemini] request", {
      dailySessionId: params.dailySessionId,
      observationCount: params.observations.length,
      promptPreview: truncateForLog(prompt)
    });

    const response = await fetch(
      `${GEMINI_API_ROOT}/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: buildSystemInstruction()
              }
            ]
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.5,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      const responseBody = await response.text();
      console.error("[tomorrow-plan][gemini] non-ok response", {
        status: response.status,
        statusText: response.statusText,
        body: truncateForLog(responseBody)
      });
      return fallback;
    }

    const responseBody = await response.text();
    const payload = JSON.parse(responseBody) as RawGeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

    console.info("[tomorrow-plan][gemini] response", {
      dailySessionId: params.dailySessionId,
      textPreview: truncateForLog(text)
    });

    if (!text) {
      return fallback;
    }

    const parsed = parseJsonBlock(text);
    const plan = sanitizePlan(parsed);

    if (!plan) {
      console.warn("[tomorrow-plan][gemini] sanitize failed", {
        dailySessionId: params.dailySessionId,
        rawText: truncateForLog(text)
      });
      return fallback;
    }

    return {
      daily_session_id: params.dailySessionId,
      daily_review_id: params.dailyReview.id,
      focus_theme: plan.focus_theme,
      practice_items: plan.practice_items,
      caution_points: plan.caution_points,
      coach_message: plan.coach_message
    };
  } catch (error) {
    console.error("[tomorrow-plan][gemini] request failed", error);
    return fallback;
  }
}
