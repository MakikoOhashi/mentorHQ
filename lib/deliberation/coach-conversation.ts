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
  return `「${compact.slice(0, 24)}${compact.length > 24 ? "..." : ""}」`;
}

function hasMemoryCue(reason: string): boolean {
  return /覚えて|知って|条文|数字|3か月|3ヶ月|4分の3|過半数/.test(reason);
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
  if (observation.misunderstanding_type === "condition_omission") {
    return { speaker: "reading", dialogueMove: "observe", text: "条件句には触れていますが、少し迷いがあるようです。" };
  }

  if (observation.misunderstanding_type === "starting_point_confusion") {
    return { speaker: "reading", dialogueMove: "observe", text: "数字には触れていますが、起点はまだ曖昧かもしれません。" };
  }

  if (observation.reasoning_style === "condition_based") {
    return {
      speaker: "reading",
      dialogueMove: "observe",
      text: observation.correct_or_wrong === "correct" ? "今回は条件句まで読めていますね。" : "条件句を根拠にしようとはしていますね。"
    };
  }

  if (observation.reasoning_style === "memory_based") {
    return { speaker: "reading", dialogueMove: "observe", text: "今回は数字を根拠にしているようです。" };
  }

  if (observation.reasoning_style === "uncertainty") {
    return { speaker: "reading", dialogueMove: "observe", text: "今回は選択肢で迷いが見えますね。" };
  }

  return { speaker: "reading", dialogueMove: "observe", text: "今回は判断がやや先に立ったようです。" };
}

function buildMemoryTurn(observation: ObservationEvent): TurnDraft {
  const reason = (observation.learner_reason ?? "").trim();
  const reasonQuote = quoteReason(reason);

  if (!reason) {
    return { speaker: "memory", dialogueMove: "defer", text: "今回は理由の入力がありません。" };
  }

  if (hasMemoryCue(reason)) {
    return {
      speaker: "memory",
      dialogueMove: "observe",
      text: reasonQuote ? `今回は${reasonQuote}を理由にしています。` : "今回は記憶ベースの理由に見えます。"
    };
  }

  if (reason.length >= 22) {
    return { speaker: "memory", dialogueMove: "extend", text: "今回は理由が前より具体的です。" };
  }

  return {
    speaker: "memory",
    dialogueMove: "observe",
    text: reasonQuote ? `理由は${reasonQuote}です。` : "今回は短い理由で答えています。"
  };
}

function buildPatternTurn(
  observation: ObservationEvent,
  previousInQuestion: ObservationEvent | null,
  relatedObservation: ObservationEvent | null
): TurnDraft {
  if (previousInQuestion?.learner_reason && observation.learner_reason) {
    const previousLength = previousInQuestion.learner_reason.trim().length;
    const currentLength = observation.learner_reason.trim().length;

    if (currentLength > previousLength) {
      return { speaker: "pattern", dialogueMove: "update_hypothesis", text: "前の肢より理由が具体的です。" };
    }

    if (currentLength < previousLength) {
      return { speaker: "pattern", dialogueMove: "recall", text: "前の肢より理由は短くなっています。" };
    }
  }

  if (
    previousInQuestion &&
    previousInQuestion.reasoning_style &&
    previousInQuestion.reasoning_style === observation.reasoning_style
  ) {
    if (observation.reasoning_style === "memory_based") {
      return { speaker: "pattern", dialogueMove: "recall", text: "前の肢でも数字を根拠にしていました。" };
    }

    if (observation.reasoning_style === "condition_based") {
      return { speaker: "pattern", dialogueMove: "recall", text: "前の肢でも条件を根拠にしていました。" };
    }
  }

  if (
    relatedObservation &&
    relatedObservation.misunderstanding_type === observation.misunderstanding_type &&
    observation.misunderstanding_type !== "unknown"
  ) {
    return { speaker: "pattern", dialogueMove: "recall", text: "今回も同じ観察が続いています。" };
  }

  return { speaker: "pattern", dialogueMove: "defer", text: "もう少しObservationを見ていきたいですね。" };
}

function buildLawTurn(
  observation: ObservationEvent,
  previousInQuestion: ObservationEvent | null,
  relatedObservation: ObservationEvent | null
): TurnDraft {
  if (observation.misunderstanding_type === "starting_point_confusion") {
    return { speaker: "law", dialogueMove: "extend", text: "起算点の見方は今日のReviewで確認したいですね。" };
  }

  if (observation.misunderstanding_type === "condition_omission") {
    return { speaker: "law", dialogueMove: "extend", text: "条件の拾い方はTomorrow Planに残してもよさそうです。" };
  }

  if (
    observation.reasoning_style === "condition_based" &&
    observation.correct_or_wrong === "correct" &&
    (previousInQuestion?.correct_or_wrong === "correct" || relatedObservation?.correct_or_wrong === "correct")
  ) {
    return { speaker: "law", dialogueMove: "agree", text: "この理解はReviewで定着を見てもよさそうです。" };
  }

  if (observation.reasoning_style === "memory_based") {
    return { speaker: "law", dialogueMove: "extend", text: "数字に寄った判断としてObservationを続けたいですね。" };
  }

  return { speaker: "law", dialogueMove: "defer", text: "この観察はReview候補として残せそうです。" };
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
    buildPatternTurn(observation, previousInQuestion, relatedObservation),
    buildLawTurn(observation, previousInQuestion, relatedObservation)
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
