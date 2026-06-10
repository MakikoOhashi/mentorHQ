import type { DeliberationResponse, LearnerCase } from "@/lib/deliberation/types";

import { AGENTS } from "@/lib/deliberation/agents";
import { buildMockDeliberationResponse } from "@/lib/deliberation/mock";

const OPENAI_URL = "https://api.openai.com/v1/responses";

export async function generateDeliberation(learnerCase: LearnerCase): Promise<DeliberationResponse> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return buildMockDeliberationResponse();
  }

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: `You are generating a MentorHQ agent deliberation artifact.

Return only valid JSON with this shape:
{
  "mode": "ai",
  "deliberation_events": [
    {
      "round": 1,
      "speaker": "misconception",
      "type": "observation",
      "message": "...",
      "hypothesis": "...",
      "confidence": 0.84,
      "influenced_by": [],
      "recommendation": "..."
    }
  ],
  "coach_decision": {
    "selected_intervention": "starting_point_check",
    "reason": "...",
    "next_question": "..."
  }
}

Constraints:
- Use exactly four agents: misconception, memory, load, coach.
- Round 1 contains initial observations from misconception, memory, and load.
- Round 2 contains revisions that clearly cite influenced_by.
- Round 3 narrows intervention candidates.
- Round 4 is only the coach decision.
- Coach does not use majority vote; coach gives a reasoned decision.
- Keep text concise but specific.
- Ensure confidence is between 0 and 1.

Agent definitions:
${JSON.stringify(AGENTS, null, 2)}`
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify(learnerCase, null, 2)
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      return buildMockDeliberationResponse();
    }

    const payload = (await response.json()) as {
      output?: Array<{
        content?: Array<{
          text?: string;
        }>;
      }>;
    };

    const text = payload.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("") ?? "";

    if (!text) {
      return buildMockDeliberationResponse();
    }

    return JSON.parse(text) as DeliberationResponse;
  } catch {
    return buildMockDeliberationResponse();
  }
}
