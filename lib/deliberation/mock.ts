import { AGENTS } from "@/lib/deliberation/agents";
import type {
  CoachDecision,
  DeliberationEvent,
  DeliberationResponse,
  LearnerCase
} from "@/lib/deliberation/types";
import type { MemorySummary } from "@/lib/deliberation/session-memory";

const speakerLabels = {
  reading: "Reading Coach",
  law: "Law Coach",
  memory: "Memory Coach",
  pattern: "Pattern Coach",
  review: "Review Coach",
  coach: "コーチ"
} as const;

function withLegacyFields(learnerCase: Omit<LearnerCase, "currentLeg" | "learnerAnswer" | "reason" | "objectiveTruth">): LearnerCase {
  const firstStatement = learnerCase.statements[0];
  const correctStatement = learnerCase.statements[learnerCase.correctStatementIndex - 1];

  return {
    ...learnerCase,
    currentLeg: firstStatement?.text ?? "",
    learnerAnswer: `肢${learnerCase.correctStatementIndex}が正しいと思う`,
    reason: "各肢を順番に見てから最後に全体判断する。",
    objectiveTruth: correctStatement
      ? `正解は肢${learnerCase.correctStatementIndex}。${correctStatement.explanation}`
      : learnerCase.finalSummary
  };
}

export function getDefaultLearnerCase(): LearnerCase {
  return withLegacyFields({
    exam: "管理業務主任者試験",
    theme: "相続 / 相続放棄",
    questionTitle: "相続放棄の条文を肢ごとに見抜けるか",
    questionStem: "相続に関する次の記述のうち、民法の規定によれば正しいものはどれですか。",
    statements: [
      {
        id: "q1-s1",
        text: "相続の放棄は、自己のために相続の開始があったことを知った時から3か月以内にしなければならない。",
        isCorrect: true,
        explanation: "相続放棄の熟慮期間は、自己のために相続の開始があったことを知った時から3か月です。"
      },
      {
        id: "q1-s2",
        text: "相続人は、相続の開始前であっても、あらかじめ相続の放棄をすることができる。",
        isCorrect: false,
        explanation: "相続放棄は相続開始後に家庭裁判所へ申述して行うため、開始前にあらかじめ放棄はできません。"
      },
      {
        id: "q1-s3",
        text: "相続放棄をした者であっても、被相続人の債務については相続人として責任を負う。",
        isCorrect: false,
        explanation: "相続放棄をした者は初めから相続人とならなかったものとみなされるため、その前提で債務責任も負いません。"
      },
      {
        id: "q1-s4",
        text: "相続放棄は、口頭で他の相続人に伝えれば効力を生ずる。",
        isCorrect: false,
        explanation: "相続放棄は家庭裁判所への申述が必要で、他の相続人への口頭通知だけでは効力を生じません。"
      }
    ],
    correctStatementIndex: 1,
    finalSummary: "数字だけでなく、起算点と手続先まで確認すると相続放棄の肢を切り分けやすくなります。"
  });
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
    learnerCase: withLegacyFields({
      exam: "管理業務主任者試験",
      theme: "区分所有法 / 共用部分の変更",
      questionTitle: "共用部分の変更を肢ごとに見抜けるか",
      questionStem: "区分所有法に関する次の記述のうち、正しいものはどれですか。",
      statements: [
        {
          id: "q2-s1",
          text: "共用部分の著しい変更は、区分所有者および議決権の各4分の3以上の多数による決議が必要である。",
          isCorrect: true,
          explanation: "著しい変更は原則として特別決議事項であり、各4分の3以上が必要です。"
        },
        {
          id: "q2-s2",
          text: "共用部分の軽微変更であっても、必ず各4分の3以上の多数による決議を要する。",
          isCorrect: false,
          explanation: "軽微変更まで一律に特別決議を要するわけではありません。"
        },
        {
          id: "q2-s3",
          text: "共用部分の変更は、管理者が単独で自由に決定できる。",
          isCorrect: false,
          explanation: "変更の内容に応じて集会決議が必要であり、管理者が単独で自由に決められるわけではありません。"
        },
        {
          id: "q2-s4",
          text: "共用部分の変更では、議決権の要件は不要で、人数のみで決する。",
          isCorrect: false,
          explanation: "区分所有者数と議決権数の双方の要件が問題になります。"
        }
      ],
      correctStatementIndex: 1,
      finalSummary: "変更の重さと決議要件を切り分けると、共用部分の問題は整理しやすくなります。"
    })
  },
  {
    id: "q3",
    learnerCase: withLegacyFields({
      exam: "管理業務主任者試験",
      theme: "標準管理規約 / 管理者の権限",
      questionTitle: "管理者の権限範囲を肢ごとに見抜けるか",
      questionStem: "管理組合の管理者に関する次の記述のうち、正しいものはどれですか。",
      statements: [
        {
          id: "q3-s1",
          text: "管理者は、共用部分の重大変更について、総会決議がなくても単独で契約を締結できる。",
          isCorrect: false,
          explanation: "重大変更は総会決議など内部意思決定が必要で、管理者が単独で自由に進められるわけではありません。"
        },
        {
          id: "q3-s2",
          text: "管理者は、規約や総会決議の範囲内で、管理組合を代表して業務を執行する。",
          isCorrect: true,
          explanation: "管理者の代表権・執行権は規約や総会決議の範囲内で行使されます。"
        },
        {
          id: "q3-s3",
          text: "管理者は、選任された時点で、すべての専有部分の処分権を取得する。",
          isCorrect: false,
          explanation: "管理者は専有部分の処分権を取得しません。"
        },
        {
          id: "q3-s4",
          text: "管理者は、総会の承認があってもなくても、規約を自由に変更できる。",
          isCorrect: false,
          explanation: "規約変更は区分所有法上の決議事項であり、管理者が自由に変更できません。"
        }
      ],
      correctStatementIndex: 2,
      finalSummary: "代表権があっても、内部決定を飛ばせるわけではない点を押さえるのが要点です。"
    })
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
    return "前も数字を先に見ていたし、今回もそこから入りそう。";
  }

  return memorySummary.memoryMessageHint;
}

function getMockEvents(memorySummary?: MemorySummary | null): DeliberationEvent[] {
  return [
    {
      round: 1,
      speaker: "reading",
      speaker_label: speakerLabels.reading,
      type: "observation",
      dialogue_move: "raise_hypothesis",
      message: "3か月だけ先に拾って、起算点が抜けていそうです。",
      hypothesis: "数字先行で起算点が薄い",
      confidence_after: 0.78,
      influenced_by: []
    },
    {
      round: 2,
      speaker: "memory",
      speaker_label: speakerLabels.memory,
      type: "challenge",
      dialogue_move: "add_detail",
      message: getMemoryChallengeMessage(memorySummary),
      hypothesis: "覚えている数字が先に出ている",
      confidence_after: 0.71,
      influenced_by: ["reading"]
    },
    {
      round: 2,
      speaker: "law",
      speaker_label: speakerLabels.law,
      type: "revision",
      dialogue_move: "update_hypothesis",
      message: "ただ、数字だけでは足りません。法的効果までつなぎたいです。",
      hypothesis: "起算点と法的効果の接続不足",
      confidence_before: 0.78,
      confidence_after: 0.73,
      influenced_by: ["memory"]
    },
    {
      round: 3,
      speaker: "pattern",
      speaker_label: speakerLabels.pattern,
      type: "recommendation",
      dialogue_move: "connect_previous",
      message: "前も起算点で迷っていました。同じ型として扱えそうです。",
      hypothesis: "起算点の迷いが再発している",
      confidence_after: 0.88,
      influenced_by: ["reading", "memory", "law"]
    },
    {
      round: 4,
      speaker: "coach",
      speaker_label: speakerLabels.coach,
      type: "coach_decision",
      dialogue_move: "add_detail",
      message: "では起算点から聞きます。ここがいちばん早そうです。",
      hypothesis: "起算点確認が先",
      confidence_after: 0.86,
      influenced_by: ["reading", "memory", "law", "pattern"]
    }
  ];
}

function getMockCoachDecision(): CoachDecision {
  return {
    selected_intervention: "leg_breakdown",
    reason: "4肢を一括ではなく順番に観察した方が、判断根拠と迷い方を切り分けやすいためです。",
    next_question: "まず肢1を見て、正しいか誤りかを選んでください。"
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
