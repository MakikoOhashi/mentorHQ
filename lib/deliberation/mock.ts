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

export type MockDailyPracticeQuestion = {
  id: string;
  learnerCase: LearnerCase;
};

export const MOCK_DAILY_PRACTICE_QUESTIONS: MockDailyPracticeQuestion[] = [
  {
    id: "q1",
    learnerCase: getDefaultLearnerCase()
  },
  {
    id: "q2",
    learnerCase: {
      exam: "管理業務主任者試験",
      theme: "区分所有法 / 共用部分の変更",
      questionTitle: "共用部分の変更を見抜けるか",
      questionStem:
        "次の記述のうち、区分所有法上の共用部分の変更に関するものとして正しいか判断してください。",
      currentLeg:
        "共用部分の著しい変更であっても、区分所有者および議決権の各過半数で決議できる。",
      learnerAnswer: "正しいと思った",
      reason: "変更だから通常決議でも足りると思った。",
      objectiveTruth:
        "誤り。共用部分の著しい変更には原則として特別決議が必要であり、各過半数では足りない。"
    }
  },
  {
    id: "q3",
    learnerCase: {
      exam: "管理業務主任者試験",
      theme: "標準管理規約 / 管理者の権限",
      questionTitle: "管理者の権限範囲を切り分けられるか",
      questionStem:
        "次の記述のうち、管理組合の管理者の権限に関するものとして正しいか判断してください。",
      currentLeg:
        "管理者は、規約に別段の定めがなくても、共用部分の重大変更について単独で契約を締結できる。",
      learnerAnswer: "やや正しいと思った",
      reason: "管理者なら対外的に代表できるので単独でも進められると思った。",
      objectiveTruth:
        "誤り。管理者に代表権があっても、重大変更は総会決議などの内部意思決定を要し、単独で自由に進められるわけではない。"
    }
  }
];

export function getMockDailyPracticeQuestionIds(): string[] {
  return MOCK_DAILY_PRACTICE_QUESTIONS.map((question) => question.id);
}

export function getLearnerCaseByQuestionId(questionId: string): LearnerCase | null {
  return MOCK_DAILY_PRACTICE_QUESTIONS.find((question) => question.id === questionId)?.learnerCase ?? null;
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
