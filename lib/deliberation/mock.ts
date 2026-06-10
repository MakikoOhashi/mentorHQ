import { AGENTS } from "@/lib/deliberation/agents";
import type { CoachDecision, DeliberationEvent, DeliberationResponse, LearnerCase } from "@/lib/deliberation/types";

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

function getMockEvents(): DeliberationEvent[] {
  return [
    {
      round: 1,
      speaker: "misconception",
      type: "observation",
      message:
        "学習者は『3ヶ月以内』という表現には反応していますが、いつから数えるかを一度も言語化していません。起算点誤認が第一仮説です。",
      hypothesis: "起算点を『相続の開始があった時』だと機械的に読んでいる",
      confidence: 0.86,
      influenced_by: [],
      recommendation: "起算点を本人の言葉で確認する"
    },
    {
      round: 1,
      speaker: "memory",
      type: "observation",
      message:
        "以前の似たケースでは、期限そのものより『誰がいつ知ったか』の条件が抜け落ちるパターンがありました。今回は再発の匂いがあります。",
      hypothesis: "期限暗記はあるが、起算条件の想起が弱い",
      confidence: 0.72,
      influenced_by: [],
      recommendation: "条件を説明する前に、起算点を想起させる"
    },
    {
      round: 1,
      speaker: "load",
      type: "observation",
      message:
        "論点を増やすと観測しにくくなります。まずは『3ヶ月をいつから数えるか』の一点に絞るのが低負荷です。",
      hypothesis: "長い解説は観測機会を壊す",
      confidence: 0.91,
      influenced_by: [],
      recommendation: "一問だけで切り分ける"
    },
    {
      round: 2,
      speaker: "misconception",
      type: "revision",
      message:
        "Memory Agent の観測を踏まえると、単なる起算点誤認というより『条件句を落とす再発パターン』も含んでいそうです。確信度を少し下げます。",
      hypothesis: "起算点誤認を中心に、条件見落としが重なっている",
      confidence: 0.62,
      confidence_before: 0.86,
      confidence_after: 0.62,
      influenced_by: ["memory"],
      recommendation: "条件句を言わせる問いに寄せる"
    },
    {
      round: 2,
      speaker: "load",
      type: "revision",
      message:
        "Misconception Agent の仮説更新を見ると、なおさら解説先行は避けたいです。両仮説を一問で観測できる形に保つべきです。",
      hypothesis: "一問で仮説を切り分ける価値が高い",
      confidence: 0.93,
      confidence_before: 0.91,
      confidence_after: 0.93,
      influenced_by: ["misconception"],
      recommendation: "起算点の言語化を求める短問を維持する"
    },
    {
      round: 3,
      speaker: "memory",
      type: "recommendation",
      message:
        "再発パターンだとしても、今回は復習説明より先に本人の再構成を促した方が定着しやすいです。",
      hypothesis: "想起ベース介入が最も再利用性が高い",
      confidence: 0.76,
      influenced_by: ["misconception", "load"],
      recommendation: "starting_point_check を第一候補にする"
    },
    {
      round: 3,
      speaker: "misconception",
      type: "recommendation",
      message:
        "介入候補は starting_point_check に絞れます。ここで『開始があった時』をそのまま繰り返すなら、誤読が直接観測できます。",
      hypothesis: "最短観測は starting_point_check",
      confidence: 0.79,
      influenced_by: ["memory", "load"],
      recommendation: "starting_point_check"
    },
    {
      round: 4,
      speaker: "coach",
      type: "decision",
      message:
        "多数決ではなく、最も観測効率が高く低負荷な介入を採用します。今回は起算点確認が、誤解の核と再発パターンの両方を一問で確かめられます。",
      hypothesis: "説明より前に、起算点の自己言語化を観測するべき",
      confidence: 0.88,
      influenced_by: ["misconception", "memory", "load"],
      recommendation: "starting_point_check"
    }
  ];
}

function getMockCoachDecision(): CoachDecision {
  return {
    selected_intervention: "starting_point_check",
    reason:
      "Misconception Agent が起算点誤認を主仮説に置きつつ、Memory Agent の再発パターン観測で確信度を調整した。Load Agent も一問で切り分ける方針を支持したため、最短で認識のズレを観測できる。",
    next_question: "その3ヶ月は、いつから数えると思いましたか？"
  };
}

export function buildMockDeliberationResponse(): DeliberationResponse {
  void AGENTS;

  return {
    mode: "mock",
    deliberation_events: getMockEvents(),
    coach_decision: getMockCoachDecision()
  };
}
