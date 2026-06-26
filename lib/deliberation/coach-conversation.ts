import type { DialogueMove, ObservationEvent } from "@/lib/deliberation/types";

export type CoachConversationSpeaker = "reading" | "law" | "memory" | "pattern" | "review";

export type CoachConversationTurn = {
  id: string;
  speaker: CoachConversationSpeaker;
  speakerLabel: string;
  dialogueMove: DialogueMove;
  text: string;
  created_at: string | null;
  source_observation_id: string;
};

const SPEAKER_LABELS: Record<CoachConversationSpeaker, string> = {
  reading: "Reading",
  law: "Law",
  memory: "Memory",
  pattern: "Pattern",
  review: "Review"
};

type TurnDraft = {
  speaker: CoachConversationSpeaker;
  dialogueMove: DialogueMove;
  text: string;
};

function quoteReason(reason: string | null): string | null {
  const trimmed = reason?.trim();
  if (!trimmed) {
    return null;
  }

  const compact = trimmed.replace(/\s+/g, " ");
  return `「${compact.slice(0, 18)}${compact.length > 18 ? "..." : ""}」`;
}

function findPreviousQuestionObservation(
  observations: ObservationEvent[],
  currentIndex: number
): ObservationEvent | null {
  const current = observations[currentIndex];

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    if (observations[index].question_id === current.question_id) {
      return observations[index];
    }
  }

  return null;
}

function findRecentRelatedObservation(
  observations: ObservationEvent[],
  currentIndex: number
): ObservationEvent | null {
  const current = observations[currentIndex];

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = observations[index];
    if (
      candidate.misunderstanding_type === current.misunderstanding_type ||
      candidate.reasoning_style === current.reasoning_style
    ) {
      return candidate;
    }
  }

  return null;
}

function buildReadingTurn(observation: ObservationEvent): TurnDraft {
  if (observation.misunderstanding_type === "starting_point_confusion") {
    return { speaker: "reading", dialogueMove: "observe", text: "起算点あり" };
  }

  if (observation.misunderstanding_type === "condition_omission") {
    return { speaker: "reading", dialogueMove: "observe", text: "条件句あり" };
  }

  if (observation.reasoning_style === "condition_based") {
    return {
      speaker: "reading",
      dialogueMove: "observe",
      text: observation.correct_or_wrong === "correct" ? "条件句OK" : "数字より条件"
    };
  }

  if (observation.reasoning_style === "memory_based") {
    return { speaker: "reading", dialogueMove: "observe", text: "数字優先" };
  }

  if (observation.reasoning_style === "uncertainty") {
    return { speaker: "reading", dialogueMove: "observe", text: "語尾確認?" };
  }

  return { speaker: "reading", dialogueMove: "observe", text: "印象先行" };
}

function buildMemoryTurn(observation: ObservationEvent): TurnDraft {
  const reasonQuote = quoteReason(observation.learner_reason);
  const reason = (observation.learner_reason ?? "").trim();

  if (!reason) {
    return { speaker: "memory", dialogueMove: "defer", text: "理由なし" };
  }

  if (reason.length >= 22) {
    return { speaker: "memory", dialogueMove: "extend", text: "説明あり" };
  }

  if (/覚えて|知って|条文|数字|3か月|3ヶ月/.test(reason)) {
    return {
      speaker: "memory",
      dialogueMove: "observe",
      text: reasonQuote ? `理由: ${reasonQuote}` : "暗記語彙"
    };
  }

  return {
    speaker: "memory",
    dialogueMove: "observe",
    text: reasonQuote ? `理由: ${reasonQuote}` : "説明あり"
  };
}

function buildLawTurn(observation: ObservationEvent): TurnDraft {
  if (observation.misunderstanding_type === "starting_point_confusion") {
    return { speaker: "law", dialogueMove: "challenge", text: "開始時点?" };
  }

  if (observation.misunderstanding_type === "condition_omission") {
    return { speaker: "law", dialogueMove: "challenge", text: "条件位置?" };
  }

  if (observation.reasoning_style === "condition_based" && observation.correct_or_wrong === "correct") {
    return { speaker: "law", dialogueMove: "agree", text: "要件線OK" };
  }

  if (observation.reasoning_style === "condition_based") {
    return { speaker: "law", dialogueMove: "challenge", text: "効果接続?" };
  }

  if (observation.reasoning_style === "memory_based") {
    return { speaker: "law", dialogueMove: "extend", text: "手続先メモ" };
  }

  return { speaker: "law", dialogueMove: "defer", text: "論点保留" };
}

function buildPatternTurn(
  observation: ObservationEvent,
  relatedObservation: ObservationEvent | null
): TurnDraft {
  if (!relatedObservation) {
    return { speaker: "pattern", dialogueMove: "recall", text: "初出" };
  }

  if (relatedObservation.misunderstanding_type === observation.misunderstanding_type) {
    if (observation.misunderstanding_type === "starting_point_confusion") {
      return { speaker: "pattern", dialogueMove: "recall", text: "前問類似" };
    }

    if (observation.misunderstanding_type === "condition_omission") {
      return { speaker: "pattern", dialogueMove: "recall", text: "条件句?" };
    }
  }

  if (relatedObservation.reasoning_style === observation.reasoning_style) {
    return { speaker: "pattern", dialogueMove: "recall", text: "同型" };
  }

  return { speaker: "pattern", dialogueMove: "update_hypothesis", text: "今回は前問と違う" };
}

function buildReviewTurn(
  previousInQuestion: ObservationEvent | null,
  relatedObservation: ObservationEvent | null
): TurnDraft {
  if (relatedObservation && previousInQuestion) {
    return { speaker: "review", dialogueMove: "update_hypothesis", text: "比較待ち" };
  }

  if (relatedObservation) {
    return { speaker: "review", dialogueMove: "extend", text: "候補追加" };
  }

  return { speaker: "review", dialogueMove: "defer", text: "保留" };
}

function buildTurnsForObservation(
  observations: ObservationEvent[],
  currentIndex: number
): CoachConversationTurn[] {
  const observation = observations[currentIndex];
  const previousInQuestion = findPreviousQuestionObservation(observations, currentIndex);
  const relatedObservation = findRecentRelatedObservation(observations, currentIndex);
  const turns: TurnDraft[] = [
    buildReadingTurn(observation),
    buildMemoryTurn(observation),
    buildPatternTurn(observation, relatedObservation),
    buildLawTurn(observation),
    buildReviewTurn(previousInQuestion, relatedObservation)
  ];

  return turns.map((turn, index) => ({
    id: `${observation.id}-${turn.speaker}-${turn.dialogueMove}-${index}`,
    speaker: turn.speaker,
    speakerLabel: SPEAKER_LABELS[turn.speaker],
    dialogueMove: turn.dialogueMove,
    text: turn.text,
    created_at: observation.created_at,
    source_observation_id: observation.id
  }));
}

export function buildCoachConversation(observations: ObservationEvent[]): CoachConversationTurn[] {
  return observations.flatMap((_, index) => buildTurnsForObservation(observations, index));
}
