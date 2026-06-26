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
  return `「${compact.slice(0, 26)}${compact.length > 26 ? "..." : ""}」`;
}

function getCurrentHypothesis(observation: ObservationEvent): string {
  if (observation.misunderstanding_type === "starting_point_confusion") {
    return "起算点の理解が先に揺れています。";
  }

  if (observation.misunderstanding_type === "condition_omission") {
    return "条件句が根拠から抜けています。";
  }

  if (observation.reasoning_style === "memory_based") {
    return "知識の断片で先に結論を置いています。";
  }

  if (observation.reasoning_style === "uncertainty") {
    return "結論は置いていますが根拠がまだ浮いています。";
  }

  if (observation.reasoning_style === "condition_based" && observation.correct_or_wrong === "wrong") {
    return "条件は拾えていますが結論への接続が浅いです。";
  }

  if (observation.reasoning_style === "condition_based") {
    return "条文の条件から読めています。";
  }

  return "印象で先に判断しています。";
}

function getUpdatedHypothesis(
  observation: ObservationEvent,
  previousInQuestion: ObservationEvent | null,
  relatedObservation: ObservationEvent | null
): string {
  if (previousInQuestion && previousInQuestion.reasoning_style !== observation.reasoning_style) {
    if (observation.reasoning_style === "condition_based") {
      return "今回は当て感より要件整理へ戻せています。";
    }

    return "今回は読み違いより判断軸の揺れが前に出ています。";
  }

  if (
    relatedObservation &&
    relatedObservation.misunderstanding_type === observation.misunderstanding_type &&
    observation.misunderstanding_type === "starting_point_confusion"
  ) {
    return "時点の取り方が今日の中で繰り返されています。";
  }

  if (
    relatedObservation &&
    relatedObservation.misunderstanding_type === observation.misunderstanding_type &&
    observation.misunderstanding_type === "condition_omission"
  ) {
    return "条件を落とす型が今日の中で続いています。";
  }

  if (observation.correct_or_wrong === "correct" && observation.reasoning_style === "condition_based") {
    return "制度理解の線でかなり再現できています。";
  }

  if (observation.correct_or_wrong === "wrong") {
    return "読み違い単体より制度理解の薄さが残ります。";
  }

  return "まだ一つに絞らず、制度理解寄りの仮説を残します。";
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

function buildReadingTurn(
  observation: ObservationEvent,
  previousInQuestion: ObservationEvent | null
): TurnDraft {
  const reasonQuote = quoteReason(observation.learner_reason);

  if (observation.misunderstanding_type === "starting_point_confusion") {
    return {
      speaker: "reading",
      dialogueMove: "observe",
      text: reasonQuote
        ? `${reasonQuote} が先です。起算点をそのまま置いています。`
        : "ここは起算点をそのまま置いています。"
    };
  }

  if (observation.misunderstanding_type === "condition_omission") {
    return {
      speaker: "reading",
      dialogueMove: "observe",
      text: reasonQuote
        ? `${reasonQuote} が先です。条件句が根拠から落ちています。`
        : "条件句が根拠から落ちています。"
    };
  }

  if (observation.reasoning_style === "condition_based") {
    return {
      speaker: "reading",
      dialogueMove: "observe",
      text: reasonQuote
        ? `${reasonQuote} という理由です。今回は条件から入れています。`
        : "今回は条件から入れています。"
    };
  }

  if (previousInQuestion && previousInQuestion.reasoning_style !== observation.reasoning_style) {
    return {
      speaker: "reading",
      dialogueMove: "update_hypothesis",
      text: "さっきとは入り方が違います。読む軸が切り替わっています。"
    };
  }

  return {
    speaker: "reading",
    dialogueMove: "observe",
    text: reasonQuote
      ? `${reasonQuote} が先に立っています。決め手より印象が先です。`
      : "決め手より印象で進んでいます。"
  };
}

function buildLawTurn(
  observation: ObservationEvent,
  previousInQuestion: ObservationEvent | null
): TurnDraft {
  if (observation.misunderstanding_type === "starting_point_confusion") {
    return {
      speaker: "law",
      dialogueMove: "challenge",
      text: "その読みだと開始前まで広がります。時点理解が少し危ないです。"
    };
  }

  if (observation.correct_or_wrong === "wrong" && observation.reasoning_style === "condition_based") {
    return {
      speaker: "law",
      dialogueMove: "challenge",
      text: "その線でも要件止まりです。法的効果までまだ届いていません。"
    };
  }

  if (observation.correct_or_wrong === "wrong" && observation.reasoning_style === "memory_based") {
    return {
      speaker: "law",
      dialogueMove: "extend",
      text: "知識はありますね。ただ、条文の仕組みまではつながっていません。"
    };
  }

  if (observation.correct_or_wrong === "correct" && observation.reasoning_style === "condition_based") {
    return {
      speaker: "law",
      dialogueMove: "agree",
      text: "そうですね。今回は要件から結論まできれいにつながっています。"
    };
  }

  if (previousInQuestion && previousInQuestion.correct_or_wrong !== observation.correct_or_wrong) {
    return {
      speaker: "law",
      dialogueMove: "update_hypothesis",
      text: "今回は正誤の切り分けが動いています。読み違いだけではなさそうです。"
    };
  }

  return {
    speaker: "law",
    dialogueMove: "challenge",
    text: "制度のどこで効力が変わるか、その接続がまだ弱いです。"
  };
}

function buildMemoryTurn(observation: ObservationEvent): TurnDraft {
  const reasonQuote = quoteReason(observation.learner_reason);

  if (observation.reasoning_style === "memory_based") {
    return {
      speaker: "memory",
      dialogueMove: "observe",
      text: reasonQuote
        ? `理由は ${reasonQuote} です。知識先行で、根拠としてはまだ薄いです。`
        : "知識はありますが、根拠としてはまだ薄いです。"
    };
  }

  if (observation.reasoning_style === "uncertainty") {
    return {
      speaker: "memory",
      dialogueMove: "challenge",
      text: "根拠がまだ浮いています。知識不足より判断の置き場が定まっていません。"
    };
  }

  if ((observation.learner_reason ?? "").trim().length >= 22) {
    return {
      speaker: "memory",
      dialogueMove: "agree",
      text: "理由は言葉になっています。暗記だけで押してはいなさそうです。"
    };
  }

  return {
    speaker: "memory",
    dialogueMove: "defer",
    text: "まだ知識不足とは言い切れません。判断の速さが先かもしれません。"
  };
}

function buildPatternTurn(
  observation: ObservationEvent,
  relatedObservation: ObservationEvent | null
): TurnDraft | null {
  if (!relatedObservation) {
    return null;
  }

  if (relatedObservation.misunderstanding_type === observation.misunderstanding_type) {
    if (observation.misunderstanding_type === "starting_point_confusion") {
      return {
        speaker: "pattern",
        dialogueMove: "recall",
        text: "前の肢でも時点で揺れていました。今日の迷い方がここでつながります。"
      };
    }

    if (observation.misunderstanding_type === "condition_omission") {
      return {
        speaker: "pattern",
        dialogueMove: "recall",
        text: "前の肢でも条件が薄かったです。今回も同じ落とし方です。"
      };
    }
  }

  if (relatedObservation.reasoning_style === observation.reasoning_style) {
    return {
      speaker: "pattern",
      dialogueMove: "recall",
      text: "今日の中で同じ入り方が続いています。判断軸が固定されています。"
    };
  }

  return {
    speaker: "pattern",
    dialogueMove: "update_hypothesis",
    text: "前の肢とは少し違います。今回は迷い方が制度理解側へ寄っています。"
  };
}

function buildReviewTurn(
  observation: ObservationEvent,
  previousInQuestion: ObservationEvent | null,
  relatedObservation: ObservationEvent | null
): TurnDraft {
  const updatedHypothesis = getUpdatedHypothesis(observation, previousInQuestion, relatedObservation);

  if (relatedObservation || previousInQuestion) {
    return {
      speaker: "review",
      dialogueMove: "update_hypothesis",
      text: `いまのところ ${updatedHypothesis}`
    };
  }

  if (observation.correct_or_wrong === "wrong" || observation.reasoning_style === "uncertainty") {
    return {
      speaker: "review",
      dialogueMove: "defer",
      text: `まだ保留ですが、${getCurrentHypothesis(observation)}`
    };
  }

  return {
    speaker: "review",
    dialogueMove: "extend",
    text: `この肢は良い材料です。${updatedHypothesis}`
  };
}

function buildTurnsForObservation(
  observations: ObservationEvent[],
  currentIndex: number
): CoachConversationTurn[] {
  const observation = observations[currentIndex];
  const previousInQuestion = findPreviousQuestionObservation(observations, currentIndex);
  const relatedObservation = findRecentRelatedObservation(observations, currentIndex);
  const readingTurn = buildReadingTurn(observation, previousInQuestion);
  const lawTurn = buildLawTurn(observation, previousInQuestion);
  const memoryTurn = buildMemoryTurn(observation);
  const patternTurn = buildPatternTurn(observation, relatedObservation);
  const reviewTurn = buildReviewTurn(observation, previousInQuestion, relatedObservation);
  const turns: TurnDraft[] = [];

  const samePattern =
    relatedObservation &&
    relatedObservation.misunderstanding_type === observation.misunderstanding_type;
  const longReason = (observation.learner_reason ?? "").trim().length >= 22;
  const needsLawPush =
    observation.correct_or_wrong === "wrong" ||
    observation.misunderstanding_type === "starting_point_confusion" ||
    observation.misunderstanding_type === "condition_omission";

  if (samePattern && patternTurn) {
    turns.push(patternTurn);
    turns.push({
      speaker: "reading",
      dialogueMove: "agree",
      text:
        observation.misunderstanding_type === "starting_point_confusion"
          ? "たしかに。今回も読み出しで時点がずれています。"
          : "たしかに。今回も条件より先に結論へ寄っています。"
    });

    if (needsLawPush) {
      turns.push(lawTurn);
    }

    turns.push({
      speaker: "review",
      dialogueMove: "defer",
      text: `まだ決め切らず、${getUpdatedHypothesis(observation, previousInQuestion, relatedObservation)}`
    });
  } else if (observation.reasoning_style === "memory_based" || longReason) {
    turns.push(memoryTurn);
    turns.push({
      speaker: "reading",
      dialogueMove: observation.reasoning_style === "memory_based" ? "agree" : "extend",
      text:
        observation.reasoning_style === "memory_based"
          ? "たしかに。読む前に答えの形を置きにいっています。"
          : "その理由なら、読む順番もかなり崩れてはいません。"
    });

    if (needsLawPush) {
      turns.push(lawTurn);
    } else if (patternTurn) {
      turns.push(patternTurn);
    }

    turns.push({
      speaker: "review",
      dialogueMove: observation.reasoning_style === "memory_based" ? "defer" : reviewTurn.dialogueMove,
      text:
        observation.reasoning_style === "memory_based"
          ? "まだ暗記寄りと決め切らず、次の肢も見ておきたいです。"
          : reviewTurn.text
    });
  } else if (observation.reasoning_style === "condition_based" && observation.correct_or_wrong === "correct") {
    turns.push(readingTurn);
    turns.push(lawTurn);

    if (patternTurn) {
      turns.push(patternTurn);
    }

    turns.push({
      speaker: "reading",
      dialogueMove: "update_hypothesis",
      text: "今回は読み違いより、判断基準が安定してきています。"
    });
  } else {
    turns.push(readingTurn);
    turns.push(lawTurn);

    if (observation.reasoning_style === "uncertainty") {
      turns.push(memoryTurn);
    } else if (patternTurn) {
      turns.push(patternTurn);
    }

    turns.push(reviewTurn);
  }

  return turns.slice(0, 5).map((turn, index) => ({
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
