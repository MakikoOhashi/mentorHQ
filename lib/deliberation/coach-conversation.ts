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
): { speaker: CoachConversationSpeaker; dialogueMove: DialogueMove; text: string } {
  const reasonQuote = quoteReason(observation.learner_reason);

  if (observation.misunderstanding_type === "starting_point_confusion") {
    return {
      speaker: "reading",
      dialogueMove: "raise_hypothesis",
      text: reasonQuote
        ? `${reasonQuote} と置いていますね。起算点をそのまま受け取っています。`
        : "ここは起算点をそのまま受け取っています。"
    };
  }

  if (observation.misunderstanding_type === "condition_omission") {
    return {
      speaker: "reading",
      dialogueMove: "raise_hypothesis",
      text: reasonQuote
        ? `${reasonQuote} が先に出ています。条件句が根拠から落ちています。`
        : "条件句が根拠から落ちています。"
    };
  }

  if (observation.reasoning_style === "condition_based") {
    return {
      speaker: "reading",
      dialogueMove: "agree",
      text: reasonQuote
        ? `${reasonQuote} という理由づけです。今回は条件から入れていますね。`
        : "今回は条件から入れていますね。"
    };
  }

  if (previousInQuestion && previousInQuestion.reasoning_style !== observation.reasoning_style) {
    return {
      speaker: "reading",
      dialogueMove: "update_hypothesis",
      text: "さっきとは入り方が違います。読みの軸が切り替わっています。"
    };
  }

  return {
    speaker: "reading",
    dialogueMove: "add_detail",
    text: reasonQuote
      ? `${reasonQuote} が先に立っています。決め手より印象で進んでいます。`
      : "決め手より印象で進んでいます。"
  };
}

function buildLawTurn(
  observation: ObservationEvent,
  previousInQuestion: ObservationEvent | null
): { speaker: CoachConversationSpeaker; dialogueMove: DialogueMove; text: string } {
  if (observation.misunderstanding_type === "starting_point_confusion") {
    return {
      speaker: "law",
      dialogueMove: "add_detail",
      text: "その読みだと開始前の扱いまで広がってしまいます。時点理解のずれが強そうです。"
    };
  }

  if (observation.correct_or_wrong === "wrong" && observation.reasoning_style === "condition_based") {
    return {
      speaker: "law",
      dialogueMove: "disagree",
      text: "その線なら要件は拾えています。ただ、結論に必要な法的効果が一段抜けています。"
    };
  }

  if (observation.correct_or_wrong === "wrong" && observation.reasoning_style === "memory_based") {
    return {
      speaker: "law",
      dialogueMove: "add_detail",
      text: "知識はありますが、条文の仕組みとしてはまだつながっていません。"
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
      text: "今回は正誤の切り分け方が動いています。単なる読み違いだけではなさそうです。"
    };
  }

  return {
    speaker: "law",
    dialogueMove: "raise_hypothesis",
    text: "制度のどこで効力が変わるか、その接続がまだ弱いです。"
  };
}

function buildMemoryTurn(observation: ObservationEvent): {
  speaker: CoachConversationSpeaker;
  dialogueMove: DialogueMove;
  text: string;
} {
  const reasonQuote = quoteReason(observation.learner_reason);

  if (observation.reasoning_style === "memory_based") {
    return {
      speaker: "memory",
      dialogueMove: "add_detail",
      text: reasonQuote
        ? `理由は ${reasonQuote} です。知識はありますが、根拠としてはまだ薄いです。`
        : "知識はありますが、根拠としてはまだ薄いです。"
    };
  }

  if (observation.reasoning_style === "uncertainty") {
    return {
      speaker: "memory",
      dialogueMove: "raise_hypothesis",
      text: "根拠がまだ浮いています。知識不足というより判断の置き場が定まっていません。"
    };
  }

  if ((observation.learner_reason ?? "").trim().length >= 22) {
    return {
      speaker: "memory",
      dialogueMove: "agree",
      text: "理由は言葉になっています。暗記より理解ベースで再現できそうです。"
    };
  }

  return {
    speaker: "memory",
    dialogueMove: "defer",
    text: "まだ知識不足とは言い切れません。判断の速さが先に出た可能性を残します。"
  };
}

function buildPatternTurn(
  observation: ObservationEvent,
  relatedObservation: ObservationEvent | null
): { speaker: CoachConversationSpeaker; dialogueMove: DialogueMove; text: string } | null {
  if (!relatedObservation) {
    return null;
  }

  if (relatedObservation.misunderstanding_type === observation.misunderstanding_type) {
    if (observation.misunderstanding_type === "starting_point_confusion") {
      return {
        speaker: "pattern",
        dialogueMove: "connect_previous",
        text: "前の肢でも時点で揺れていました。今日の迷い方がここでつながります。"
      };
    }

    if (observation.misunderstanding_type === "condition_omission") {
      return {
        speaker: "pattern",
        dialogueMove: "connect_previous",
        text: "前の肢でも条件が薄かったです。今回も同じ落とし方です。"
      };
    }
  }

  if (relatedObservation.reasoning_style === observation.reasoning_style) {
    return {
      speaker: "pattern",
      dialogueMove: "connect_previous",
      text: "今日の中で同じ入り方が続いています。判断軸が固定されています。"
    };
  }

  return {
    speaker: "pattern",
    dialogueMove: "update_hypothesis",
    text: "前の肢とは少し違います。今回は迷い方の軸が制度理解側へ寄っています。"
  };
}

function buildReviewTurn(
  observation: ObservationEvent,
  previousInQuestion: ObservationEvent | null,
  relatedObservation: ObservationEvent | null
): { speaker: CoachConversationSpeaker; dialogueMove: DialogueMove; text: string } {
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
    dialogueMove: "agree",
    text: `この肢は良い材料です。${getUpdatedHypothesis(observation, previousInQuestion, relatedObservation)}`
  };
}

function buildTurnsForObservation(
  observations: ObservationEvent[],
  currentIndex: number
): CoachConversationTurn[] {
  const observation = observations[currentIndex];
  const previousInQuestion = findPreviousQuestionObservation(observations, currentIndex);
  const relatedObservation = findRecentRelatedObservation(observations, currentIndex);
  const turns: Array<{ speaker: CoachConversationSpeaker; dialogueMove: DialogueMove; text: string }> = [];

  turns.push(buildReadingTurn(observation, previousInQuestion));
  turns.push(buildLawTurn(observation, previousInQuestion));

  const patternTurn = buildPatternTurn(observation, relatedObservation);
  let hasMemoryTurn = false;

  if (patternTurn && (relatedObservation || previousInQuestion)) {
    turns.push(patternTurn);
  } else {
    turns.push(buildMemoryTurn(observation));
    hasMemoryTurn = true;
  }

  if (!hasMemoryTurn && (observation.reasoning_style === "memory_based" || observation.reasoning_style === "uncertainty")) {
    turns.push(buildMemoryTurn(observation));
  }

  turns.push(buildReviewTurn(observation, previousInQuestion, relatedObservation));

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
