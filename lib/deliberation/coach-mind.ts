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
  { speaker: "pattern", speakerLabel: "Pattern", text: "それなら傾向は保留。" },
  { speaker: "review", speakerLabel: "Review", text: "一旦保留。Review候補。" }
];

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
    "answer_signal_score は内部観測用の補助スコアです。学習者の自信や不安を表す値ではありません。",
    "answer_signal_score だけを根拠に『自信が低い』『不安そう』『偶然正解した』などと言ってはいけません。",
    "Reading は今回だけ見る。",
    "Memory は今日の流れと比べる。",
    "Pattern は Reading と Memory を受けて、学習者の学び方や理解の進め方を少しだけ更新する。",
    "Review は結論を出さず、保留だけ置く。",
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
- Memory は recentObservations と Reading の発言を受けて書く
- Memory は比較できる observation がある場合だけ比較する
- Memory は実際に渡されたチャット情報がある observation 同士だけでチャット比較をしてよい
- Pattern は Reading と Memory を受けて、学習者モデルだけを少し更新する
- Review は結論を出さず、保留だけ置く
- Reading は観測できた事実だけを書く
- Memory は過去 observation との比較だけを書く
- Pattern は観測根拠があるときだけ、学習者の学び方について最小限の仮説を書く
- Pattern は問題そのものを分析しない
- Pattern は「この問題では〜」「この条文では〜」「相続放棄の〜」のように問題内容を説明しない
- Pattern は学習者を対象にして、「条件を見比べながら理解するタイプかも」「質問しながら理解を進めるタイプかも」程度で止める
- Pattern は「〜かも」「まだ分からない」まで。断定しない
- Review は断定しない
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
- Memory: 「たしかに。前は数字だった。」
- Pattern: 「それなら質問しながら理解するタイプかも。」
- Review: 「一旦保留。あと2問見たい。」

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
