import type { DailyReviewInput, ObservationEvent } from "@/lib/deliberation/types";
import type { MemorySummary } from "@/lib/deliberation/session-memory";

function getMisunderstandingLabel(value: ObservationEvent["misunderstanding_type"] | string | null): string {
  switch (value) {
    case "starting_point_confusion":
      return "起算点の取り方";
    case "condition_omission":
      return "条件句の読み取り";
    case "stable_progress":
      return "条件を見て進める姿勢";
    case "rushed_answer":
      return "確認前に答える傾向";
    case "unknown":
      return "判断根拠の置き方";
    default:
      return "判断根拠の置き方";
  }
}

function getMostRepeatedMisunderstanding(
  observations: ObservationEvent[],
  memorySummary?: MemorySummary | null
): ObservationEvent["misunderstanding_type"] | "unknown" {
  if (memorySummary?.repeatedMisunderstandingDetected && memorySummary.mostRepeatedMisunderstanding) {
    if (
      memorySummary.mostRepeatedMisunderstanding === "starting_point_confusion" ||
      memorySummary.mostRepeatedMisunderstanding === "condition_omission" ||
      memorySummary.mostRepeatedMisunderstanding === "stable_progress" ||
      memorySummary.mostRepeatedMisunderstanding === "rushed_answer"
    ) {
      return memorySummary.mostRepeatedMisunderstanding;
    }
  }

  const counts = observations.reduce<Map<ObservationEvent["misunderstanding_type"], number>>((map, observation) => {
    map.set(observation.misunderstanding_type, (map.get(observation.misunderstanding_type) ?? 0) + 1);
    return map;
  }, new Map());

  return (
    Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ??
    "unknown"
  );
}

function buildTomorrowFocus(misunderstandingType: ObservationEvent["misunderstanding_type"] | "unknown"): string {
  if (misunderstandingType === "starting_point_confusion") {
    return "明日は起算点を言い換えて確認し、いつから数えるのかを先に揃えて見ます。";
  }

  if (misunderstandingType === "condition_omission") {
    return "明日は条件句を先に拾い、結論の前に落としていない前提がないかを見ます。";
  }

  if (misunderstandingType === "stable_progress") {
    return "明日は条件を見てから答える流れを保ち、安定して再現できるかを見ます。";
  }

  if (misunderstandingType === "rushed_answer") {
    return "明日は答える前の確認を一拍置き、起算点や条件句を先に見る流れを整えます。";
  }

  return "明日は判断根拠を短く言い直してから、結論に進む流れを見ます。";
}

export function buildDailyReviewInput(params: {
  dailySessionId: string;
  observations: ObservationEvent[];
  memorySummary?: MemorySummary | null;
}): DailyReviewInput {
  const { dailySessionId, observations, memorySummary } = params;
  const repeatedMisunderstanding = getMostRepeatedMisunderstanding(observations, memorySummary);
  const repeatedLabel = getMisunderstandingLabel(repeatedMisunderstanding);
  const firstObservation = observations[0]?.note ?? "まだ十分な観察が集まっていません。";
  const latestObservation = observations.at(-1)?.note ?? "短い観察ログを残しました。";
  const repeatedPatternLine =
    repeatedMisunderstanding === "unknown"
      ? "同じ迷い方がある可能性は残るため、次回も判断根拠の置き方を見ます。"
      : `${repeatedLabel}に関する迷い方が今日の3問で繰り返し見えました。`;
  const tomorrowFocus = buildTomorrowFocus(repeatedMisunderstanding);

  return {
    daily_session_id: dailySessionId,
    summary: `今日は3問を通じて「${firstObservation}」から始まり、最後は「${latestObservation}」という傾向で観測がまとまりました。${repeatedPatternLine}`,
    key_observations: observations.map((observation, index) => `${index + 1}. ${observation.note}`),
    repeated_patterns: [repeatedPatternLine, tomorrowFocus],
    coach_comment:
      repeatedMisunderstanding === "starting_point_confusion"
        ? "今日は起算点を置く場所で迷いが残りました。まだ断定せず、明日も同じ入口から短く確認します。"
        : repeatedMisunderstanding === "condition_omission"
          ? "今日は条件句を拾う前に結論へ進みがちでした。明日も読み落としの有無を先に見ます。"
          : repeatedMisunderstanding === "stable_progress"
            ? "今日は条件を見てから答える流れが見えていました。明日も同じ姿勢が安定するかを見ます。"
            : repeatedMisunderstanding === "rushed_answer"
              ? "今日は確認前に答えへ進む傾向が見えました。明日は一拍置く流れを先に整えます。"
          : "今日は根拠の置き方に揺れが見えました。まだ判断せず、明日も同じ観点で短く追います。"
  };
}
