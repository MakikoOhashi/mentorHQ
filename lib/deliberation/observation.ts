import type {
  CoachDecision,
  DeliberationEvent,
  ObservationCorrectness,
  ObservationEventInput,
  ObservationMisunderstandingType,
  QuestionStatement,
  ReasoningStyle,
  StatementChoice
} from "@/lib/deliberation/types";

export function detectMisunderstandingTypeFromDeliberation(
  coachDecision: CoachDecision,
  deliberationEvents: DeliberationEvent[]
): ObservationMisunderstandingType {
  const text = deliberationEvents
    .filter(
      (event) =>
        event.speaker === "reading" ||
        event.speaker === "law" ||
        event.speaker === "pattern" ||
        event.type === "revision"
    )
    .map((event) => `${event.hypothesis ?? ""} ${event.message}`)
    .join(" ")
    .toLowerCase();

  const startingPointCueCount = [
    coachDecision.selected_intervention === "starting_point_check" || false,
    /起算点/g.test(text),
    /いつから/g.test(text),
    /知った時/g.test(text)
  ].filter(Boolean).length;
  const conditionCueCount = [/条件/g.test(text), /読み落とし/g.test(text), /見落とし/g.test(text)].filter(Boolean)
    .length;

  if (conditionCueCount >= 2) {
    return "condition_omission";
  }

  if (startingPointCueCount >= 1) {
    return "starting_point_confusion";
  }

  if (conditionCueCount >= 1) {
    return "condition_omission";
  }

  return "unknown";
}

export function detectObservationSignalScore(deliberationEvents: DeliberationEvent[]): number | null {
  const latestConfidenceEvent = [...deliberationEvents]
    .reverse()
    .find((event) => typeof event.confidence_after === "number");

  return typeof latestConfidenceEvent?.confidence_after === "number" ? latestConfidenceEvent.confidence_after : null;
}

export function buildObservationNote(
  misunderstandingType: ObservationMisunderstandingType,
  deliberationEvents: DeliberationEvent[]
): string {
  const memoryRepeated = deliberationEvents.some(
    (event) => (event.speaker === "memory" || event.speaker === "pattern") && /前回|同じ|再発/.test(event.message)
  );

  if (memoryRepeated) {
    return "前回と同じ誤解パターンが出ています";
  }

  if (misunderstandingType === "starting_point_confusion") {
    return "起算点の確認が必要そうです";
  }

  if (misunderstandingType === "condition_omission") {
    return "条件句を読み飛ばしている可能性があります";
  }

  return deliberationEvents.find((event) => event.type === "observation")?.message ?? "短い観察ログを残しました";
}

export function buildObservationInput(params: {
  dailySessionId: string;
  questionId: string;
  questionIndex: number;
  coachDecision: CoachDecision;
  deliberationEvents: DeliberationEvent[];
}): ObservationEventInput {
  const misunderstandingType = detectMisunderstandingTypeFromDeliberation(
    params.coachDecision,
    params.deliberationEvents
  );

  return {
    daily_session_id: params.dailySessionId,
    question_id: params.questionId,
    question_index: params.questionIndex,
    intervention_type: params.coachDecision.selected_intervention,
    misunderstanding_type: misunderstandingType,
    answer_signal_score: detectObservationSignalScore(params.deliberationEvents),
    note: buildObservationNote(misunderstandingType, params.deliberationEvents)
  };
}

export function detectReasoningStyle(reason: string): ReasoningStyle {
  const normalized = reason.trim().toLowerCase();

  if (!normalized) {
    return "uncertainty";
  }

  if (/なんとなく|直感|気がした|たぶん|自信がない|迷|わからない/.test(normalized)) {
    return "uncertainty";
  }

  if (/条件|ただし|場合|とき|なら|要件|例外|知った時|範囲内/.test(normalized)) {
    return "condition_based";
  }

  if (/覚えて|記憶|数字|条文|3か月|3ヶ月|4分の3|過半数|代表権/.test(normalized)) {
    return "memory_based";
  }

  if (normalized.length <= 12) {
    return "intuition";
  }

  return "condition_based";
}

function getReasoningMisunderstandingType(reasoningStyle: ReasoningStyle): ObservationMisunderstandingType {
  switch (reasoningStyle) {
    case "memory_based":
      return "memory_based_judgment";
    case "condition_based":
      return "condition_based_judgment";
    case "intuition":
      return "intuition_based_judgment";
    case "uncertainty":
      return "uncertainty_signal";
    default:
      return "unknown";
  }
}

function getReasoningIntervention(reasoningStyle: ReasoningStyle) {
  switch (reasoningStyle) {
    case "memory_based":
      return "starting_point_check" as const;
    case "condition_based":
      return "condition_check" as const;
    case "intuition":
      return "light_monitoring" as const;
    case "uncertainty":
      return "slow_down_prompt" as const;
    default:
      return "light_monitoring" as const;
  }
}

function detectStatementCorrectness(statement: QuestionStatement, learnerChoice: StatementChoice): ObservationCorrectness {
  const learnerMarkedCorrect = learnerChoice === "correct";
  return learnerMarkedCorrect === statement.isCorrect ? "correct" : "wrong";
}

function buildStatementObservationNote(
  statementIndex: number,
  reasoningStyle: ReasoningStyle,
  reason: string,
  correctness: ObservationCorrectness
): string {
  const isCorrect = correctness === "correct";
  const correctnessPrefix = isCorrect ? "判断は合っています。" : "判断は外れています。";
  const normalizedReason = reason.trim();

  if (!normalizedReason) {
    return isCorrect
      ? `${correctnessPrefix} 肢${statementIndex}は正しく判断できています。`
      : `${correctnessPrefix} 肢${statementIndex}は追加質問の余地がありそうです。`;
  }

  if (reasoningStyle === "memory_based") {
    return isCorrect
      ? `${correctnessPrefix} 肢${statementIndex}は知識を使って正しく判断できています。`
      : `${correctnessPrefix} 肢${statementIndex}は暗記ベースで判断しています。`;
  }

  if (reasoningStyle === "condition_based") {
    return isCorrect
      ? `${correctnessPrefix} 肢${statementIndex}は条件句や要件を根拠に見られています。`
      : `${correctnessPrefix} 肢${statementIndex}は条件句や要件を根拠に見ています。`;
  }

  if (reasoningStyle === "intuition") {
    return isCorrect
      ? `${correctnessPrefix} 肢${statementIndex}は短い判断でも外していません。`
      : `${correctnessPrefix} 肢${statementIndex}は直感寄りに判断しています。`;
  }

  if (reason.trim().length <= 14) {
    return isCorrect
      ? `${correctnessPrefix} 理由はまだ短いですが、判断自体はできています。`
      : `${correctnessPrefix} 理由説明が短く、確認が足りていません。`;
  }

  return isCorrect
    ? `${correctnessPrefix} 肢${statementIndex}は理由を添えて判断できています。`
    : `${correctnessPrefix} 肢${statementIndex}は迷いを残しながら判断しています。`;
}

function detectStatementSignalScore(reasoningStyle: ReasoningStyle, reason: string): number {
  const base =
    reasoningStyle === "condition_based"
      ? 0.76
      : reasoningStyle === "memory_based"
        ? 0.66
        : reasoningStyle === "intuition"
          ? 0.49
          : 0.38;

  if (reason.trim().length >= 24 && reasoningStyle !== "uncertainty") {
    return Math.min(base + 0.08, 0.92);
  }

  return base;
}

export function buildStatementObservationInput(params: {
  dailySessionId: string;
  questionId: string;
  questionIndex: number;
  statementIndex: number;
  statement: QuestionStatement;
  learnerChoice: StatementChoice;
  learnerReason?: string;
  learnerNote?: string | null;
  reasoningStyle?: ReasoningStyle;
}): ObservationEventInput {
  const learnerReason = params.learnerReason?.trim() ?? "";
  const correctness = detectStatementCorrectness(params.statement, params.learnerChoice);
  const reasoningStyle =
    params.reasoningStyle ??
    (learnerReason
      ? detectReasoningStyle(learnerReason)
      : correctness === "correct"
        ? "intuition"
        : "uncertainty");
  const misunderstandingType = getReasoningMisunderstandingType(reasoningStyle);
  const observationNote = buildStatementObservationNote(
    params.statementIndex,
    reasoningStyle,
    learnerReason,
    correctness
  );

  return {
    daily_session_id: params.dailySessionId,
    question_id: params.questionId,
    question_index: params.questionIndex,
    statement_index: params.statementIndex,
    learner_choice: params.learnerChoice,
    correct_or_wrong: correctness,
    learner_reason: learnerReason,
    reasoning_style: reasoningStyle,
    intervention_type: getReasoningIntervention(reasoningStyle),
    misunderstanding_type: misunderstandingType,
    answer_signal_score: detectStatementSignalScore(reasoningStyle, learnerReason),
    observation_note: observationNote,
    note: params.learnerNote?.trim() ? params.learnerNote.trim() : observationNote
  };
}
