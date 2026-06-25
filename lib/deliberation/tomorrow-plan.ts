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

function buildFocusTheme(misunderstanding: ObservationEvent["misunderstanding_type"] | "unknown"): string {
  if (misunderstanding === "starting_point_confusion") {
    return "起算点を先に言語化してから判断する";
  }

  if (misunderstanding === "condition_omission") {
    return "条件句を拾ってから結論へ進む";
  }

  if (misunderstanding === "stable_progress") {
    return "条件を見てから判断する流れを安定させる";
  }

  if (misunderstanding === "rushed_answer") {
    return "答える前に確認を一拍置く";
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

  if (misunderstanding === "stable_progress") {
    return [
      "条件を使って判断する問題を2問",
      "答える前に『何が起点になるか』を一言で確認する",
      "落ち着いて答える流れを同じ手順で再現する"
    ];
  }

  if (misunderstanding === "rushed_answer") {
    return [
      "答える前に確認を入れる問題を2問",
      "起算点・条件句・単位のどれを見るかを先に決める",
      "そのまま答えたくなったら一度だけ見直す"
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

  if (misunderstanding === "stable_progress") {
    return [
      "慣れてきても確認の順番を省略しない",
      "条件を見た後に結論へ進む流れを崩さない"
    ];
  }

  if (misunderstanding === "rushed_answer") {
    return [
      "急いで結論に飛ばない",
      "確認項目を決めずにそのまま答えない"
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

  if (misunderstanding === "stable_progress") {
    return `明日は「${focusTheme}」を軸に、今できている確認の順番をそのまま安定させます。`;
  }

  if (misunderstanding === "rushed_answer") {
    return `明日は「${focusTheme}」を軸に、答える前の一拍を先に作ります。`;
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
