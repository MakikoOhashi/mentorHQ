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

const LEARNER_CHAT_ABSENCE_RULES = [
  "Do NOT infer learner characteristics from the absence of learner chat.",
  "Learner chat is optional and may be available after correct or incorrect answers.",
  "Therefore:",
  "- Never compare \"chat vs no chat\".",
  "- Never mention \"chat information was not provided.\"",
  "- Never treat the absence of chat as learner behavior.",
  "- Never use \"question frequency\" unless the learner actually opened learner chat.",
  "Only discuss learner chat when an actual learner chat event exists."
].join("\n");

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

function pushUniqueInsight(insights: string[], seen: Set<string>, value: string): void {
  const normalized = sanitizeText(value);

  if (!normalized || seen.has(normalized)) {
    return;
  }

  seen.add(normalized);
  insights.push(normalized);
}

function buildSummary(
  observations: ObservationEvent[],
  repeatedObservation: ObservationEvent["misunderstanding_type"] | "unknown"
): string {
  const correctCount = observations.filter((observation) => observation.correct_or_wrong === "correct").length;
  const wrongCount = observations.filter((observation) => observation.correct_or_wrong === "wrong").length;
  const chatCount = observations.filter((observation) => /Learner: /i.test(observation.note)).length;
  const repeatedLabel = getObservationLabel(repeatedObservation);
  const stableCount = observations.filter((observation) => observation.misunderstanding_type === "stable_progress").length;

  if (stableCount > 0 && correctCount >= wrongCount) {
    return `今日は、確認しながら判断できる場面が増え、学習の流れを自分で整えられていました。一方で「${repeatedLabel}」に関わる場面では少し迷いが残り、そこが今日の振り返りのポイントです。`;
  }

  if (chatCount > 0) {
    return `今日は、やり取りを重ねながら考え方を少しずつ整理できた一日でした。特に「${repeatedLabel}」に関わる場面で立ち止まりつつも、質問を使って理解を前に進められています。`;
  }

  if (correctCount > 0 && correctCount >= wrongCount) {
    return `今日は、できている判断を保ちながら進められた場面がありました。その一方で「${repeatedLabel}」に引っかかる場面もあり、判断の軸をそろえることが今日のテーマになっています。`;
  }

  return `今日は、答えを出すまでの考え方を整えることが中心になった一日でした。特に「${repeatedLabel}」が繰り返し出ており、ここを整理すると明日はもっと進めやすくなりそうです。`;
}

function buildKeyInsights(observations: ObservationEvent[]): string[] {
  const correctCount = observations.filter((observation) => observation.correct_or_wrong === "correct").length;
  const wrongCount = observations.filter((observation) => observation.correct_or_wrong === "wrong").length;
  const conditionCount = observations.filter((observation) => observation.reasoning_style === "condition_based").length;
  const memoryCount = observations.filter((observation) => observation.reasoning_style === "memory_based").length;
  const intuitionCount = observations.filter((observation) => observation.reasoning_style === "intuition").length;
  const uncertaintyCount = observations.filter((observation) => observation.reasoning_style === "uncertainty").length;
  const stableCount = observations.filter((observation) => observation.misunderstanding_type === "stable_progress").length;
  const repeatedObservation = getMostRepeatedObservation(observations, null);
  const repeatedLabel = getObservationLabel(repeatedObservation);
  const chatCount = observations.filter((observation) => /Learner: /i.test(observation.note)).length;
  const insights: string[] = [];
  const seen = new Set<string>();

  if (stableCount > 0 || (correctCount > 0 && correctCount >= wrongCount)) {
    pushUniqueInsight(insights, seen, "できている問題では、確認しながら判断を安定して続けられていました。");
  }

  if (chatCount > 0) {
    pushUniqueInsight(insights, seen, "迷った場面でも、やり取りを通して考え方を整理し直せていました。");
  }

  if (repeatedObservation !== "unknown") {
    pushUniqueInsight(insights, seen, `今日は「${repeatedLabel}」が繰り返し出ており、ここが学習の引っかかりになっていました。`);
  }

  if (conditionCount > 0) {
    pushUniqueInsight(insights, seen, "条件や判断基準を拾える場面では、答えまでの流れが比較的安定していました。");
  }

  if (memoryCount > 0) {
    pushUniqueInsight(insights, seen, "覚えている知識から先に入る場面があり、条件確認までつなげるとさらに判断しやすくなりそうです。");
  }

  if (intuitionCount > 0 || uncertaintyCount > 0 || wrongCount > 0) {
    pushUniqueInsight(insights, seen, "迷いが出た場面では、答えを急がずに根拠を一言置くと判断がぶれにくくなりそうです。");
  }

  if (correctCount > 0 && correctCount >= wrongCount) {
    pushUniqueInsight(insights, seen, "後半にかけては、できている考え方をそのまま再現できる場面が増えていました。");
  } else if (wrongCount > 0) {
    pushUniqueInsight(insights, seen, "今日は結論よりも、判断の起点をそろえることが大事な一日でした。");
  }

  return insights.slice(0, 5);
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
    "Daily Review は学習内容の要約ではなく、学習者の一日の振り返りである。",
    "Daily Review は Observation Log ではなく Learning Insight である。",
    "Observation を羅列しない。肢1/肢2の一覧にしない。会話全文を出さない。",
    "法律知識のまとめや条文説明を書かない。知識項目の列挙をしない。",
    "今日できるようになったこと、今日少し迷ったこと、学習者の傾向、明日につながる観点を書く。",
    "学習者向けに自然な日本語で、スマホで読める分量にする。",
    "summary は 2〜3 文で、今日のストーリーを書く。知識要約にしない。",
    "key_observations は 3〜5 件に絞る。",
    "key_observations は Observation の写しではなく、Observation から分かる Learning Insight に変換する。",
    "repeated_patterns は明日につながる観点として短く返す。",
    "問題情報や explanation は文脈理解のためだけに使い、説明の要約をそのまま出力しない。",
    "learner chat がある場合は、理解が動いたポイントだけを要約して反映する。",
    LEARNER_CHAT_ABSENCE_RULES,
    "Review では、『チャット有無』『質問有無』を比較対象にしない。",
    "Review の比較対象は Observation / reasoning style / misunderstanding / statement judgment / theme understanding のみ。",
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

  const learnerChats = params.observations
    .filter(
      (observation) =>
        /Learner:|Coach:/i.test(observation.note)
    )
    .map((observation) => ({
      question_id: observation.question_id,
      question_index: observation.question_index,
      statement_index: observation.statement_index,
      correct_or_wrong: observation.correct_or_wrong,
      note: observation.note
    }));

  return `次の情報をもとに、Daily Review を生成してください。

Daily Review は Observation Log ではなく Learning Insight です。
今日の観察を並べるのではなく、学習者に今日何が起きたかを短く整理してください。
AI Coach Team 全体の consensus として返してください。
法律知識のまとめにはしないでください。

出力 shape:
{
  "summary": "...",
  "key_observations": ["...", "...", "..."],
  "repeated_patterns": ["...", "..."],
  "coach_comment": "..."
}

ルール:
- summary は 2〜3 文の短い段落 1 つ
- key_observations は 3〜5 件
- repeated_patterns は明日につながる観点を短く返す
- coach_comment は学習者の傾向を自然な日本語で 1 つ
- Review agent 個人の意見として書かない
- AI Coach Team 全体の総意としてまとめる
- Observation を羅列しない
- 肢番号の列挙にしない
- Learner / Coach の会話全文を出さない
- Summary は今日のストーリーを書く
- Summary には「今日は何ができたか」と「今日はどこで少し迷ったか」だけを書く
- Summary を知識要約にしない
- 条文説明や法律知識の列挙を書かない
- 今日できるようになったことを書く
- 今日つまずいた観点を書く
- 学習者の傾向を書く
- 明日につながる観点を書く
- key_observations は Knowledge Summary ではなく Learning Insights にする
- key_observations は Observation を Insight に言い換える
- 問題情報と explanation は、学びの整理に必要な範囲だけ使う
- explanation をそのまま要約して出さない
- learner chat がある場合は、理解が動いたポイントだけ反映する
- ${LEARNER_CHAT_ABSENCE_RULES}
- 「チャット有無」「質問有無」を比較対象にしない
- 比較対象は Observation / reasoning style / misunderstanding / statement judgment / theme understanding のみ
- 同じ内容を繰り返さない
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

learner_chats:
${JSON.stringify(learnerChats, null, 2)}
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
