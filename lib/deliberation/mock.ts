import { AGENTS } from "@/lib/deliberation/agents";
import type { CoachDecision, DeliberationEvent, DeliberationResponse, LearnerCase } from "@/lib/deliberation/types";
import type { MemorySummary } from "@/lib/deliberation/session-memory";

const speakerLabels = {
  misconception: "誤解仮説エージェント",
  memory: "記憶参照エージェント",
  load: "負荷調整エージェント",
  coach: "コーチ"
} as const;

export function getDefaultLearnerCase(): LearnerCase {
  return {
    exam: "管理業務主任者試験",
    theme: "相続放棄 / 3ヶ月起算点誤認",
    questionTitle: "相続放棄の起算点を見抜けるか",
    questionStem:
      "次の記述のうち、民法上の相続放棄に関するものとして正しいか判断してください。",
    currentLeg: "相続放棄は、相続の開始があった時から3箇月以内にしなければならない。",
    learnerAnswer: "正しいと思った",
    reason: "3ヶ月以内と書いてあるので正しいと思った。",
    objectiveTruth: "誤り。起算点は『相続の開始を知った時から』であり、『開始があった時から』ではない。"
  };
}

function getMemoryChallengeMessage(memorySummary?: MemorySummary | null): string {
  if (!memorySummary) {
    return "前も条件を飛ばしてたし、今回もそこ怪しい。";
  }

  return memorySummary.memoryMessageHint;
}

function getMockEvents(memorySummary?: MemorySummary | null): DeliberationEvent[] {
  return [
    {
      round: 1,
      speaker: "misconception",
      speaker_label: speakerLabels.misconception,
      type: "observation",
      message: "3ヶ月までは見えてる。起点が抜けてるかも。",
      hypothesis: "起算点を機械的に読んでいるかも",
      confidence_after: 0.86,
      influenced_by: []
    },
    {
      round: 2,
      speaker: "memory",
      speaker_label: speakerLabels.memory,
      type: "challenge",
      message: getMemoryChallengeMessage(memorySummary),
      hypothesis: "条件句の読み落とし癖もありそう",
      confidence_after: 0.72,
      influenced_by: ["misconception"]
    },
    {
      round: 2,
      speaker: "misconception",
      speaker_label: speakerLabels.misconception,
      type: "revision",
      message: "それなら見方変わるな。条件抜けも強そう。",
      hypothesis: "起算点誤認＋条件読み落とし",
      confidence_before: 0.86,
      confidence_after: 0.68,
      influenced_by: ["memory"]
    },
    {
      round: 3,
      speaker: "load",
      speaker_label: speakerLabels.load,
      type: "recommendation",
      message: "説明より先に、一問だけ当てて切り分けたい。",
      hypothesis: "一問確認がいちばん軽い",
      confidence_after: 0.91,
      influenced_by: ["misconception", "memory"]
    },
    {
      round: 4,
      speaker: "coach",
      speaker_label: speakerLabels.coach,
      type: "coach_decision",
      message: "じゃあ起算点からいこう。そこがいちばん早い。",
      hypothesis: "説明前に起算点を確認する",
      confidence_after: 0.88,
      influenced_by: ["misconception", "memory", "load"]
    }
  ];
}

function getMockCoachDecision(): CoachDecision {
  return {
    selected_intervention: "starting_point_check",
    reason: "起算点のズレか条件読み落としかを、一問で軽く切り分けられるためです。",
    next_question: "その3ヶ月は、いつから数えると思いましたか？"
  };
}

export function buildMockDeliberationResponse(memorySummary?: MemorySummary | null): DeliberationResponse {
  void AGENTS;

  return {
    mode: "mock",
    deliberation_events: getMockEvents(memorySummary),
    coach_decision: getMockCoachDecision()
  };
}
