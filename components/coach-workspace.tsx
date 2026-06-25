"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { buildObservationInput } from "@/lib/deliberation/observation";
import type {
  CoachDecision,
  DailyReview,
  DailySession,
  DeliberationEvent,
  DeliberationResponse,
  LearnerCase,
  ObservationEvent,
  TomorrowPlan
} from "@/lib/deliberation/types";

type CoachWorkspaceProps = {
  initialCase: LearnerCase;
};

type DailySessionPayload = {
  session: DailySession;
  learnerCase: LearnerCase | null;
  currentQuestionId: string | null;
  totalQuestions: number;
  observations: ObservationEvent[];
  latestObservation: ObservationEvent | null;
  dailyReview: DailyReview | null;
  tomorrowPlan: TomorrowPlan | null;
};

type LearnerStep =
  | "morning"
  | "question-1"
  | "question-2"
  | "question-3"
  | "review"
  | "tomorrow"
  | "goodbye";

const STEP_ORDER: LearnerStep[] = [
  "morning",
  "question-1",
  "question-2",
  "question-3",
  "review",
  "tomorrow",
  "goodbye"
];

const STEP_LABELS: Record<LearnerStep, string> = {
  morning: "Morning Brief",
  "question-1": "Question 1",
  "question-2": "Question 2",
  "question-3": "Question 3",
  review: "Daily Coach Review",
  tomorrow: "Tomorrow Plan",
  goodbye: "Goodbye"
};

const EVENT_DURATIONS: Record<DeliberationEvent["type"], number> = {
  observation: 1500,
  challenge: 2000,
  revision: 2500,
  recommendation: 2000,
  coach_decision: 3000
};

function getObservationIcon(observation: ObservationEvent) {
  if (observation.intervention_type === "starting_point_check") return "🧠";
  if (observation.intervention_type === "contrast_check") return "🔁";
  if (observation.intervention_type === "integrated_retry") return "💭";
  return "📌";
}

function getCumulativeEventDelay(events: DeliberationEvent[], index: number) {
  let total = 350;

  for (let currentIndex = 0; currentIndex <= index; currentIndex += 1) {
    total += EVENT_DURATIONS[events[currentIndex].type];
  }

  return total;
}

function getCurrentStep(session: DailySession | null, tomorrowPlan: TomorrowPlan | null): LearnerStep {
  if (!session) {
    return "morning";
  }

  if (tomorrowPlan || session.tomorrow_plan_status === "generated") {
    return "goodbye";
  }

  if (session.review_status === "generated") {
    return "tomorrow";
  }

  if (session.status === "completed") {
    return "review";
  }

  const questionStep = session.current_index + 1;
  if (questionStep <= 1) return "question-1";
  if (questionStep === 2) return "question-2";
  return "question-3";
}

function formatObservationTime(createdAt: string | null, index: number) {
  if (createdAt) {
    const date = new Date(createdAt);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(date);
    }
  }

  return `09:${String(index * 2 + 1).padStart(2, "0")}`;
}

export function CoachWorkspace({ initialCase }: CoachWorkspaceProps) {
  const [learnerCase, setLearnerCase] = useState(initialCase);
  const [dailySession, setDailySession] = useState<DailySession | null>(null);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [observations, setObservations] = useState<ObservationEvent[]>([]);
  const [latestObservation, setLatestObservation] = useState<ObservationEvent | null>(null);
  const [dailyReview, setDailyReview] = useState<DailyReview | null>(null);
  const [tomorrowPlan, setTomorrowPlan] = useState<TomorrowPlan | null>(null);
  const [sessionStatusMessage, setSessionStatusMessage] = useState<string>("開始前です。");
  const [events, setEvents] = useState<DeliberationEvent[]>([]);
  const [decision, setDecision] = useState<CoachDecision | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "streaming" | "done" | "error">("idle");
  const [sessionActionStatus, setSessionActionStatus] = useState<"idle" | "starting" | "advancing">("idle");
  const [reviewActionStatus, setReviewActionStatus] = useState<"idle" | "generating">("idle");
  const [planActionStatus, setPlanActionStatus] = useState<"idle" | "generating">("idle");
  const [learnerStepOverride, setLearnerStepOverride] = useState<LearnerStep | null>(null);
  const [mode, setMode] = useState<"mock" | "ai">("mock");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);

  const clearScheduledUpdates = useCallback(() => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current = [];
  }, []);

  const runDeliberation = useCallback(async (targetCase?: LearnerCase) => {
    clearScheduledUpdates();
    setStatus("loading");
    setEvents([]);
    setDecision(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/deliberate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ learnerCase: targetCase ?? learnerCase })
      });

      if (!response.ok) {
        throw new Error("Deliberation request failed.");
      }

      const payload = (await response.json()) as DeliberationResponse;
      setMode(payload.mode);

      if (payload.deliberation_events.length === 0) {
        setDecision(payload.coach_decision);
        setStatus("done");
        return;
      }

      setStatus("streaming");

      payload.deliberation_events.forEach((event, index) => {
        const timeoutId = window.setTimeout(() => {
          setEvents((current) => [...current, event]);

          if (index === payload.deliberation_events.length - 1) {
            const decisionTimeoutId = window.setTimeout(() => {
              setDecision(payload.coach_decision);
              setStatus("done");
            }, 220);
            timeoutIdsRef.current.push(decisionTimeoutId);
          }
        }, getCumulativeEventDelay(payload.deliberation_events, index));
        timeoutIdsRef.current.push(timeoutId);
      });
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    }
  }, [clearScheduledUpdates, learnerCase]);

  useEffect(() => () => {
    clearScheduledUpdates();
  }, [clearScheduledUpdates]);

  const applyDailySessionPayload = useCallback(
    (payload: DailySessionPayload) => {
      setDailySession(payload.session);
      setCurrentQuestionId(payload.currentQuestionId);
      setObservations(payload.observations);
      setLatestObservation(payload.latestObservation);
      setDailyReview(payload.dailyReview);
      setTomorrowPlan(payload.tomorrowPlan);
      setSessionStatusMessage(
        payload.session.status === "completed"
          ? "今日の3問セッションは完了しました。"
          : "今日の固定3問セッションを進行中です。"
      );

      if (payload.learnerCase) {
        setLearnerCase(payload.learnerCase);
      }

      if (payload.session.status === "completed") {
        clearScheduledUpdates();
        setEvents([]);
        setDecision(null);
        setStatus("idle");
        setErrorMessage(null);
      }
    },
    [clearScheduledUpdates]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadLatestSession() {
      try {
        const response = await fetch("/api/daily-session/latest");
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { session: DailySession | null } & Partial<DailySessionPayload>;
        if (!payload.session || cancelled) {
          return;
        }

        applyDailySessionPayload({
          session: payload.session,
          learnerCase: payload.learnerCase ?? null,
          currentQuestionId: payload.currentQuestionId ?? null,
          totalQuestions: payload.totalQuestions ?? payload.session.question_ids.length,
          observations: payload.observations ?? [],
          latestObservation: payload.latestObservation ?? null,
          dailyReview: payload.dailyReview ?? null,
          tomorrowPlan: payload.tomorrowPlan ?? null
        });
      } catch {
        // hydrate latest session only when available
      }
    }

    void loadLatestSession();

    return () => {
      cancelled = true;
    };
  }, [applyDailySessionPayload]);

  const startDailySession = useCallback(async () => {
    setSessionActionStatus("starting");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/daily-session/start", {
        method: "POST"
      });

      if (!response.ok) {
        throw new Error("Daily session start failed.");
      }

      const payload = (await response.json()) as DailySessionPayload;
      setLearnerStepOverride(null);
      applyDailySessionPayload(payload);

      if (payload.learnerCase) {
        await runDeliberation(payload.learnerCase);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSessionActionStatus("idle");
    }
  }, [applyDailySessionPayload, runDeliberation]);

  const advanceToNextQuestion = useCallback(async () => {
    if (!dailySession) {
      return;
    }

    setSessionActionStatus("advancing");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/daily-session/advance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: dailySession.id,
          observation:
            currentQuestionId && decision
              ? buildObservationInput({
                  dailySessionId: dailySession.id,
                  questionId: currentQuestionId,
                  questionIndex: dailySession.current_index,
                  coachDecision: decision,
                  deliberationEvents: events
                })
              : undefined
        })
      });

      if (!response.ok) {
        throw new Error("Daily session advance failed.");
      }

      const payload = (await response.json()) as DailySessionPayload;
      setLearnerStepOverride(null);
      applyDailySessionPayload(payload);

      if (payload.session.status !== "completed" && payload.learnerCase) {
        await runDeliberation(payload.learnerCase);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSessionActionStatus("idle");
    }
  }, [applyDailySessionPayload, currentQuestionId, dailySession, decision, events, runDeliberation]);

  const generateDailyReview = useCallback(async () => {
    if (!dailySession || dailySession.status !== "completed") {
      setErrorMessage("Daily Review は3問完了後にだけ生成できます。");
      return;
    }

    setReviewActionStatus("generating");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/daily-session/review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: dailySession.id
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Daily review generation failed.");
      }

      const payload = (await response.json()) as DailySessionPayload;
      applyDailySessionPayload(payload);
      setLearnerStepOverride("review");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setReviewActionStatus("idle");
    }
  }, [applyDailySessionPayload, dailySession]);

  const generateTomorrowPlan = useCallback(async () => {
    if (!dailySession || dailySession.status !== "completed" || dailySession.review_status !== "generated") {
      setErrorMessage("Tomorrow Plan は Daily Review 生成後にだけ作成できます。");
      return;
    }

    setPlanActionStatus("generating");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/daily-session/tomorrow-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: dailySession.id
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Tomorrow plan generation failed.");
      }

      const payload = (await response.json()) as DailySessionPayload;
      applyDailySessionPayload(payload);
      setLearnerStepOverride("tomorrow");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setPlanActionStatus("idle");
    }
  }, [applyDailySessionPayload, dailySession]);

  const derivedStep = getCurrentStep(dailySession, tomorrowPlan);
  const currentStep = learnerStepOverride ?? derivedStep;
  const currentStepIndex = STEP_ORDER.indexOf(currentStep);
  const activeQuestionNumber =
    dailySession && dailySession.status !== "completed" ? dailySession.current_index + 1 : null;
  const totalQuestions = dailySession?.question_ids.length ?? 3;
  const completedQuestionCount = dailySession
    ? Math.min(dailySession.current_index, dailySession.question_ids.length)
    : 0;
  const canAdvance = dailySession !== null && dailySession.status !== "completed" && status === "done";
  const isFinalActiveQuestion =
    dailySession !== null &&
    dailySession.status !== "completed" &&
    dailySession.current_index === dailySession.question_ids.length - 1;
  const questionCtaLabel = isFinalActiveQuestion ? "Submit and open Daily Review" : "Submit and go next";

  return (
    <main className="demo-viewport">
      <section className="device-layout">
        <article className="phone-frame">
          <div className="device-scroll-shell">
            <div className="phone-chrome">
              <div>
                <p className="phone-app-label">Learner App</p>
                <p className="phone-app-name">MentorHQ Student</p>
              </div>
              <div className="phone-status">
                <span>{STEP_LABELS[currentStep]}</span>
              </div>
            </div>

            <div className="phone-progress">
              {STEP_ORDER.map((step, index) => (
                <div
                  className={`phone-progress-dot ${
                    index < currentStepIndex ? "is-complete" : index === currentStepIndex ? "is-current" : ""
                  }`}
                  key={step}
                />
              ))}
            </div>

            <div className="phone-card">
              {currentStep === "morning" ? (
                <>
                  <div className="panel-heading tight">
                    <span className="panel-kicker">Morning Brief</span>
                    <h3>今日の学習開始</h3>
                  </div>
                  <p className="body-copy">
                    今日は3問だけ進めます。AIコーチは答えを急がず、迷い方や見落とし方を静かに観察します。
                  </p>
                  <div className="reflection-box">
                    Start Daily Session を押すと Question 1 に進みます。
                  </div>
                  <button
                    className="primary-button phone-button"
                    onClick={() => void startDailySession()}
                    type="button"
                    disabled={sessionActionStatus !== "idle"}
                  >
                    {sessionActionStatus === "starting" ? "Starting..." : "Start Daily Session"}
                  </button>
                </>
              ) : null}

              {currentStep.startsWith("question-") ? (
                <>
                  <div className="panel-heading tight">
                    <span className="panel-kicker">{STEP_LABELS[currentStep]}</span>
                    <h3>{learnerCase.questionTitle}</h3>
                  </div>
                  <div className="question-meta-strip">
                    <span>{activeQuestionNumber} / {totalQuestions}</span>
                    <span>{sessionStatusMessage}</span>
                  </div>
                  <p className="body-copy">{learnerCase.questionStem}</p>
                  <div className="prompt-card">
                    <span className="summary-label">Current Focus</span>
                    <p>{learnerCase.currentLeg}</p>
                  </div>
                  <div className="phone-answer-block">
                    <span className="summary-label">Learner Answer</span>
                    <div className="reflection-box">{learnerCase.learnerAnswer}</div>
                  </div>
                  <div className="phone-answer-block">
                    <span className="summary-label">Why they chose it</span>
                    <div className="reflection-box">{learnerCase.reason}</div>
                  </div>
                  <div className="phone-answer-block">
                    <span className="summary-label">Ground Truth</span>
                    <div className="reflection-box">{learnerCase.objectiveTruth}</div>
                  </div>
                  <div className="quiet-status-box">
                    {status === "loading" || status === "streaming"
                      ? "AI coach is observing this answer in the background..."
                      : "観察の下書きができました。次へ進めます。"}
                  </div>
                  <button
                    className="primary-button phone-button"
                    onClick={() => void advanceToNextQuestion()}
                    type="button"
                    disabled={!canAdvance || sessionActionStatus !== "idle"}
                  >
                    {sessionActionStatus === "advancing" ? "Submitting..." : questionCtaLabel}
                  </button>
                </>
              ) : null}

              {currentStep === "review" ? (
                <>
                  <div className="panel-heading tight">
                    <span className="panel-kicker">Daily Coach Review</span>
                    <h3>今日の振り返り</h3>
                  </div>
                  {dailyReview ? (
                    <div className="daily-review-content">
                      <section className="daily-review-block">
                        <span className="summary-label">Summary</span>
                        <div className="reflection-box">{dailyReview.summary}</div>
                      </section>
                      <section className="daily-review-block">
                        <span className="summary-label">Key Observations</span>
                        <div className="review-list">
                          {dailyReview.key_observations.map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                        </div>
                      </section>
                      <section className="daily-review-block">
                        <span className="summary-label">Tomorrow Candidates</span>
                        <div className="review-list">
                          {dailyReview.repeated_patterns.map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                        </div>
                      </section>
                      <section className="daily-review-block">
                        <span className="summary-label">Coach Comment</span>
                        <div className="reflection-box">{dailyReview.coach_comment}</div>
                      </section>
                    </div>
                  ) : (
                    <div className="review-empty-state">
                      <p>3問分の観察が集まりました。</p>
                      <p>ここで初めて、今日の傾向を短く整理します。</p>
                    </div>
                  )}
                  {dailyReview ? (
                    <button
                      className="primary-button phone-button"
                      onClick={() => setLearnerStepOverride(null)}
                      type="button"
                    >
                      Next: Tomorrow Plan
                    </button>
                  ) : (
                    <button
                      className="primary-button phone-button"
                      onClick={() => void generateDailyReview()}
                      type="button"
                      disabled={reviewActionStatus !== "idle"}
                    >
                      {reviewActionStatus === "generating" ? "Generating..." : "Generate Daily Review"}
                    </button>
                  )}
                </>
              ) : null}

              {currentStep === "tomorrow" ? (
                <>
                  <div className="panel-heading tight">
                    <span className="panel-kicker">Tomorrow Plan</span>
                    <h3>明日の進め方</h3>
                  </div>
                  {tomorrowPlan ? (
                    <div className="daily-review-content">
                      <section className="daily-review-block">
                        <span className="summary-label">Focus Theme</span>
                        <div className="reflection-box">{tomorrowPlan.focus_theme}</div>
                      </section>
                      <section className="daily-review-block">
                        <span className="summary-label">Practice Items</span>
                        <div className="review-list">
                          {tomorrowPlan.practice_items.map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                        </div>
                      </section>
                      <section className="daily-review-block">
                        <span className="summary-label">Caution Points</span>
                        <div className="review-list">
                          {tomorrowPlan.caution_points.map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                        </div>
                      </section>
                      <section className="daily-review-block">
                        <span className="summary-label">Coach Message</span>
                        <div className="reflection-box">{tomorrowPlan.coach_message}</div>
                      </section>
                    </div>
                  ) : (
                    <div className="review-empty-state">
                      <p>Daily Review をもとに、明日の重点候補を組み立てます。</p>
                      <p>まだ最終評価ではなく、次回の見方を残します。</p>
                    </div>
                  )}
                  {tomorrowPlan ? (
                    <button
                      className="primary-button phone-button"
                      onClick={() => setLearnerStepOverride(null)}
                      type="button"
                    >
                      Finish
                    </button>
                  ) : (
                    <button
                      className="primary-button phone-button"
                      onClick={() => void generateTomorrowPlan()}
                      type="button"
                      disabled={planActionStatus !== "idle" || dailySession?.review_status !== "generated"}
                    >
                      {planActionStatus === "generating" ? "Generating..." : "Generate Tomorrow Plan"}
                    </button>
                  )}
                </>
              ) : null}

              {currentStep === "goodbye" ? (
                <>
                  <div className="panel-heading tight">
                    <span className="panel-kicker">Goodbye</span>
                    <h3>今日の学習完了</h3>
                  </div>
                  <div className="reflection-box">
                    {tomorrowPlan
                      ? `明日は ${tomorrowPlan.focus_theme} を重点的に確認します。`
                      : "明日の重点をこのまま持ち帰ります。"}
                  </div>
                  <p className="body-copy">
                    Observation Stream はこのまま残るので、今日の迷い方をあとから見返せます。
                  </p>
                  <button
                    className="primary-button phone-button"
                    onClick={() => void startDailySession()}
                    type="button"
                    disabled={sessionActionStatus !== "idle"}
                  >
                    {sessionActionStatus === "starting" ? "Starting..." : "Start New Session"}
                  </button>
                </>
              ) : null}

              {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
            </div>

            <div className="phone-footer">
              <span>{completedQuestionCount} completed</span>
              <span>{dailySession?.observation_count ?? 0} observations</span>
            </div>
          </div>
        </article>

        <article className="tablet-frame">
          <div className="device-scroll-shell coach-scroll-shell">
            <div className="panel-heading tight observation-stream-heading">
              <div>
                <span className="panel-kicker">AI Coach Mind</span>
                <h3>まだ判断せず、観察だけを積みます</h3>
                <p className="device-caption">{learnerCase.exam} / {mode === "ai" ? "AI Deliberation" : "Mock Fallback"}</p>
              </div>
              <span className="observation-count-pill">
                {dailySession ? `${dailySession.observation_count} observations` : "0 observations"}
              </span>
            </div>
            <p className="observation-intro-copy">
              起算点や条件句、迷い方の癖をメモしています。結論は Review まで持ち込みません。
            </p>

            {latestObservation ? (
              <section className="latest-observation-card">
                <div className="latest-observation-label">Latest Observation</div>
                <div className="latest-observation-row">
                  <span className="observation-icon" aria-hidden="true">
                    {getObservationIcon(latestObservation)}
                  </span>
                  <div>
                    <p className="latest-observation-note">{latestObservation.note}</p>
                    <p className="latest-observation-meta">まだ判断せず、今日のレビューで確認します。</p>
                  </div>
                </div>
              </section>
            ) : null}

            <div className="observation-stream-viewport">
              <div className="observation-list">
                {observations.length === 0 ? (
                  <div className="observation-empty-state">
                    <p>まだ観察はありません。</p>
                    <p>Question 1 から順に、右側へ静かに増えていきます。</p>
                  </div>
                ) : (
                  observations.map((observation, index) => (
                    <section
                      className={`mind-entry ${latestObservation?.id === observation.id ? "is-latest-observation" : ""}`}
                      key={observation.id}
                    >
                      <div className="mind-entry-time">{formatObservationTime(observation.created_at, index)}</div>
                      <div className="observation-row">
                        <div className="observation-icon" aria-hidden="true">
                          {getObservationIcon(observation)}
                        </div>
                        <div className="observation-bubble">
                          <p>{observation.note}</p>
                          <div className="observation-meta-row">
                            <span>{observation.intervention_type}</span>
                            <span>{observation.misunderstanding_type}</span>
                          </div>
                        </div>
                      </div>
                    </section>
                  ))
                )}
              </div>
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
