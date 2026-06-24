import type {
  CoachDecision,
  DeliberationEvent,
  ObservationEventInput,
  ObservationMisunderstandingType
} from "@/lib/deliberation/types";

export function detectMisunderstandingTypeFromDeliberation(
  coachDecision: CoachDecision,
  deliberationEvents: DeliberationEvent[]
): ObservationMisunderstandingType {
  const text = deliberationEvents
    .filter((event) => event.speaker === "misconception" || event.type === "revision")
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

export function detectObservationConfidence(deliberationEvents: DeliberationEvent[]): number | null {
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
    (event) => event.speaker === "memory" && /前回|同じ|再発/.test(event.message)
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
    confidence: detectObservationConfidence(params.deliberationEvents),
    note: buildObservationNote(misunderstandingType, params.deliberationEvents)
  };
}
