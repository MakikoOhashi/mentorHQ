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

function normalizeReason(reason: string | null): string {
  return reason?.trim().replace(/\s+/g, " ") ?? "";
}

function findPreviousObservation(
  observations: ObservationEvent[],
  currentIndex: number
): ObservationEvent | null {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    return observations[index];
  }

  return null;
}

function countPriorMatches(
  observations: ObservationEvent[],
  currentIndex: number,
  predicate: (observation: ObservationEvent) => boolean
): number {
  let count = 0;

  for (let index = 0; index < currentIndex; index += 1) {
    if (predicate(observations[index])) {
      count += 1;
    }
  }

  return count;
}

function buildReadingTurn(observation: ObservationEvent): TurnDraft {
  const reason = normalizeReason(observation.learner_reason);

  if (observation.reasoning_style === "condition_based") {
    return {
      speaker: "reading",
      dialogueMove: "observe",
      text: observation.correct_or_wrong === "correct" ? "今回は条件句まで読めています。" : "今回は条件を手掛かりにしています。"
    };
  }

  if (observation.reasoning_style === "memory_based") {
    return { speaker: "reading", dialogueMove: "observe", text: "今回は数字を手掛かりにしています。" };
  }

  if (observation.reasoning_style === "uncertainty") {
    return { speaker: "reading", dialogueMove: "observe", text: "今回は選択肢を比べながら迷っています。" };
  }

  if (reason.length > 0 && reason.length <= 14) {
    return { speaker: "reading", dialogueMove: "observe", text: "今回は理由は短めです。" };
  }

  if (observation.correct_or_wrong === "wrong") {
    return { speaker: "reading", dialogueMove: "observe", text: "今回は答えを先に決めたようです。" };
  }

  return { speaker: "reading", dialogueMove: "observe", text: "今回は答え方がやや速いですね。" };
}

function buildMemoryTurn(
  observation: ObservationEvent,
  previousObservation: ObservationEvent | null
): TurnDraft {
  if (!previousObservation) {
    return { speaker: "memory", dialogueMove: "defer", text: "比較材料はまだ少ないですね。" };
  }

  const currentReason = normalizeReason(observation.learner_reason);
  const previousReason = normalizeReason(previousObservation.learner_reason);
  const currentLength = currentReason.length;
  const previousLength = previousReason.length;

  if (currentReason && previousReason && currentLength >= previousLength + 10) {
    return { speaker: "memory", dialogueMove: "extend", text: "前の問題より、今回は理由まで言えています。" };
  }

  if (currentReason && previousReason && currentLength <= Math.max(previousLength - 10, 6)) {
    return { speaker: "memory", dialogueMove: "recall", text: "前の問題より、今回は説明が少し短くなっています。" };
  }

  if (previousObservation.reasoning_style !== observation.reasoning_style) {
    if (observation.reasoning_style === "condition_based") {
      return { speaker: "memory", dialogueMove: "update_hypothesis", text: "前の問題より、今回は条件を見ながら考えています。" };
    }

    if (observation.reasoning_style === "memory_based") {
      return { speaker: "memory", dialogueMove: "recall", text: "前の問題と同じく、今回は覚えている知識が先に出ています。" };
    }

    if (observation.reasoning_style === "uncertainty") {
      return { speaker: "memory", dialogueMove: "defer", text: "前の問題より、今回は迷いが言葉に出ています。" };
    }
  }

  if (currentReason && previousReason && currentReason === previousReason) {
    return { speaker: "memory", dialogueMove: "recall", text: "前の問題と同じように、今回は同じ言い方が理由になっています。" };
  }

  if (previousObservation.correct_or_wrong !== observation.correct_or_wrong) {
    return observation.correct_or_wrong === "correct"
      ? { speaker: "memory", dialogueMove: "extend", text: "前の問題より、今回は判断が合っています。" }
      : { speaker: "memory", dialogueMove: "recall", text: "前の問題より、今回は判断が揺れています。" };
  }

  return { speaker: "memory", dialogueMove: "defer", text: "比較材料はまだ少ないですね。" };
}

function buildPatternTurn(
  observations: ObservationEvent[],
  observation: ObservationEvent,
  currentIndex: number,
  previousObservation: ObservationEvent | null
): TurnDraft {
  if (currentIndex < 1 || !previousObservation) {
    return { speaker: "pattern", dialogueMove: "defer", text: "まだ傾向を判断するには早そうです。" };
  }

  const sameMisunderstandingCount = countPriorMatches(
    observations,
    currentIndex,
    (candidate) =>
      candidate.misunderstanding_type === observation.misunderstanding_type &&
      candidate.misunderstanding_type !== "unknown"
  );

  if (sameMisunderstandingCount >= 1) {
    return { speaker: "pattern", dialogueMove: "recall", text: "同じ迷い方が続いています。" };
  }

  const sameReasoningCount = countPriorMatches(
    observations,
    currentIndex,
    (candidate) => candidate.reasoning_style === observation.reasoning_style && candidate.reasoning_style !== null
  );

  if (sameReasoningCount >= 2) {
    return { speaker: "pattern", dialogueMove: "recall", text: "観察はまだ少なめですが、この入り方が少し続いています。" };
  }

  const recentCorrectCount = observations
    .slice(Math.max(0, currentIndex - 2), currentIndex + 1)
    .filter((candidate) => candidate.correct_or_wrong === "correct").length;

  if (currentIndex + 1 < 3) {
    return { speaker: "pattern", dialogueMove: "defer", text: "まだ観察数が少ないため、判断は保留したいです。" };
  }

  if (recentCorrectCount >= 2 && observation.reasoning_style === "condition_based") {
    return { speaker: "pattern", dialogueMove: "update_hypothesis", text: "複数の問題で条件を丁寧に確認しており、条件判断を重視する傾向があるかもしれません。" };
  }

  if (previousObservation.reasoning_style !== observation.reasoning_style) {
    return { speaker: "pattern", dialogueMove: "update_hypothesis", text: "前の問題より、今回は入り方が少し違います。" };
  }

  return { speaker: "pattern", dialogueMove: "defer", text: "現時点では仮説段階なので、引き続き観察したいです。" };
}

function buildLawTurn(observation: ObservationEvent): TurnDraft {
  if (observation.misunderstanding_type === "starting_point_confusion") {
    return { speaker: "law", dialogueMove: "extend", text: "起算点の説明を確認したいですね。" };
  }

  if (observation.misunderstanding_type === "condition_omission") {
    return { speaker: "law", dialogueMove: "extend", text: "条件句をどう読んだか見返したいですね。" };
  }

  if (observation.reasoning_style === "condition_based" && observation.correct_or_wrong === "correct") {
    return { speaker: "law", dialogueMove: "agree", text: "制度の要件を確認できれば十分そうです。" };
  }

  if (observation.reasoning_style === "memory_based") {
    return { speaker: "law", dialogueMove: "defer", text: "このままObservationを続けても良さそうです。" };
  }

  if (observation.reasoning_style === "uncertainty") {
    return { speaker: "law", dialogueMove: "extend", text: "どこで迷ったかをReviewで確認したいですね。" };
  }

  return { speaker: "law", dialogueMove: "defer", text: "このままObservationを続けても良さそうです。" };
}

function buildTurnsForObservation(
  observations: ObservationEvent[],
  currentIndex: number
): CoachConversationTurn[] {
  const observation = observations[currentIndex];
  const previousObservation = findPreviousObservation(observations, currentIndex);
  const turns: TurnDraft[] = [
    buildReadingTurn(observation),
    buildMemoryTurn(observation, previousObservation),
    buildPatternTurn(observations, observation, currentIndex, previousObservation),
    buildLawTurn(observation)
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
