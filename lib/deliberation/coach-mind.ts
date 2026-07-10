import { getDeliberationConfig, hasGeminiConfig } from "@/lib/deliberation/config";
import { getLearnerCaseByQuestionId } from "@/lib/deliberation/mock";
import type {
  CoachMindResponse,
  CoachMindSpeaker,
  CoachMindTurnOutput,
  ObservationEvent,
  QuestionStatement
} from "@/lib/deliberation/types";

const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

type RawGeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

const SPEAKER_LABELS: Record<CoachMindSpeaker, string> = {
  reading: "Reading",
  memory: "Memory",
  pattern: "Pattern",
  review: "Review"
};

const FALLBACK_TURNS: CoachMindTurnOutput[] = [
  { speaker: "reading", speakerLabel: "Reading", text: "今回はここで止まった。" },
  { speaker: "memory", speakerLabel: "Memory", text: "たしかに。まだ比較材料が少ない。" },
  { speaker: "pattern", speakerLabel: "Pattern", text: "現時点では、傾向は保留。" },
  { speaker: "review", speakerLabel: "Review", text: "一旦保留。Review候補。" }
];

const FALLBACK_PROBLEM_REVIEW_TURNS: CoachMindTurnOutput[] = [
  { speaker: "reading", speakerLabel: "Reading", text: "この問題では、4つの肢を通して条件を確認していた。" },
  { speaker: "memory", speakerLabel: "Memory", text: "各肢で判断の軸は大きくぶれていない。" },
  { speaker: "pattern", speakerLabel: "Pattern", text: "現時点では、条件の整理が進んでいる可能性がある。" },
  { speaker: "review", speakerLabel: "Review", text: "別テーマでも同じ整理ができるか見たい。" }
];

const LEARNER_CHAT_ABSENCE_RULES = [
  "Do NOT infer learner characteristics from the absence of learner chat.",
  "Learner chat is only available after incorrect answers.",
  "Therefore:",
  "- Never compare \"chat vs no chat\".",
  "- Never mention \"chat information was not provided.\"",
  "- Never treat the absence of chat as learner behavior.",
  "- Never use \"question frequency\" unless the learner actually opened learner chat.",
  "Only discuss learner chat when an actual learner chat event exists."
].join("\n");

const COACH_TURN_COMPARISON_SCOPE_RULES = [
  "Memory / Pattern / Review では、『チャット有無』『質問有無』を比較対象にしない。",
  "Memory / Pattern / Review の比較対象は Observation / reasoning style / misunderstanding / statement judgment / theme understanding のみ。",
  "learner chat event が実際に存在する場合だけ、その内容を観測事実として扱ってよい。ただし chat の有無や質問の有無を学習者特徴にしない。"
].join("\n");

type ProblemReviewFinalResult = {
  selectedIndex: number;
  correctIndex: number;
  final_answer: number;
  correct_answer: number;
  final_answer_correct: boolean;
  summary: string;
};

function truncateForLog(value: string, maxLength = 1000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…[truncated]` : value;
}

function sanitizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function parseLearnerChatHistory(note: string): Array<{ role: "learner" | "coach"; text: string }> {
  const messages: Array<{ role: "learner" | "coach"; text: string }> = [];

  note
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (line.startsWith("Learner: ")) {
        messages.push({ role: "learner", text: line.slice("Learner: ".length).trim() });
        return;
      }

      if (line.startsWith("Coach: ")) {
        messages.push({ role: "coach", text: line.slice("Coach: ".length).trim() });
      }
    });

  return messages;
}

function buildObservationPromptContext(observation: ObservationEvent): {
  question_id: string;
  statement_index: number | null;
  learner_choice: typeof observation.learner_choice;
  correct_or_wrong: typeof observation.correct_or_wrong;
  observation_note: string;
  learner_chat_messages?: Array<{ role: "learner" | "coach"; text: string }>;
} {
  const learnerChatMessages = parseLearnerChatHistory(observation.note);

  return {
    question_id: observation.question_id,
    statement_index: observation.statement_index,
    learner_choice: observation.learner_choice,
    correct_or_wrong: observation.correct_or_wrong,
    observation_note: observation.observation_note,
    ...(learnerChatMessages.length > 0 ? { learner_chat_messages: learnerChatMessages } : {})
  };
}

function buildStatementPromptContext(statement: QuestionStatement | null) {
  if (!statement) {
    return null;
  }

  return {
    statement_text: statement.text,
    correct_label: statement.isCorrect ? "correct" : "incorrect",
    statement_explanation: statement.explanation
  };
}

function buildProblemReviewSystemInstruction(): string {
  return [
    "あなたは MentorHQ の AI Coach Team です。",
    "目的は、1問全体の Observation と最終回答結果を読み、この問題に限った Coach Review を作ることです。",
    "これは Daily Review ではない。Tomorrow Plan でもない。1問の総括だけを書く。",
    "文体は短い内部会話。Reading → Memory → Pattern → Review の順で 4 turns を返す。",
    "各 agent は前の agent に短く反応してから自分の意見を言う。",
    "問題の正答率や点数の話に寄せない。何を理解しているかを中心に書く。",
    "Observation に存在しない事実は書かない。",
    "観測されていないことは推測しない。",
    "final_answer_correct は最終回答の正誤を示す最優先の事実です。",
    "最終正誤を Observation から推測してはいけません。",
    "質問したことと最終正誤を結び付けてはいけません。",
    LEARNER_CHAT_ABSENCE_RULES,
    COACH_TURN_COMPARISON_SCOPE_RULES,
    "final_answer_correct が true の場合、『全体を誤答した』『最終的に誤答した』『最終回答を誤答した』とは絶対に書かない。",
    "Reading はこの問題全体で実際に起きたことを一言でまとめる。",
    "Memory は各肢 Observation の差分を比較する。正誤の回数ではなく、理解の変化を見る。",
    "Pattern は問題テーマから一段抽象化して、学習者モデルの仮説を書く。",
    "Pattern は『正答率が安定』のように成績分析へ寄せない。",
    "Pattern は『何を理解できているか』を言う。",
    "Observation が少ない場合は断定しない。",
    "Review は次に別テーマで何を確かめたいかを短く置く。",
    "出力は JSON のみで、Markdown やコードフェンスは禁止です。"
  ].join("\n");
}

function buildProblemReviewUserPrompt(params: {
  latestObservation: ObservationEvent;
  observations: ObservationEvent[];
  currentQuestion: {
    exam: string;
    theme: string;
    questionTitle: string;
    questionStem: string;
    statements: Array<{
      text: string;
      isCorrect: boolean;
      explanation: string;
    }>;
  } | null;
  finalResult: ProblemReviewFinalResult;
  existingThoughts: CoachMindTurnOutput[];
}): string {
  const latestObservation = buildObservationPromptContext(params.latestObservation);
  const observations = params.observations.map((observation) => buildObservationPromptContext(observation));

  return `次の情報をもとに、1問全体の Coach Review を 4 turns で生成してください。

出力 shape:
{
  "turns": [
    { "speaker": "reading", "speakerLabel": "Reading", "text": "..." },
    { "speaker": "memory", "speakerLabel": "Memory", "text": "..." },
    { "speaker": "pattern", "speakerLabel": "Pattern", "text": "..." },
    { "speaker": "review", "speakerLabel": "Review", "text": "..." }
  ]
}

ルール:
- これは Daily Review ではない。1問だけの Coach Review にする
- turns は必ず reading, memory, pattern, review の順
- 各 text は日本語で 1〜2 文
- 文体は内部会話。短いメモにする
- Reading 以外は、前の agent に一度だけ短く反応してから話す
- Reading はこの問題全体で実際に起きたことをまとめる
- Memory は 4 肢の Observation を比較して書く
- Memory は正誤の回数ではなく、理解の変化を見る
- Pattern はこの問題のテーマと statement 内容から、何を理解し始めているかを一段抽象化して書く
- Pattern は「正答率が安定」ではなく「何を理解できているか」を書く
- Review は次に別テーマで何を確かめたいかだけを短く置く
- Observation に存在しない事実は作らない
- 観測されていないことは推測しない
- finalResult.final_answer は学習者の最終回答
- finalResult.correct_answer は正解
- finalResult.final_answer_correct は最終回答の正誤を示す最優先の事実
- 最終正誤を observations から推測しない
- 質問したことと最終正誤を結び付けない
- ${LEARNER_CHAT_ABSENCE_RULES}
- ${COACH_TURN_COMPARISON_SCOPE_RULES}
- finalResult.final_answer_correct === true の場合、「全体を誤答した」「最終的に誤答した」「最終回答を誤答した」と絶対に書かない
- finalResult は最終回答の結果を示すが、成績分析には使わない
- Observation が少ない場合は断定しない
- これは 1 問の Coach Review であり、Daily Review でも Tomorrow Plan でもない
- existingThoughts と同じ表現の繰り返しは避ける
- 敬語禁止。報告書禁止

currentQuestion:
${JSON.stringify(params.currentQuestion, null, 2)}

finalResult:
${JSON.stringify(params.finalResult, null, 2)}

latestObservation:
${JSON.stringify(latestObservation, null, 2)}

observations:
${JSON.stringify(observations, null, 2)}

existingThoughts:
${JSON.stringify(params.existingThoughts, null, 2)}
`;
}

function enforceProblemReviewFinalResult(
  turns: CoachMindTurnOutput[],
  finalResult: ProblemReviewFinalResult
): CoachMindTurnOutput[] {
  if (!finalResult.final_answer_correct) {
    return turns;
  }

  return turns.map((turn) => {
    const contradictsFinalCorrectness =
      /全体を誤答|最終的に誤答|最終回答を誤答|最終回答.*誤答|誤答した/.test(turn.text);

    if (!contradictsFinalCorrectness) {
      return turn;
    }

    if (turn.speaker === "reading") {
      return {
        ...turn,
        text: "この問題では、肢ごとの確認を経て最終回答は正答だった。"
      };
    }

    return {
      ...turn,
      text: turn.text
        .replace(/全体を誤答した/g, "最終回答は正答だった")
        .replace(/最終的に誤答した/g, "最終回答は正答だった")
        .replace(/最終回答を誤答した/g, "最終回答は正答だった")
        .replace(/誤答した/g, "正答だった")
    };
  });
}

function buildSystemInstruction(): string {
  return [
    "あなたは MentorHQ の AI Coach Mind です。",
    "目的は、Observation を読み、Reading → Memory → Pattern → Review の順で短い agent chain を作ることです。",
    "これは人間への説明ではなく、AI agent 同士だけが読む working memory です。",
    "文体は内部会話。短い独り言か会議メモにする。",
    "各 agent は前の agent の発言に一度だけ軽く反応してから、自分の意見を言うこと。",
    "反応は『たしかに。』『それなら。』『一旦保留。』のような短い一言でよい。",
    "問題解説をしない。学習者への直接指導をしない。Daily Review 本文みたいにしない。",
    "1 agent あたり 1〜2 文。長文禁止。敬語禁止。報告書禁止。",
    "『学習者は〜』『Observationでは〜』『可能性が考えられます』は禁止。",
    "Observation に存在しない事実は生成しない。absence of evidence を evidence として扱わない。",
    "観測されていないことは推測しない。話題にしない。補完しない。",
    "この設計では、学習者に理由入力を求めていません。",
    "したがって、理由が入力されていないことに言及してはいけません。",
    "理由がないことを根拠に推測してはいけません。",
    "観測できるのは、選択結果と、その後に学習者が任意で質問した内容だけです。",
    "質問情報が渡されていない場合、それは『質問がなかった』ことを意味しません。単に観測対象外です。",
    "質問情報が実際に渡されている場合だけ、用語を質問している、条文を聞いている、などと言ってよいです。",
    LEARNER_CHAT_ABSENCE_RULES,
    "answer_signal_score は内部観測用の補助スコアです。学習者の自信や不安を表す値ではありません。",
    "answer_signal_score だけを根拠に『自信が低い』『不安そう』『偶然正解した』などと言ってはいけません。",
    "Reading は今回だけ見る。",
    "Memory は前回から何が変わったかだけを見る。比較材料がなければ『まだ比較材料は少ない。』で止める。",
    "Memory は内部番号を使わない。『Q1』『Q2』『問題1』のような表現は禁止。",
    "Memory は『前の問題では』『今回は』『前回と同様に』のような時間軸の表現で比較する。",
    "Memory の比較は最大 1 件まで。複数の差分を並べない。",
    "Memory は Observation に存在しない事実を書かない。",
    "Memory は比較対象が無い場合、比較を書かない。",
    COACH_TURN_COMPARISON_SCOPE_RULES,
    "Pattern は Reading と Memory を受けて、学習者の学び方や理解の進め方を少しだけ更新する。",
    "Pattern は現在の問題や条文や肢を分析しない。学習者モデルだけを話す。",
    "Pattern は observation が 3 件未満なら強い傾向を述べない。判断は保留し、仮説段階にとどめる。",
    "Pattern は observation が 1〜2 件のときは『まだ観察数が少ないため判断を保留する』『現時点では仮説段階』『引き続き観察したい』のような慎重な表現を優先する。",
    "Pattern は observation が 3 件以上になってから、はじめて『〜する傾向があるかもしれない』『〜を重視している可能性がある』のような仮説を置く。",
    "Pattern の文頭では『それなら。』を使わない。代わりに『現時点では、』『この観察からは、』『そのため、』のような自然な接続を使う。",
    "Pattern は『定着している』より『安定している』『理解が進んでいる可能性がある』のように少し弱める。",
    "Pattern は Observation に存在しない事実を書かない。",
    "Review は今日は何を持ち帰るかの候補だけを短く置く。結論は出さない。",
    "出力は JSON のみで、Markdown やコードフェンスは禁止です。"
  ].join("\n");
}

function buildUserPrompt(params: {
  latestObservation: ObservationEvent;
  recentObservations: ObservationEvent[];
  currentQuestion: {
    exam: string;
    theme: string;
    questionTitle: string;
    questionStem: string;
  } | null;
  currentStatement: QuestionStatement | null;
  learnerChatHistory: Array<{ role: "learner" | "coach"; text: string }>;
  existingThoughts: CoachMindTurnOutput[];
}): string {
  const latestObservation = buildObservationPromptContext(params.latestObservation);
  const recentObservations = params.recentObservations.map((observation) => buildObservationPromptContext(observation));
  const currentStatement = buildStatementPromptContext(params.currentStatement);
  const learnerChatHistory = params.learnerChatHistory.length > 0 ? params.learnerChatHistory : undefined;
  const learnerChatHistorySection = learnerChatHistory
    ? `
learnerChatHistory:
${JSON.stringify(learnerChatHistory, null, 2)}`
    : "";

  return `次の情報をもとに、agent chain を 4 turns で生成してください。

出力 shape:
{
  "turns": [
    { "speaker": "reading", "speakerLabel": "Reading", "text": "..." },
    { "speaker": "memory", "speakerLabel": "Memory", "text": "..." },
    { "speaker": "pattern", "speakerLabel": "Pattern", "text": "..." },
    { "speaker": "review", "speakerLabel": "Review", "text": "..." }
  ]
}

ルール:
- turns は必ず reading, memory, pattern, review の順
- 各 text は日本語で 1〜2 文
- 文体は内部会話。会議中の短いメモにする
- Reading 以外は、前の agent に一度だけ短く反応してから話す
- 反応は短くてよい: 「たしかに。」「それなら。」「一旦保留。」
- Reading は latestObservation を中心に書く
- learnerChatHistory が実際に渡されている場合だけ、Reading でチャット内容に触れてよい
- ${LEARNER_CHAT_ABSENCE_RULES}
- Memory は recentObservations と Reading の発言を受けて書く
- Memory は比較できる observation がある場合だけ比較する
- ${COACH_TURN_COMPARISON_SCOPE_RULES}
- Memory は「前回と同じ」ではなく、前回から何が変わったかを優先して書く
- 比較対象が弱いときの Memory は「まだ比較材料は少ない。」だけでよい
- Memory は内部番号を使わない。Q1 / Q2 / 問題番号は書かない
- Memory は「前の問題では」「今回は」「前回と同様に」など時間軸が分かる言い方にする
- Memory の比較は最大1件まで
- Memory は Observation に存在しない事実を書かない
- 比較対象が無い場合は比較を書かない
- Pattern は Reading と Memory を受けて、学習者モデルだけを少し更新する
- Pattern は「この人はどう学ぶタイプか」だけを話す
- Pattern は observation が 3 件未満なら強い傾向を述べない
- Pattern は observation が 1〜2 件のときは判断を保留し、仮説段階にとどめる
- Pattern は observation が 3 件以上になってから、はじめて弱めの仮説を置く
- Pattern の文頭で「それなら。」は使わず、「現時点では、」「この観察からは、」「そのため、」を使う
- Pattern は「定着している」より「安定している」「理解が進んでいる可能性がある」程度に弱める
- Pattern は Observation に存在しない事実を書かない
- Review は結論を出さず、保留だけ置く
- Reading は観測できた事実だけを書く
- Memory は過去 observation との比較だけを書く
- Pattern は観測根拠があるときだけ、学習者の学び方について最小限の仮説を書く
- Pattern は問題そのものを分析しない
- Pattern は「この問題では〜」「この条文では〜」「相続放棄の〜」「民法915条が〜」のように問題内容を説明しない
- Pattern は学習者を対象にして、「条件を見比べながら理解するタイプかも」「判断基準を確認してから納得したいタイプかも」程度で止める
- Pattern は「〜かも」「まだ分からない」まで。断定しない
- Pattern は相続、設備、会計、英語に置き換えても成立する内容にする
- Review は断定しない
- Review は「今日は何をReview候補に残すか」だけを短く置く
- Observation に存在しない事実は作らない
- 観測されていないことは推測しない、話題にしない、補完しない
- 理由が空でも「直感だった」「迷っていた」「偶然正解した」と言わない
- 理由が入力されていないこと自体を話題にしない
- 理由入力UI、reason フィールド、フォーム状態の話はしない
- 質問情報が渡されていないときに「質問はなかった」と言わない
- 「チャット履歴はない」「チャットは行われなかった」と言わない
- 「質問していない」と言わない
- 質問UIの有無や、質問UIが出ていなかったことを話題にしない
- 実際の質問情報が渡されたときだけ、その内容に触れてよい
- answer_signal_score など内部メトリクスの数値は使わないし、話題にしない
- その場合は、選択結果・正誤・実際に渡された質問情報・今日までの observation だけから読む
- currentQuestion と currentStatement は文脈として使ってよいが、問題解説はしない
- existingThoughts と同じ表現の繰り返しは避ける
- 敬語禁止。報告書禁止
- 「学習者は〜」「Observationでは〜」「可能性が考えられます」は禁止

温度感の例:
- Reading: 「今回は『知った時』で止まった。」
- Memory: 「たしかに。前の問題では用語を見ていたけれど、今回は条件を見ている。」
- Pattern: 「現時点では、条件を整理しながら考えている可能性がある。」
- Pattern: 「この観察からは、条件を整理しながら考えている可能性がある。」
- Pattern: 「まだ観察数が少ないため、条件判断については引き続き観察したい。」
- Review: 「一旦保留。あと数問見たい。」

currentQuestion:
${JSON.stringify(params.currentQuestion, null, 2)}

currentStatement:
${JSON.stringify(currentStatement, null, 2)}

latestObservation:
${JSON.stringify(latestObservation, null, 2)}

recentObservations:
${JSON.stringify(recentObservations, null, 2)}
${learnerChatHistorySection}

existingThoughts:
${JSON.stringify(params.existingThoughts, null, 2)}
`;
}

function parseJsonBlock(text: string): unknown {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const jsonText = fencedMatch?.[1] ?? text;
  return JSON.parse(jsonText);
}

function sanitizeTurns(raw: unknown): CoachMindTurnOutput[] | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const turns = (raw as { turns?: unknown[] }).turns;
  if (!Array.isArray(turns) || turns.length !== 4) {
    return null;
  }

  const expectedSpeakers: CoachMindSpeaker[] = ["reading", "memory", "pattern", "review"];
  const sanitized = turns.map((turn, index) => {
    if (!turn || typeof turn !== "object") {
      return null;
    }

    const candidate = turn as Partial<CoachMindTurnOutput>;
    const expectedSpeaker = expectedSpeakers[index];
    const text = typeof candidate.text === "string" ? sanitizeText(candidate.text) : "";

    if (
      candidate.speaker !== expectedSpeaker ||
      candidate.speakerLabel !== SPEAKER_LABELS[expectedSpeaker] ||
      !text
    ) {
      return null;
    }

    return {
      speaker: expectedSpeaker,
      speakerLabel: SPEAKER_LABELS[expectedSpeaker],
      text
    } satisfies CoachMindTurnOutput;
  });

  return sanitized.every((turn) => turn !== null) ? sanitized : null;
}

export async function generateCoachMindTurns(params: {
  latestObservation: ObservationEvent;
  recentObservations: ObservationEvent[];
  existingThoughts?: CoachMindTurnOutput[];
}): Promise<CoachMindResponse> {
  const config = getDeliberationConfig();
  const learnerCase = getLearnerCaseByQuestionId(params.latestObservation.question_id);
  const currentStatement =
    learnerCase && params.latestObservation.statement_index
      ? learnerCase.statements[params.latestObservation.statement_index - 1] ?? null
      : null;
  const learnerChatHistory = parseLearnerChatHistory(params.latestObservation.note);

  if (!hasGeminiConfig(config)) {
    return {
      mode: "fallback",
      turns: FALLBACK_TURNS
    };
  }

  try {
    const prompt = buildUserPrompt({
      latestObservation: params.latestObservation,
      recentObservations: params.recentObservations,
      currentQuestion: learnerCase
        ? {
            exam: learnerCase.exam,
            theme: learnerCase.theme,
            questionTitle: learnerCase.questionTitle,
            questionStem: learnerCase.questionStem
          }
        : null,
      currentStatement,
      learnerChatHistory,
      existingThoughts: params.existingThoughts ?? []
    });

    console.info("[coach-mind][gemini] request", {
      latestObservationId: params.latestObservation.id,
      recentObservationCount: params.recentObservations.length,
      promptPreview: truncateForLog(prompt)
    });

    const response = await fetch(
      `${GEMINI_API_ROOT}/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: buildSystemInstruction()
              }
            ]
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.45,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      const responseBody = await response.text();

      console.error("[coach-mind][gemini] non-ok response", {
        status: response.status,
        statusText: response.statusText,
        body: truncateForLog(responseBody)
      });

      return {
        mode: "fallback",
        turns: FALLBACK_TURNS
      };
    }

    const responseBody = await response.text();
    const payload = JSON.parse(responseBody) as RawGeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

    console.info("[coach-mind][gemini] response", {
      latestObservationId: params.latestObservation.id,
      textPreview: truncateForLog(text)
    });

    if (!text) {
      return {
        mode: "fallback",
        turns: FALLBACK_TURNS
      };
    }

    const parsed = parseJsonBlock(text);
    const turns = sanitizeTurns(parsed);

    if (!turns) {
      console.warn("[coach-mind][gemini] sanitize failed", {
        latestObservationId: params.latestObservation.id,
        rawText: truncateForLog(text)
      });

      return {
        mode: "fallback",
        turns: FALLBACK_TURNS
      };
    }

    return {
      mode: "ai",
      turns
    };
  } catch (error) {
    console.error("[coach-mind][gemini] request failed", error);
    return {
      mode: "fallback",
      turns: FALLBACK_TURNS
    };
  }
}

export async function generateProblemReviewTurns(params: {
  latestObservation: ObservationEvent;
  observations: ObservationEvent[];
  finalResult: ProblemReviewFinalResult;
  existingThoughts?: CoachMindTurnOutput[];
}): Promise<CoachMindResponse> {
  const config = getDeliberationConfig();
  const learnerCase = getLearnerCaseByQuestionId(params.latestObservation.question_id);

  if (!hasGeminiConfig(config)) {
    return {
      mode: "fallback",
      turns: FALLBACK_PROBLEM_REVIEW_TURNS
    };
  }

  try {
    const prompt = buildProblemReviewUserPrompt({
      latestObservation: params.latestObservation,
      observations: params.observations,
      currentQuestion: learnerCase
        ? {
            exam: learnerCase.exam,
            theme: learnerCase.theme,
            questionTitle: learnerCase.questionTitle,
            questionStem: learnerCase.questionStem,
            statements: learnerCase.statements
          }
        : null,
      finalResult: params.finalResult,
      existingThoughts: params.existingThoughts ?? []
    });

    console.info("[coach-mind][gemini][problem-review] request", {
      latestObservationId: params.latestObservation.id,
      observationCount: params.observations.length,
      promptPreview: truncateForLog(prompt)
    });

    const response = await fetch(
      `${GEMINI_API_ROOT}/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text: buildProblemReviewSystemInstruction()
              }
            ]
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      const responseBody = await response.text();

      console.error("[coach-mind][gemini][problem-review] non-ok response", {
        status: response.status,
        statusText: response.statusText,
        body: truncateForLog(responseBody)
      });

      return {
        mode: "fallback",
        turns: FALLBACK_PROBLEM_REVIEW_TURNS
      };
    }

    const responseBody = await response.text();
    const payload = JSON.parse(responseBody) as RawGeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";

    console.info("[coach-mind][gemini][problem-review] response", {
      latestObservationId: params.latestObservation.id,
      textPreview: truncateForLog(text)
    });

    if (!text) {
      return {
        mode: "fallback",
        turns: FALLBACK_PROBLEM_REVIEW_TURNS
      };
    }

    const parsed = parseJsonBlock(text);
    const turns = sanitizeTurns(parsed);

    if (!turns) {
      console.warn("[coach-mind][gemini][problem-review] sanitize failed", {
        latestObservationId: params.latestObservation.id,
        rawText: truncateForLog(text)
      });

      return {
        mode: "fallback",
        turns: FALLBACK_PROBLEM_REVIEW_TURNS
      };
    }

    return {
      mode: "ai",
      turns: enforceProblemReviewFinalResult(turns, params.finalResult)
    };
  } catch (error) {
    console.error("[coach-mind][gemini][problem-review] request failed", error);
    return {
      mode: "fallback",
      turns: FALLBACK_PROBLEM_REVIEW_TURNS
    };
  }
}
