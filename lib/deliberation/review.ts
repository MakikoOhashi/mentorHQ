import { getDeliberationConfig, hasGeminiConfig } from "@/lib/deliberation/config";
import { getLearnerCaseByQuestionId } from "@/lib/deliberation/mock";
import type { DailyReviewInput, DailySession, ObservationEvent } from "@/lib/deliberation/types";
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

type DailyReviewOutput = Omit<DailyReviewInput, "daily_session_id">;

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

function getObservationLabel(value: ObservationEvent["misunderstanding_type"] | string | null): string {
  switch (value) {
    case "memory_based_judgment":
      return "数字や記憶を手がかりに進める場面";
    case "condition_based_judgment":
      return "条件を整理しながら進める場面";
    case "intuition_based_judgment":
      return "直感で先に進みやすい場面";
    case "uncertainty_signal":
      return "迷いが残りやすい場面";
    case "starting_point_confusion":
      return "起点を取り違えやすい場面";
    case "condition_omission":
      return "条件を見落としやすい場面";
    case "stable_progress":
      return "確認しながら安定して進められた場面";
    case "rushed_answer":
      return "急いで答えやすい場面";
    default:
      return "考え方の癖";
  }
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

function getMostRepeatedObservation(
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

function collectUniqueExplanationInsights(observations: ObservationEvent[]): string[] {
  const insights: string[] = [];
  const seen = new Set<string>();

  observations.forEach((observation) => {
    if (!observation.question_id || !observation.statement_index) {
      return;
    }

    const learnerCase = getLearnerCaseByQuestionId(observation.question_id);
    const statement = learnerCase?.statements[observation.statement_index - 1];
    const explanation = statement?.explanation?.trim();

    if (!explanation || seen.has(explanation)) {
      return;
    }

    seen.add(explanation);
    insights.push(explanation);
  });

  return insights;
}

function buildSummary(
  observations: ObservationEvent[],
  repeatedObservation: ObservationEvent["misunderstanding_type"] | "unknown"
): string {
  const totalStatements = observations.length;
  const correctCount = observations.filter((observation) => observation.correct_or_wrong === "correct").length;
  const wrongCount = observations.filter((observation) => observation.correct_or_wrong === "wrong").length;
  const chatCount = observations.filter((observation) => /Learner: /i.test(observation.note)).length;
  const repeatedLabel = getObservationLabel(repeatedObservation);

  if (correctCount > 0 && correctCount >= wrongCount) {
    return `今日は ${totalStatements} 件の Observation から、後半に向けて正しく判断できる場面が増え、理解が整理されてきた様子が見えます。特に「${repeatedLabel}」が今日の学びの軸になっていました。`;
  }

  if (chatCount > 0) {
    return `今日は ${totalStatements} 件の Observation を通じて、質問しながら理解を深める場面が見られました。特に「${repeatedLabel}」に関わる箇所で、考え方を整えようとしていた様子があります。`;
  }

  return `今日は ${totalStatements} 件の Observation から、判断の進め方にいくつかの癖が見えました。特に「${repeatedLabel}」が繰り返し現れており、ここを整理すると学習全体が進みやすくなりそうです。`;
}

function buildKeyInsights(observations: ObservationEvent[]): string[] {
  const correctCount = observations.filter((observation) => observation.correct_or_wrong === "correct").length;
  const wrongCount = observations.filter((observation) => observation.correct_or_wrong === "wrong").length;
  const conditionCount = observations.filter((observation) => observation.reasoning_style === "condition_based").length;
  const memoryCount = observations.filter((observation) => observation.reasoning_style === "memory_based").length;
  const explanations = collectUniqueExplanationInsights(observations);
  const insights: string[] = [];

  explanations.slice(0, 3).forEach((explanation) => {
    insights.push(explanation);
  });

  if (conditionCount > 0) {
    insights.push("条件や要件を見ながら判断できる場面がありました。");
  }

  if (memoryCount > 0) {
    insights.push("数字や既に覚えている知識を手がかりに進める場面が見られました。");
  }

  if (correctCount > 0 && correctCount >= wrongCount) {
    insights.push("後半では正答が続き、判断の再現性が少しずつ安定してきました。");
  } else if (wrongCount > 0) {
    insights.push("迷いやすい箇所が残っており、判断軸をそろえる余地がありそうです。");
  }

  return Array.from(new Set(insights)).slice(0, 5);
}

function buildLearnerPattern(
  repeatedObservation: ObservationEvent["misunderstanding_type"] | "unknown",
  observations: ObservationEvent[]
): string {
  const chatCount = observations.filter((observation) => /Learner: /i.test(observation.note)).length;
  const conditionCount = observations.filter((observation) => observation.reasoning_style === "condition_based").length;
  const memoryCount = observations.filter((observation) => observation.reasoning_style === "memory_based").length;

  if (chatCount > 0) {
    return "質問をきっかけに理解を深めていく学び方が見えているようです。";
  }

  if (conditionCount > memoryCount && conditionCount > 0) {
    return "条件や要件を整理しながら考えると、理解が進みやすいタイプかもしれません。";
  }

  if (memoryCount > 0) {
    return "まず覚えている数字や知識を手がかりにし、その後で整理していく傾向があるようです。";
  }

  if (repeatedObservation !== "unknown") {
    return `${getObservationLabel(repeatedObservation)}に注意を向けると、学び方が安定していくかもしれません。`;
  }

  return "まだ Observation は少ないですが、考え方の型を少しずつ作っていく段階にあるようです。";
}

function buildTomorrowCandidates(
  repeatedObservation: ObservationEvent["misunderstanding_type"] | "unknown",
  observations: ObservationEvent[]
): string[] {
  const totalStatements = observations.length;
  const candidates: string[] = [];

  if (repeatedObservation === "condition_based_judgment" || repeatedObservation === "condition_omission") {
    candidates.push("要件や条件句だけを抜き出して、違いを見比べてみましょう。");
  }

  if (repeatedObservation === "memory_based_judgment") {
    candidates.push("数字や条文番号だけでなく、その前後の条件もセットで確認してみましょう。");
  }

  if (repeatedObservation === "starting_point_confusion") {
    candidates.push("起点になる言葉を先に見つけてから、結論を判断する練習をしてみましょう。");
  }

  if (repeatedObservation === "intuition_based_judgment" || repeatedObservation === "uncertainty_signal") {
    candidates.push("答える前に、一言だけでも根拠を置く練習をしてみましょう。");
  }

  const chatCount = observations.filter((observation) => /Learner: /i.test(observation.note)).length;
  if (chatCount > 0) {
    candidates.push("気になった用語はその場で短く確認し、理解の引っかかりを残さないようにしましょう。");
  }

  candidates.push(`今日の ${totalStatements} 件の Observation を踏まえ、迷いやすかった論点だけを短く復習してみましょう。`);

  return Array.from(new Set(candidates)).slice(0, 4);
}

function buildFallbackReview(
  dailySessionId: string,
  observations: ObservationEvent[],
  memorySummary?: MemorySummary | null
): DailyReviewInput {
  const repeatedObservation = getMostRepeatedObservation(observations, memorySummary);

  return {
    daily_session_id: dailySessionId,
    summary: buildSummary(observations, repeatedObservation),
    key_observations: buildKeyInsights(observations),
    repeated_patterns: buildTomorrowCandidates(repeatedObservation, observations),
    coach_comment: buildLearnerPattern(repeatedObservation, observations)
  };
}

function sanitizeReview(raw: unknown): DailyReviewOutput | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<DailyReviewOutput>;
  const summary = typeof candidate.summary === "string" ? sanitizeText(candidate.summary) : "";
  const coachComment = typeof candidate.coach_comment === "string" ? sanitizeText(candidate.coach_comment) : "";
  const keyObservations = Array.isArray(candidate.key_observations)
    ? candidate.key_observations
        .filter((item): item is string => typeof item === "string")
        .map((item) => sanitizeText(item))
        .filter(Boolean)
    : [];
  const repeatedPatterns = Array.isArray(candidate.repeated_patterns)
    ? candidate.repeated_patterns
        .filter((item): item is string => typeof item === "string")
        .map((item) => sanitizeText(item))
        .filter(Boolean)
    : [];

  if (!summary || !coachComment || keyObservations.length < 3 || keyObservations.length > 5 || repeatedPatterns.length === 0) {
    return null;
  }

  return {
    summary,
    key_observations: keyObservations.slice(0, 5),
    repeated_patterns: repeatedPatterns.slice(0, 4),
    coach_comment: coachComment
  };
}

function buildSystemInstruction(): string {
  return [
    "あなたは MentorHQ の Daily Review Generator です。",
    "目的は、保存済み observation_events と session memory をもとに、学習者向けの短い Daily Review を返すことです。",
    "Daily Review は AI Coach Team 全体の consensus である。",
    "Review agent 個人の意見として書かない。",
    "Daily Review は Observation Log ではなく Learning Insight である。",
    "Observation を羅列しない。肢1/肢2の一覧にしない。会話全文を出さない。",
    "今日できるようになったこと、今日つまずいた観点、学習者の傾向、明日につながる観点を書く。",
    "学習者向けに自然な日本語で、スマホで読める分量にする。",
    "key_observations は 3〜5 件に絞る。",
    "repeated_patterns は明日につながる観点として短く返す。",
    "問題情報や explanation は、学びが整理されたポイントを要約するために使ってよい。",
    "誤答後チャットがある場合は、理解が動いたポイントだけを要約して反映する。",
    "Observation にない内容を断定しない。",
    "出力は JSON のみ。Markdown やコードフェンスは禁止。"
  ].join("\n");
}

function buildPrompt(params: {
  dailySessionId: string;
  observations: ObservationEvent[];
  memorySummary?: MemorySummary | null;
  dailySession: Pick<DailySession, "question_ids" | "observation_count" | "status">;
}): string {
  const observationContext = params.observations.map((observation) => ({
    question_id: observation.question_id,
    question_index: observation.question_index,
    statement_index: observation.statement_index,
    learner_choice: observation.learner_choice,
    correct_or_wrong: observation.correct_or_wrong,
    learner_reason: observation.learner_reason,
    reasoning_style: observation.reasoning_style,
    misunderstanding_type: observation.misunderstanding_type,
    intervention_type: observation.intervention_type,
    observation_note: observation.observation_note
  }));

  const questionContexts = Array.from(
    new Map(
      params.dailySession.question_ids
        .map((questionId) => {
          const learnerCase = getLearnerCaseByQuestionId(questionId);
          if (!learnerCase) {
            return null;
          }

          return [
            questionId,
            {
              question_id: questionId,
              question_title: learnerCase.questionTitle,
              statements: learnerCase.statements.map((statement, index) => ({
                statement_index: index + 1,
                text: statement.text,
                explanation: statement.explanation
              }))
            }
          ] as const;
        })
        .filter((entry): entry is readonly [string, {
          question_id: string;
          question_title: string;
          statements: Array<{ statement_index: number; text: string; explanation: string }>;
        }] => entry !== null)
    ).values()
  );

  const wrongAnswerChats = params.observations
    .filter(
      (observation) =>
        observation.correct_or_wrong === "wrong" && /Learner:|Coach:/i.test(observation.note)
    )
    .map((observation) => ({
      question_id: observation.question_id,
      question_index: observation.question_index,
      statement_index: observation.statement_index,
      note: observation.note
    }));

  return `次の情報をもとに、Daily Review を生成してください。

Daily Review は Observation Log ではなく Learning Insight です。
今日の観察を並べるのではなく、学習者が今日どう学べたかを短く整理してください。
AI Coach Team 全体の consensus として返してください。

出力 shape:
{
  "summary": "...",
  "key_observations": ["...", "...", "..."],
  "repeated_patterns": ["...", "..."],
  "coach_comment": "..."
}

ルール:
- summary は短い段落 1 つ
- key_observations は 3〜5 件
- repeated_patterns は明日につながる観点を短く返す
- coach_comment は学習者の傾向を自然な日本語で 1 つ
- Review agent 個人の意見として書かない
- AI Coach Team 全体の総意としてまとめる
- Observation を羅列しない
- 肢番号の列挙にしない
- Learner / Coach の会話全文を出さない
- 今日できるようになったことを書く
- 今日つまずいた観点を書く
- 学習者の傾向を書く
- 明日につながる観点を書く
- 問題情報と explanation は、学びの整理に必要な範囲だけ使う
- 誤答後チャットがある場合は、理解が動いたポイントだけ反映する
- 固定文言ではなく、与えられたデータに応じた内容にする

daily_session:
${JSON.stringify(
    {
      sessionId: params.dailySessionId,
      question_ids: params.dailySession.question_ids,
      observation_count: params.dailySession.observation_count,
      status: params.dailySession.status
    },
    null,
    2
  )}

observation_events:
${JSON.stringify(observationContext, null, 2)}

memory_summary:
${JSON.stringify(params.memorySummary ?? null, null, 2)}

question_context:
${JSON.stringify(questionContexts, null, 2)}

wrong_answer_chats:
${JSON.stringify(wrongAnswerChats, null, 2)}
`;
}

export async function buildDailyReviewInput(params: {
  dailySessionId: string;
  observations: ObservationEvent[];
  memorySummary?: MemorySummary | null;
  dailySession: Pick<DailySession, "question_ids" | "observation_count" | "status">;
}): Promise<DailyReviewInput> {
  const fallback = buildFallbackReview(params.dailySessionId, params.observations, params.memorySummary);
  const config = getDeliberationConfig();

  if (!hasGeminiConfig(config)) {
    return fallback;
  }

  try {
    const prompt = buildPrompt(params);

    console.info("[daily-review][gemini] request", {
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
            temperature: 0.4,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      const responseBody = await response.text();
      console.error("[daily-review][gemini] non-ok response", {
        status: response.status,
        statusText: response.statusText,
        body: truncateForLog(responseBody)
      });
      return fallback;
    }

    const responseBody = await response.text();
    const payload = JSON.parse(responseBody) as RawGeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

    console.info("[daily-review][gemini] response", {
      dailySessionId: params.dailySessionId,
      textPreview: truncateForLog(text)
    });

    if (!text) {
      return fallback;
    }

    const parsed = parseJsonBlock(text);
    const review = sanitizeReview(parsed);

    if (!review) {
      console.warn("[daily-review][gemini] sanitize failed", {
        dailySessionId: params.dailySessionId,
        rawText: truncateForLog(text)
      });
      return fallback;
    }

    return {
      daily_session_id: params.dailySessionId,
      summary: review.summary,
      key_observations: review.key_observations,
      repeated_patterns: review.repeated_patterns,
      coach_comment: review.coach_comment
    };
  } catch (error) {
    console.error("[daily-review][gemini] request failed", error);
    return fallback;
  }
}
