import { NextResponse } from "next/server";

import { getLearnerCaseByQuestionId } from "@/lib/deliberation/mock";
import {
  generateTomorrowPlanForSession,
  getDailyReviewForSession,
  getDailySessionById,
  getObservationEventsForDailySession,
  getTomorrowPlanForSession
} from "@/lib/deliberation/session-memory";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { sessionId?: string };

  if (!body.sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const currentSession = await getDailySessionById(body.sessionId);
  if (!currentSession) {
    return NextResponse.json({ error: "Daily session not found" }, { status: 404 });
  }

  const dailyReview = await getDailyReviewForSession(body.sessionId);
  if (
    currentSession.status !== "completed" ||
    currentSession.review_status !== "generated" ||
    !dailyReview
  ) {
    return NextResponse.json(
      { error: "Tomorrow Plan is available only after Daily Review generation" },
      { status: 400 }
    );
  }

  const result = await generateTomorrowPlanForSession({ sessionId: body.sessionId });
  if (!result) {
    return NextResponse.json({ error: "Failed to generate tomorrow plan" }, { status: 500 });
  }

  const currentQuestionId =
    result.session.status === "completed" ? null : result.session.question_ids[result.session.current_index] ?? null;
  const learnerCase = currentQuestionId ? getLearnerCaseByQuestionId(currentQuestionId) : null;
  const observations = await getObservationEventsForDailySession(result.session.id);
  const tomorrowPlan = (await getTomorrowPlanForSession(result.session.id)) ?? result.plan;

  return NextResponse.json({
    session: result.session,
    learnerCase,
    currentQuestionId,
    totalQuestions: result.session.question_ids.length,
    observations,
    latestObservation: observations.at(-1) ?? null,
    dailyReview,
    tomorrowPlan
  });
}
