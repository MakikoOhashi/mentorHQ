import { NextResponse } from "next/server";

import { getLearnerCaseByQuestionId } from "@/lib/deliberation/mock";
import {
  generateDailyReviewForSession,
  getDailyReviewForSession,
  getDailySessionById,
  getObservationEventsForDailySession
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

  if (currentSession.status !== "completed") {
    return NextResponse.json({ error: "Daily review is available only after completion" }, { status: 400 });
  }

  const result = await generateDailyReviewForSession({ sessionId: body.sessionId });
  if (!result) {
    return NextResponse.json({ error: "Failed to generate daily review" }, { status: 500 });
  }

  const currentQuestionId =
    result.session.status === "completed" ? null : result.session.question_ids[result.session.current_index] ?? null;
  const learnerCase = currentQuestionId ? getLearnerCaseByQuestionId(currentQuestionId) : null;
  const observations = await getObservationEventsForDailySession(result.session.id);
  const dailyReview = (await getDailyReviewForSession(result.session.id)) ?? result.review;

  return NextResponse.json({
    session: result.session,
    learnerCase,
    currentQuestionId,
    totalQuestions: result.session.question_ids.length,
    observations,
    latestObservation: observations.at(-1) ?? null,
    dailyReview
  });
}
