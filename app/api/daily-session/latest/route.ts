import { NextResponse } from "next/server";

import { getLearnerCaseByQuestionId } from "@/lib/deliberation/mock";
import { getLatestDailySession } from "@/lib/deliberation/session-memory";

export const runtime = "nodejs";

export async function GET() {
  const session = await getLatestDailySession();

  if (!session) {
    return NextResponse.json({ session: null });
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
