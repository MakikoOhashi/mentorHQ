import type { DailyReview, ObservationEvent, TomorrowPlanInput } from "@/lib/deliberation/types";
import type { MemorySummary } from "@/lib/deliberation/session-memory";

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
      "数字が出る肢を2問見て、条件句まで声に出して確認する",
      "『どの言葉が起点か』を一文で言ってから答える",
      "暗記した数字だけで切らず、主語と条件も一緒に見る"
    ];
  }

  if (misunderstanding === "condition_based_judgment") {
    return [
      "条件句を拾う問題を2問続ける",
      "各肢で『どの条件を使ったか』を一言で残す",
      "今できている確認の順番を崩さず再現する"
    ];
  }

  if (misunderstanding === "intuition_based_judgment") {
    return [
      "直感で選びたくなる肢を2問見て、根拠を一言添える",
      "答える前に条文語か条件語を1つ拾う",
      "『なんとなく』で終わらせず、短くても理由を書く"
    ];
  }

  if (misunderstanding === "uncertainty_signal") {
    return [
      "迷いやすい肢を2問見て、数字か条件のどちらを軸にするか先に決める",
      "理由を1文だけ具体化してから答える",
      "選ぶ前に見直しポイントを1つ決める"
    ];
  }

  return [
    "判断根拠を短く言い直す問題を2問",
    "解答前に『何を基準に考えるか』を一文で置く",
    "結論の前に根拠を1つ確認する"
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

export function buildTomorrowPlanInput(params: {
  dailySessionId: string;
  dailyReview: DailyReview;
  observations: ObservationEvent[];
  memorySummary?: MemorySummary | null;
}): TomorrowPlanInput {
  const misunderstanding = getRepeatedObservation(params.observations, params.memorySummary);
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
