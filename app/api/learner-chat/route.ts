import { NextResponse } from "next/server";

import { getDeliberationConfig, hasGeminiConfig } from "@/lib/deliberation/config";
import type { QuestionStatement } from "@/lib/deliberation/types";

export const runtime = "nodejs";

type LearnerChatMessage = {
  role: "learner" | "coach";
  text: string;
};

type LearnerChatRequest = {
  currentQuestion?: {
    exam?: string;
    theme?: string;
    questionTitle?: string;
    questionStem?: string;
    statements?: QuestionStatement[];
  };
  currentStatement?: QuestionStatement;
  statementExplanation?: string;
  learnerMessage?: string;
  chatHistory?: LearnerChatMessage[];
};

type RawGeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";
const FALLBACK_REPLY = "すみません、今はうまく答えられません。ポイントは上の解説を確認してください。";

function truncateForLog(value: string, maxLength = 1000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…[truncated]` : value;
}

function sanitizeReply(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

function buildSystemInstruction(): string {
  return [
    "あなたは Learner App で現在の問題を一緒に見ている講師です。",
    "役割は『問題解説AI』ではなく、『今表示されている問題を知っている講師』です。",
    "学習者の最新の質問に、まず直接答えてください。",
    "現在の問題文・肢・解説は文脈として使ってよいですが、質問に答えず解説文を繰り返してはいけません。",
    "statementExplanation をそのまま再掲してはいけません。必要なら要点を言い換えて短く使ってください。",
    "質問が用語の意味なら定義を短く答える。質問が条文なら条文番号を答える。質問が制度なら制度の条件を答える。",
    "この問題と関係する範囲で正確に答え、知らないことは断定しないでください。",
    "会話を勝手に終了しないでください。『次へ進みましょう』などの締めは禁止です。",
    "回答は日本語で、2〜4文程度を基本に簡潔にしてください。"
  ].join("\n");
}

function buildUserPrompt(body: Required<Pick<LearnerChatRequest, "currentQuestion" | "currentStatement" | "statementExplanation" | "learnerMessage">> & {
  chatHistory: LearnerChatMessage[];
}): string {
  return [
    "以下は現在の問題コンテキストです。",
    `currentQuestion: ${JSON.stringify(body.currentQuestion, null, 2)}`,
    `currentStatement: ${JSON.stringify(body.currentStatement, null, 2)}`,
    `statementExplanation: ${body.statementExplanation}`,
    `chatHistory: ${JSON.stringify(body.chatHistory, null, 2)}`,
    `student question: ${body.learnerMessage}`,
    "",
    "student question に最優先で答えてください。",
    "質問に直接答えたうえで、この問題で必要なら補足を1つだけ加えてください。",
    "statementExplanation の丸写しは禁止です。"
  ].join("\n");
}

export async function POST(request: Request) {
  const body = (await request.json()) as LearnerChatRequest;

  if (
    !body.currentQuestion ||
    !body.currentStatement ||
    !body.statementExplanation ||
    !body.learnerMessage
  ) {
    return NextResponse.json({ error: "currentQuestion, currentStatement, statementExplanation, learnerMessage are required" }, { status: 400 });
  }

  const config = getDeliberationConfig();

  if (!hasGeminiConfig(config)) {
    return NextResponse.json({ reply: FALLBACK_REPLY, mode: "fallback" });
  }

  try {
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
                  text: buildUserPrompt({
                    currentQuestion: body.currentQuestion,
                    currentStatement: body.currentStatement,
                    statementExplanation: body.statementExplanation,
                    learnerMessage: body.learnerMessage,
                    chatHistory: body.chatHistory ?? []
                  })
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.3
          }
        })
      }
    );

    if (!response.ok) {
      const responseBody = await response.text();

      console.error("[learner-chat][gemini] non-ok response", {
        status: response.status,
        statusText: response.statusText,
        body: truncateForLog(responseBody)
      });

      return NextResponse.json({ reply: FALLBACK_REPLY, mode: "fallback" });
    }

    const responseBody = await response.text();
    const payload = JSON.parse(responseBody) as RawGeminiResponse;
    const reply = sanitizeReply(
      payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? ""
    );

    if (!reply) {
      console.error("[learner-chat][gemini] empty reply", {
        body: truncateForLog(responseBody)
      });

      return NextResponse.json({ reply: FALLBACK_REPLY, mode: "fallback" });
    }

    return NextResponse.json({ reply, mode: "ai" });
  } catch (error) {
    console.error("[learner-chat][gemini] request failed", error);
    return NextResponse.json({ reply: FALLBACK_REPLY, mode: "fallback" });
  }
}
