import type { DailyReviewInput, ObservationEvent } from "@/lib/deliberation/types";
import type { MemorySummary } from "@/lib/deliberation/session-memory";

function getObservationLabel(value: ObservationEvent["misunderstanding_type"] | string | null): string {
  switch (value) {
    case "memory_based_judgment":
      return "数字や記憶を根拠に置く判断";
    case "condition_based_judgment":
      return "条件句を根拠に置く判断";
    case "intuition_based_judgment":
      return "直感寄りの判断";
    case "uncertainty_signal":
      return "迷いを残した判断";
    case "starting_point_confusion":
      return "起算点の取り方";
    case "condition_omission":
      return "条件句の読み取り";
    case "stable_progress":
      return "条件を見て進める姿勢";
    case "rushed_answer":
      return "確認前に答える傾向";
    default:
      return "判断根拠の置き方";
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

function buildPatternSummaries(observations: ObservationEvent[]): string[] {
  const memoryCount = observations.filter((observation) => observation.reasoning_style === "memory_based").length;
  const conditionCount = observations.filter((observation) => observation.reasoning_style === "condition_based").length;
  const intuitionCount = observations.filter((observation) => observation.reasoning_style === "intuition").length;
  const uncertaintyCount = observations.filter((observation) => observation.reasoning_style === "uncertainty").length;
  const correctCount = observations.filter((observation) => observation.correct_or_wrong === "correct").length;
  const wrongCount = observations.filter((observation) => observation.correct_or_wrong === "wrong").length;

  const patterns: string[] = [];

  if (correctCount > 0) {
    patterns.push(`正しく判断できた肢が ${correctCount} 件ありました。`);
  }

  if (wrongCount > 0) {
    patterns.push(`見直し候補の肢が ${wrongCount} 件ありました。`);
  }

  if (memoryCount > 0) {
    patterns.push(`数字や記憶を根拠に置く場面が ${memoryCount} 回ありました。`);
  }

  if (conditionCount > 0) {
    patterns.push(`条件句や要件を見て判断する場面が ${conditionCount} 回ありました。`);
  }

  if (intuitionCount > 0) {
    patterns.push(`直感寄りの判断が ${intuitionCount} 回ありました。`);
  }

  if (uncertaintyCount > 0) {
    patterns.push(`迷いを残した判断が ${uncertaintyCount} 回ありました。`);
  }

  return patterns.slice(0, 4);
}

function buildCoachComment(
  repeatedObservation: ObservationEvent["misunderstanding_type"] | "unknown",
  observations: ObservationEvent[]
): string {
  const correctCount = observations.filter((observation) => observation.correct_or_wrong === "correct").length;
  const wrongCount = observations.filter((observation) => observation.correct_or_wrong === "wrong").length;

  if (correctCount > 0 && correctCount >= wrongCount) {
    if (repeatedObservation === "condition_based_judgment") {
      return "今日は条件句を拾って正しく判断できる場面が多く見えました。この流れは安定材料として扱えそうです。";
    }

    return "今日は正しく判断できている肢が先に見えました。理由が短い箇所だけ軽く補いながら、この再現性を保ちます。";
  }

  if (repeatedObservation === "memory_based_judgment") {
    return "今日は数字や記憶から先に入る傾向が見えました。明日は条件句まで口に出してから結論へ進む流れを見ます。";
  }

  if (repeatedObservation === "condition_based_judgment") {
    return "今日は条件句を拾って考える場面が多く見えました。この良い流れをそのまま安定させます。";
  }

  if (repeatedObservation === "intuition_based_judgment") {
    return "今日は直感で進む場面がありました。明日は一言でも根拠を置いてから答える流れを作ります。";
  }

  if (repeatedObservation === "uncertainty_signal") {
    return "今日は迷いを残しながら進む場面が目立ちました。明日は条件か数字のどちらを根拠にするかを先に決めます。";
  }

  return "今日は判断根拠の置き方に揺れが見えました。明日も同じ観点で短く追います。";
}

export function buildDailyReviewInput(params: {
  dailySessionId: string;
  observations: ObservationEvent[];
  memorySummary?: MemorySummary | null;
}): DailyReviewInput {
  const { dailySessionId, observations, memorySummary } = params;
  const repeatedObservation = getMostRepeatedObservation(observations, memorySummary);
  const repeatedLabel = getObservationLabel(repeatedObservation);
  const firstObservation = observations[0]?.note ?? "まだ十分な観察が集まっていません。";
  const latestObservation = observations.at(-1)?.note ?? "短い観察ログを残しました。";
  const patternSummaries = buildPatternSummaries(observations);
  const totalStatements = observations.length;

  return {
    daily_session_id: dailySessionId,
    summary: `今日は ${totalStatements} 件の肢別観察を通じて、「${firstObservation}」から始まり、最後は「${latestObservation}」という流れが見えました。最も多かったのは「${repeatedLabel}」です。`,
    key_observations: observations.map((observation) => {
      const statementLabel = observation.statement_index ? `肢${observation.statement_index}` : "全体";
      return `${statementLabel}: ${observation.note}`;
    }),
    repeated_patterns:
      patternSummaries.length > 0
        ? patternSummaries
        : ["判断根拠の置き方はまだ一定していないため、次回も同じ観点で観察します。"],
    coach_comment: buildCoachComment(repeatedObservation, observations)
  };
}
