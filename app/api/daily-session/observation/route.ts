import { NextResponse } from "next/server";

import { getLearnerCaseByQuestionId } from "@/lib/deliberation/mock";
import {
  getDailyReviewForSession,
  getDailySessionById,
  getObservationEventsForDailySession,
  getTomorrowPlanForSession,
  recordObservationEvent
} from "@/lib/deliberation/session-memory";
import type { ObservationEventInput } from "@/lib/deliberation/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    sessionId?: string;
    observation?: ObservationEventInput;
  };

  if (!body.sessionId || !body.observation) {
    return NextResponse.json({ error: "sessionId and observation are required" }, { status: 400 });
  }

  const session = await getDailySessionById(body.sessionId);
  if (!session) {
    return NextResponse.json({ error: "Failed to find daily session" }, { status: 404 });
  }

  const savedObservation = await recordObservationEvent(body.observation);
  if (!savedObservation) {
    return NextResponse.json({ error: "Failed to record observation" }, { status: 500 });
  }

  const currentQuestionId =
    session.status === "completed" ? null : session.question_ids[session.current_index] ?? null;
  const learnerCase = currentQuestionId ? getLearnerCaseByQuestionId(currentQuestionId) : null;
  const observations = await getObservationEventsForDailySession(session.id);
  const dailyReview = await getDailyReviewForSession(session.id);
  const tomorrowPlan = await getTomorrowPlanForSession(session.id);

  return NextResponse.json({
    session: {
      ...session,
      observation_count: observations.length
    },
    learnerCase,
    currentQuestionId,
    totalQuestions: session.question_ids.length,
    observations,
    latestObservation: observations.at(-1) ?? null,
    dailyReview,
    tomorrowPlan
  });
}
