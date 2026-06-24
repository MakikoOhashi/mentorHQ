import { NextResponse } from "next/server";

import { getLearnerCaseByQuestionId } from "@/lib/deliberation/mock";
import { advanceDailySession } from "@/lib/deliberation/session-memory";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { sessionId?: string };

  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const session = await advanceDailySession({ sessionId: body.sessionId });

  if (!session) {
    return NextResponse.json({ error: "Failed to advance daily session" }, { status: 500 });
  }

  const currentQuestionId =
    session.status === "completed" ? null : session.question_ids[session.current_index] ?? null;
  const learnerCase = currentQuestionId ? getLearnerCaseByQuestionId(currentQuestionId) : null;

  return NextResponse.json({
    session,
    learnerCase,
    currentQuestionId,
    totalQuestions: session.question_ids.length
  });
}
