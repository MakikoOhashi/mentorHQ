import { NextResponse } from "next/server";

import { getLearnerCaseByQuestionId } from "@/lib/deliberation/mock";
import {
  getDailyReviewForSession,
  getLatestDailySession,
  getObservationEventsForDailySession,
  getTomorrowPlanForSession
} from "@/lib/deliberation/session-memory";

export const runtime = "nodejs";

export async function GET() {
  const session = await getLatestDailySession();

  if (!session) {
    return NextResponse.json({ session: null });
  }

  const currentQuestionId =
    session.status === "completed" ? null : session.question_ids[session.current_index] ?? null;
  const learnerCase = currentQuestionId ? getLearnerCaseByQuestionId(currentQuestionId) : null;
  const observations = await getObservationEventsForDailySession(session.id);
  const dailyReview = await getDailyReviewForSession(session.id);
  const tomorrowPlan = await getTomorrowPlanForSession(session.id);

  return NextResponse.json({
    session,
    learnerCase,
    currentQuestionId,
    totalQuestions: session.question_ids.length,
    observations,
    latestObservation: observations.at(-1) ?? null,
    dailyReview,
    tomorrowPlan
  });
}
