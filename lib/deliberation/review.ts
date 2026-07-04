import { getLearnerCaseByQuestionId } from "@/lib/deliberation/mock";
import type { DailyReviewInput, ObservationEvent } from "@/lib/deliberation/types";
import type { MemorySummary } from "@/lib/deliberation/session-memory";

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

export function buildDailyReviewInput(params: {
  dailySessionId: string;
  observations: ObservationEvent[];
  memorySummary?: MemorySummary | null;
}): DailyReviewInput {
  const { dailySessionId, observations, memorySummary } = params;
  const repeatedObservation = getMostRepeatedObservation(observations, memorySummary);

  return {
    daily_session_id: dailySessionId,
    summary: buildSummary(observations, repeatedObservation),
    key_observations: buildKeyInsights(observations),
    repeated_patterns: buildTomorrowCandidates(repeatedObservation, observations),
    coach_comment: buildLearnerPattern(repeatedObservation, observations)
  };
}
