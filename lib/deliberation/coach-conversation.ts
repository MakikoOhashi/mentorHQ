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
  return /覚えて|知って|前に|昨日|条文|数字|3か月|3ヶ月|4分の3|過半数/.test(reason);
}

function hasConditionCue(reason: string): boolean {
  return /条件|ただし|場合|とき|要件|例外|知った時|範囲/.test(reason);
}

function isReasonDetailed(reason: string): boolean {
  return reason.trim().length >= 22;
}

function isReasonShort(reason: string): boolean {
  const length = reason.trim().length;
  return length > 0 && length < 14;
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

function isImproving(
  observation: ObservationEvent,
  previousObservation: ObservationEvent | null
): boolean {
  if (!previousObservation) {
    return false;
  }

  const confidenceImproved =
    typeof observation.confidence === "number" &&
    typeof previousObservation.confidence === "number" &&
    observation.confidence > previousObservation.confidence;
  const becameCorrect =
    previousObservation.correct_or_wrong !== "correct" && observation.correct_or_wrong === "correct";
  const movedTowardExplanation =
    (previousObservation.reasoning_style === "memory_based" || previousObservation.reasoning_style === "uncertainty") &&
    observation.reasoning_style === "condition_based";
  const reasonGotLonger =
    (observation.learner_reason?.trim().length ?? 0) > (previousObservation.learner_reason?.trim().length ?? 0);

  return confidenceImproved || becameCorrect || movedTowardExplanation || reasonGotLonger;
}

function buildReadingTurn(
  observation: ObservationEvent,
  previousInQuestion: ObservationEvent | null
): TurnDraft {
  if (observation.correct_or_wrong === "correct" && observation.reasoning_style === "condition_based") {
    return { speaker: "reading", dialogueMove: "observe", text: "今回は条件句まで読めていますね。" };
  }

  if (observation.misunderstanding_type === "condition_omission") {
    return {
      speaker: "reading",
      dialogueMove: "observe",
      text: previousInQuestion ? "さっきより読めていますが、条件で少し迷いましたね。" : "条件のところで少し止まりましたね。"
    };
  }

  if (observation.misunderstanding_type === "starting_point_confusion") {
    return { speaker: "reading", dialogueMove: "observe", text: "数字は見ていますが、起点はまだ曖昧ですね。" };
  }

  if (observation.reasoning_style === "memory_based") {
    return { speaker: "reading", dialogueMove: "observe", text: "数字が先に目に入っていたようですね。" };
  }

  if (observation.reasoning_style === "uncertainty") {
    return { speaker: "reading", dialogueMove: "observe", text: "選択肢で少し迷っていましたね。" };
  }

  if (observation.correct_or_wrong === "correct") {
    return { speaker: "reading", dialogueMove: "observe", text: "今回は迷いが少なかったですね。" };
  }

  return { speaker: "reading", dialogueMove: "observe", text: "印象で先に決めたかもしれませんね。" };
}

function buildMemoryTurn(observation: ObservationEvent): TurnDraft {
  const reasonQuote = quoteReason(observation.learner_reason);
  const reason = (observation.learner_reason ?? "").trim();

  if (!reason) {
    return {
      speaker: "memory",
      dialogueMove: "defer",
      text: "理由をまだ言葉にしていないので、考え方をもう少し聞きたいです。"
    };
  }

  if (hasMemoryCue(reason)) {
    return {
      speaker: "memory",
      dialogueMove: "observe",
      text: reasonQuote
        ? `${reasonQuote}と言っていますね。前の問題を思い出した可能性があります。`
        : "前の記憶を使って判断した可能性があります。"
    };
  }

  if (isReasonDetailed(reason) || hasConditionCue(reason)) {
    return {
      speaker: "memory",
      dialogueMove: "extend",
      text: "理由が少し具体的です。自分の言葉で考えられていますね。"
    };
  }

  if (isReasonShort(reason)) {
    return {
      speaker: "memory",
      dialogueMove: "observe",
      text: "理由は短めですが、答え方の癖は見えていますね。"
    };
  }

  return {
    speaker: "memory",
    dialogueMove: "observe",
    text: reasonQuote ? `${reasonQuote}と話していますね。` : "理由は出ていますね。"
  };
}

function buildPatternTurn(
  observation: ObservationEvent,
  previousInQuestion: ObservationEvent | null,
  relatedObservation: ObservationEvent | null
): TurnDraft {
  if (!relatedObservation) {
    return { speaker: "pattern", dialogueMove: "recall", text: "今日はこの迷い方が初めてですね。" };
  }

  if (
    relatedObservation.misunderstanding_type === observation.misunderstanding_type &&
    observation.misunderstanding_type !== "unknown"
  ) {
    return { speaker: "pattern", dialogueMove: "recall", text: "前の肢でも同じ迷い方でした。" };
  }

  if (isImproving(observation, previousInQuestion ?? relatedObservation)) {
    return { speaker: "pattern", dialogueMove: "update_hypothesis", text: "前回より理由が少し具体的です。" };
  }

  if (relatedObservation.reasoning_style === observation.reasoning_style) {
    return { speaker: "pattern", dialogueMove: "recall", text: "ここ2問は考え方の型が似ていますね。" };
  }

  if (previousInQuestion && previousInQuestion.correct_or_wrong !== observation.correct_or_wrong) {
    return { speaker: "pattern", dialogueMove: "update_hypothesis", text: "前の肢とは違う見方ができていますね。" };
  }

  return { speaker: "pattern", dialogueMove: "update_hypothesis", text: "少しずつ見方が変わってきていますね。" };
}

function buildLawTurn(
  observation: ObservationEvent,
  previousInQuestion: ObservationEvent | null,
  relatedObservation: ObservationEvent | null
): TurnDraft {
  const repeatedSameConfusion =
    relatedObservation?.misunderstanding_type === observation.misunderstanding_type &&
    observation.misunderstanding_type !== "unknown";
  const repeatedReasoningStyle = relatedObservation?.reasoning_style === observation.reasoning_style;
  const noReason = !(observation.learner_reason ?? "").trim();

  if (repeatedSameConfusion && observation.misunderstanding_type === "starting_point_confusion") {
    return {
      speaker: "law",
      dialogueMove: "extend",
      text: "なら次は、いつから数えるのかを言わせたいです。"
    };
  }

  if (repeatedSameConfusion && observation.misunderstanding_type === "condition_omission") {
    return {
      speaker: "law",
      dialogueMove: "extend",
      text: "なら次は例外より先に、条件を言い直してもらいたいです。"
    };
  }

  if (
    observation.correct_or_wrong === "correct" &&
    observation.reasoning_style === "condition_based" &&
    (repeatedReasoningStyle || previousInQuestion?.correct_or_wrong === "correct")
  ) {
    return {
      speaker: "law",
      dialogueMove: "agree",
      text: "それなら次は例外問題を混ぜてもよさそうです。"
    };
  }

  if (noReason || observation.reasoning_style === "uncertainty") {
    return {
      speaker: "law",
      dialogueMove: "defer",
      text: "今日はここで一度ゆっくり説明させてもよさそうです。"
    };
  }

  if (observation.reasoning_style === "memory_based") {
    return {
      speaker: "law",
      dialogueMove: "extend",
      text: "次は数字だけでなく、根拠の言葉も出してもらいたいです。"
    };
  }

  return {
    speaker: "law",
    dialogueMove: "extend",
    text: "もう一度だけ理由を言わせると、理解の深さが見えそうです。"
  };
}

function buildTurnSequence(
  observation: ObservationEvent,
  previousInQuestion: ObservationEvent | null,
  relatedObservation: ObservationEvent | null
): TurnDraft[] {
  const readingTurn = buildReadingTurn(observation, previousInQuestion);
  const memoryTurn = buildMemoryTurn(observation);
  const patternTurn = buildPatternTurn(observation, previousInQuestion, relatedObservation);
  const lawTurn = buildLawTurn(observation, previousInQuestion, relatedObservation);

  if (relatedObservation) {
    return [readingTurn, patternTurn, memoryTurn, lawTurn];
  }

  if (!(observation.learner_reason ?? "").trim()) {
    return [readingTurn, memoryTurn, lawTurn, patternTurn];
  }

  return [readingTurn, memoryTurn, patternTurn, lawTurn];
}

function buildTurnsForObservation(
  observations: ObservationEvent[],
  currentIndex: number
): CoachConversationTurn[] {
  const observation = observations[currentIndex];
  const previousInQuestion = findPreviousQuestionObservation(observations, currentIndex);
  const relatedObservation = findRecentRelatedObservation(observations, currentIndex);
  const turns = buildTurnSequence(observation, previousInQuestion, relatedObservation);

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
