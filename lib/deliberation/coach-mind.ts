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
  learner_reason: string | null;
  reasoning_style: typeof observation.reasoning_style;
  misunderstanding_type: typeof observation.misunderstanding_type;
  observation_note: string;
  learner_note: string;
} {
  return {
    question_id: observation.question_id,
    statement_index: observation.statement_index,
    learner_choice: observation.learner_choice,
    correct_or_wrong: observation.correct_or_wrong,
    learner_reason: observation.learner_reason,
    reasoning_style: observation.reasoning_style,
    misunderstanding_type: observation.misunderstanding_type,
    observation_note: observation.observation_note,
    learner_note: observation.note
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
    "answer_signal_score は内部観測用の補助スコアです。学習者の自信や不安を表す値ではありません。",
    "answer_signal_score だけを根拠に『自信が低い』『不安そう』『偶然正解した』などと言ってはいけません。",
    "Reading は今回だけ見る。",
    "Memory は今日の流れと比べる。",
    "Pattern は Reading と Memory を受けて仮説を少しだけ更新する。",
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
- Reading は latestObservation と learnerChatHistory を中心に書く
- Memory は recentObservations と Reading の発言を受けて書く
- Pattern は Reading と Memory を受けて仮説を少しだけ更新する
- Review は結論を出さず、保留だけ置く
- Reading は観測できた事実だけを書く
- Memory は過去 observation との比較だけを書く
- Pattern は観測根拠があるときだけ最小限の仮説を書く
- Review は断定しない
- learner_reason が空でも、理由が無かったと決めつけない
- 理由入力UIの有無、フォーム状態、ボタン状態など UI 実装の話はしない
- answer_signal_score など内部メトリクスの数値は使わないし、話題にしない
- その場合は、選択結果・正誤・質問有無・今日までの observation だけから読む
- currentQuestion と currentStatement は文脈として使ってよいが、問題解説はしない
- existingThoughts と同じ表現の繰り返しは避ける
- 敬語禁止。報告書禁止
- 「学習者は〜」「Observationでは〜」「可能性が考えられます」は禁止

温度感の例:
- Reading: 「今回は『知った時』で止まった。」
- Memory: 「たしかに。前は数字だった。」
- Pattern: 「それなら用語で引っ掛かってるだけかも。」
- Review: 「一旦保留。あと2問見たい。」

currentQuestion:
${JSON.stringify(params.currentQuestion, null, 2)}

currentStatement:
${JSON.stringify(params.currentStatement, null, 2)}

latestObservation:
${JSON.stringify(latestObservation, null, 2)}

recentObservations:
${JSON.stringify(recentObservations, null, 2)}

learnerChatHistory:
${JSON.stringify(params.learnerChatHistory, null, 2)}

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
