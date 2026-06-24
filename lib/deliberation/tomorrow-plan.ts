import type {
  DailyReview,
  ObservationEvent,
  TomorrowPlanInput
} from "@/lib/deliberation/types";
import type { MemorySummary } from "@/lib/deliberation/session-memory";

function getRepeatedMisunderstanding(
  observations: ObservationEvent[],
  memorySummary?: MemorySummary | null
): ObservationEvent["misunderstanding_type"] | "unknown" {
  if (memorySummary?.repeatedMisunderstandingDetected && memorySummary.mostRepeatedMisunderstanding) {
    if (
      memorySummary.mostRepeatedMisunderstanding === "starting_point_confusion" ||
      memorySummary.mostRepeatedMisunderstanding === "condition_omission"
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

function buildFocusTheme(misunderstanding: ObservationEvent["misunderstanding_type"] | "unknown"): string {
  if (misunderstanding === "starting_point_confusion") {
    return "起算点を先に言語化してから判断する";
  }

  if (misunderstanding === "condition_omission") {
    return "条件句を拾ってから結論へ進む";
  }

  return "判断根拠を短く置いてから答える";
}

function buildPracticeItems(misunderstanding: ObservationEvent["misunderstanding_type"] | "unknown"): string[] {
  if (misunderstanding === "starting_point_confusion") {
    return [
      "起算点を確認する問題を2問",
      "解答前に「いつから数えるか」を声に出して言語化する",
      "正誤判断の前に条文の起点語を1つ拾う"
    ];
  }

  if (misunderstanding === "condition_omission") {
    return [
      "条件句を読み取る問題を2問",
      "解答前に『例外・要件・但し書き』があるかを確認する",
      "結論を書く前に落としている前提がないかを1回見直す"
    ];
  }

  return [
    "判断根拠を短く言い直す問題を2問",
    "解答前に『何を基準に考えるか』を一文で置く",
    "結論の前に根拠を1つ確認する"
  ];
}

function buildCautionPoints(misunderstanding: ObservationEvent["misunderstanding_type"] | "unknown"): string[] {
  if (misunderstanding === "starting_point_confusion") {
    return [
      "数字だけで正誤を決めない",
      "起点語が書き換わっていないか先に確認する"
    ];
  }

  if (misunderstanding === "condition_omission") {
    return [
      "条件句を飛ばしたまま結論に進まない",
      "例外や限定表現を読み落としていないか確認する"
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
  if (misunderstanding === "starting_point_confusion") {
    return `明日は「${focusTheme}」を軸に、最初の一手だけ丁寧に揃えます。`;
  }

  if (misunderstanding === "condition_omission") {
    return `明日は「${focusTheme}」を軸に、結論より先に条件を拾う流れを固めます。`;
  }

  return `明日は「${focusTheme}」を軸に、判断根拠を置いてから答える流れを整えます。`;
}

export function buildTomorrowPlanInput(params: {
  dailySessionId: string;
  dailyReview: DailyReview;
  observations: ObservationEvent[];
  memorySummary?: MemorySummary | null;
}): TomorrowPlanInput {
  const misunderstanding = getRepeatedMisunderstanding(params.observations, params.memorySummary);
  const focusTheme = buildFocusTheme(misunderstanding);

  return {
    daily_session_id: params.dailySessionId,
    daily_review_id: params.dailyReview.id,
    focus_theme: focusTheme,
    practice_items: buildPracticeItems(misunderstanding),
    caution_points: buildCautionPoints(misunderstanding),
    coach_message: buildCoachMessage(misunderstanding, focusTheme)
  };
}
