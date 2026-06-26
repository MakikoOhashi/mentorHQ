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
  if (observation.misunderstanding_type === "starting_point_confusion") {
    return {
      speaker: "reading",
      dialogueMove: "raise_hypothesis",
      text: "ここは起算点をそのまま置いて読んでいるかもしれません。"
    };
  }

  if (observation.misunderstanding_type === "condition_omission") {
    return {
      speaker: "reading",
      dialogueMove: "raise_hypothesis",
      text: "ただ、条件句が後ろに回っていそうです。"
    };
  }

  if (observation.reasoning_style === "condition_based") {
    return {
      speaker: "reading",
      dialogueMove: "agree",
      text: "たしかに、今回は条件を拾ってから入れています。"
    };
  }

  if (previousInQuestion && previousInQuestion.reasoning_style !== observation.reasoning_style) {
    return {
      speaker: "reading",
      dialogueMove: "update_hypothesis",
      text: "今回は少し違います。読みの軸が切り替わっています。"
    };
  }

  return {
    speaker: "reading",
    dialogueMove: "add_detail",
    text: "問題文の決め手より先に印象で進んでいそうです。"
  };
}

function buildLawTurn(
  observation: ObservationEvent,
  previousInQuestion: ObservationEvent | null
): { speaker: CoachConversationSpeaker; dialogueMove: DialogueMove; text: string } {
  if (observation.correct_or_wrong === "wrong" && observation.reasoning_style === "condition_based") {
    return {
      speaker: "law",
      dialogueMove: "disagree",
      text: "少し違和感があります。要件は見ていますが結論のつなぎ方がずれています。"
    };
  }

  if (observation.correct_or_wrong === "wrong" && observation.reasoning_style === "memory_based") {
    return {
      speaker: "law",
      dialogueMove: "add_detail",
      text: "数字や語句は出ていますが、法的効果まで届いていません。"
    };
  }

  if (observation.correct_or_wrong === "correct" && observation.reasoning_style === "condition_based") {
    return {
      speaker: "law",
      dialogueMove: "agree",
      text: "たしかに、この肢は要件から結論までつながっています。"
    };
  }

  if (previousInQuestion && previousInQuestion.correct_or_wrong !== observation.correct_or_wrong) {
    return {
      speaker: "law",
      dialogueMove: "update_hypothesis",
      text: "今回は少し違います。正誤の切り分け方がさっきより動いています。"
    };
  }

  return {
    speaker: "law",
    dialogueMove: "raise_hypothesis",
    text: "手続か法的効果のどちらかを飛ばしているかもしれません。"
  };
}

function buildMemoryTurn(observation: ObservationEvent): {
  speaker: CoachConversationSpeaker;
  dialogueMove: DialogueMove;
  text: string;
} {
  if (observation.reasoning_style === "memory_based") {
    return {
      speaker: "memory",
      dialogueMove: "add_detail",
      text: "理由が『覚えていた』寄りなので、暗記の断片かもしれません。"
    };
  }

  if (observation.reasoning_style === "uncertainty") {
    return {
      speaker: "memory",
      dialogueMove: "raise_hypothesis",
      text: "根拠がまだ薄いです。『なんとなく』が残っていそうです。"
    };
  }

  if ((observation.learner_reason ?? "").trim().length >= 22) {
    return {
      speaker: "memory",
      dialogueMove: "agree",
      text: "理由は言葉になっています。理解ベースで再現できそうです。"
    };
  }

  return {
    speaker: "memory",
    dialogueMove: "defer",
    text: "いったん保留でよさそうです。もう一肢見れば再現性が見えます。"
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
        text: "さっきも時点の条件で迷っていました。同じ型かもしれません。"
      };
    }

    if (observation.misunderstanding_type === "condition_omission") {
      return {
        speaker: "pattern",
        dialogueMove: "connect_previous",
        text: "前の肢でも条件句が薄かったです。今回も似ています。"
      };
    }
  }

  if (relatedObservation.reasoning_style === observation.reasoning_style) {
    return {
      speaker: "pattern",
      dialogueMove: "connect_previous",
      text: "今日の中で同じ入り方が続いています。繰り返しの傾向として見えます。"
    };
  }

  return {
    speaker: "pattern",
    dialogueMove: "update_hypothesis",
    text: "前の肢とは少し違います。今回は迷い方の軸がずれています。"
  };
}

function buildReviewTurn(
  observation: ObservationEvent,
  relatedObservation: ObservationEvent | null
): { speaker: CoachConversationSpeaker; dialogueMove: DialogueMove; text: string } {
  if (relatedObservation) {
    return {
      speaker: "review",
      dialogueMove: "connect_previous",
      text: "ここはレビュー候補ですね。前の肢とのつながりごと残しておきます。"
    };
  }

  if (observation.correct_or_wrong === "wrong" || observation.reasoning_style === "uncertainty") {
    return {
      speaker: "review",
      dialogueMove: "defer",
      text: "まだ結論は出さず、読み方と要件のずれを候補に置きます。"
    };
  }

  return {
    speaker: "review",
    dialogueMove: "defer",
    text: "いったん保留でよさそうです。明日の練習につながるかだけ見ます。"
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

  if (observation.reasoning_style === "memory_based" || observation.reasoning_style === "uncertainty") {
    turns.push(buildMemoryTurn(observation));
  } else {
    turns.push(buildLawTurn(observation, previousInQuestion));
  }

  const patternTurn = buildPatternTurn(observation, relatedObservation);
  if (patternTurn) {
    turns.push(patternTurn);
  } else {
    turns.push(buildMemoryTurn(observation));
  }

  turns.push(buildReviewTurn(observation, relatedObservation));

  return turns.slice(0, 4).map((turn, index) => ({
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
