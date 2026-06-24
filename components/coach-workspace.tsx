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

function getObservationIcon(observation: ObservationEvent) {
  if (observation.intervention_type === "starting_point_check") return "🧠";
  if (observation.intervention_type === "contrast_check") return "🔁";
  if (observation.intervention_type === "integrated_retry") return "⚖️";
  return "📝";
}

const EVENT_DURATIONS: Record<DeliberationEvent["type"], number> = {
  observation: 1500,
  challenge: 2000,
  revision: 2500,
  recommendation: 2000,
  coach_decision: 3000
};

function getCumulativeEventDelay(events: DeliberationEvent[], index: number) {
  let total = 350;

  for (let currentIndex = 0; currentIndex <= index; currentIndex += 1) {
    total += EVENT_DURATIONS[events[currentIndex].type];
  }

  return total;
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
          : `今日の固定3問セッションを進行中です。`
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
        // latest session hydrate is best-effort for demo continuity
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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setPlanActionStatus("idle");
    }
  }, [applyDailySessionPayload, dailySession]);

  const completedQuestionCount = dailySession
    ? Math.min(dailySession.current_index, dailySession.question_ids.length)
    : 0;
  const activeQuestionNumber =
    dailySession && dailySession.status !== "completed" ? dailySession.current_index + 1 : null;
  const canAdvance = dailySession !== null && dailySession.status !== "completed" && status === "done";
  const isFinalActiveQuestion =
    dailySession !== null &&
    dailySession.status !== "completed" &&
    dailySession.current_index === dailySession.question_ids.length - 1;

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">MentorHQ MVP Demo</p>
          <h1>Daily Observation Workspace</h1>
        </div>
        <div className="hero-meta">
          <span>{learnerCase.exam}</span>
          <span>{learnerCase.theme}</span>
          <span>{mode === "ai" ? "AI Deliberation" : "Mock Fallback"}</span>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="column">
          <div className="column-header">
            <p className="eyebrow">ケース概要</p>
            <h2>学習者の状況</h2>
          </div>

          <article className="panel compact problem-panel">
            <div className="panel-heading tight">
              <span className="panel-kicker">問題</span>
              <h3>{learnerCase.questionTitle}</h3>
            </div>
            <p className="body-copy compact-copy">{learnerCase.questionStem}</p>
            <p className="leg-statement">{learnerCase.currentLeg}</p>
          </article>

          <article className="panel compact answer-panel">
            <div className="panel-heading tight">
              <span className="panel-kicker">Daily Session</span>
              <h3>固定3問セッション</h3>
            </div>
            <div className="compact-stack">
              <div>
                <span className="summary-label">セッション状態</span>
                <p className="value-text session-status-text">
                  {dailySession ? dailySession.status : "not_started"}
                </p>
              </div>
              <div>
                <span className="summary-label">進行状況</span>
                <div className="reflection-box">
                  {dailySession
                    ? `${completedQuestionCount} / ${dailySession.question_ids.length} 問完了${
                        activeQuestionNumber ? `・現在 ${activeQuestionNumber} 問目` : ""
                      }`
                    : "Start Daily Session で今日の3問を開始します。"}
                </div>
              </div>
              <div>
                <span className="summary-label">表示</span>
                <div className="reflection-box">{sessionStatusMessage}</div>
              </div>
              <div>
                <span className="summary-label">Review Status</span>
                <div className="reflection-box">
                  {dailySession ? dailySession.review_status : "pending"}
                </div>
              </div>
              <div>
                <span className="summary-label">Tomorrow Plan Status</span>
                <div className="reflection-box">
                  {dailySession ? dailySession.tomorrow_plan_status : "pending"}
                </div>
              </div>
            </div>
            <button
              className="primary-button"
              onClick={() => void startDailySession()}
              type="button"
              disabled={sessionActionStatus !== "idle" || Boolean(dailySession && dailySession.status !== "completed")}
            >
              {sessionActionStatus === "starting" ? "Starting..." : "Start Daily Session"}
            </button>
          </article>

          <article className="panel compact answer-panel">
            <div className="compact-stack">
              <div>
                <span className="summary-label">学習者の回答</span>
                <p className="value-text">{learnerCase.learnerAnswer}</p>
              </div>
              <div>
                <span className="summary-label">理由</span>
                <div className="reflection-box">{learnerCase.reason}</div>
              </div>
              <div>
                <span className="summary-label">客観的真偽</span>
                <div className="reflection-box">{learnerCase.objectiveTruth}</div>
              </div>
            </div>
          </article>

          <article className="panel compact answer-panel">
            <div className="panel-heading tight">
              <span className="panel-kicker">Run Control</span>
              <h3>Observation を更新</h3>
            </div>
            <p className="body-copy compact-copy">裏側の deliberation を再実行して、観察の下地を更新します。</p>
            <button
              className="primary-button"
              onClick={() => void runDeliberation()}
              type="button"
              disabled={!dailySession || dailySession.status === "completed" || status === "loading" || status === "streaming"}
            >
              {status === "loading" || status === "streaming" ? "Running..." : "Run Deliberation"}
            </button>
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
          </article>
        </div>

        <div className="column">
          <div className="column-header">
            <p className="eyebrow">Observation Stream</p>
            <h2>AIが裏側で記録した観察</h2>
          </div>

          <article className="panel observation-stream-panel">
            <div className="panel-heading tight observation-stream-heading">
              <div>
                <span className="panel-kicker">Observation Stream</span>
                <h3>まだ判断せず、傾向だけを残します</h3>
              </div>
              <span className="observation-count-pill">
                {dailySession ? `${dailySession.observation_count} observations` : "0 observations"}
              </span>
            </div>

            {latestObservation ? (
              <section className="latest-observation-card">
                <div className="latest-observation-label">Latest Observation</div>
                <div className="latest-observation-row">
                  <span className="observation-icon" aria-hidden="true">
                    {getObservationIcon(latestObservation)}
                  </span>
                  <div>
                    <p className="latest-observation-note">{latestObservation.note}</p>
                    <p className="latest-observation-meta">
                      可能性だけを残し、まだ判断しません。
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            <div className="observation-stream-viewport">
              <div className="observation-list">
                {observations.length === 0 ? (
                  <div className="observation-empty-state">
                    <p>まだ観察はありません。</p>
                    <p>回答が進むと、AIが裏側で学習傾向を記録します。</p>
                  </div>
                ) : (
                  observations.map((observation) => (
                    <section
                      className={`observation-row ${latestObservation?.id === observation.id ? "is-latest-observation" : ""}`}
                      key={observation.id}
                    >
                      <div className="observation-icon" aria-hidden="true">
                        {getObservationIcon(observation)}
                      </div>
                      <div className="observation-bubble">
                        <p>{observation.note}</p>
                        <div className="observation-meta-row">
                          <span>{observation.intervention_type}</span>
                          <span>{observation.misunderstanding_type}</span>
                          <span>
                            {observation.confidence !== null
                              ? `${Math.round(observation.confidence * 100)}% confidence`
                              : "confidence pending"}
                          </span>
                        </div>
                      </div>
                    </section>
                  ))
                )}
              </div>
            </div>
            <button
              className="primary-button secondary-button"
              onClick={() => void advanceToNextQuestion()}
              type="button"
              disabled={!canAdvance || sessionActionStatus !== "idle"}
            >
              {sessionActionStatus === "advancing"
                ? "Advancing..."
                : isFinalActiveQuestion
                  ? "この回答を記録して完了"
                  : "この回答を記録して次へ"}
            </button>
          </article>

          {dailySession?.status === "completed" ? (
            <>
              <article className="panel daily-review-panel">
                <div className="panel-heading tight daily-review-heading">
                  <div>
                    <span className="panel-kicker">Daily Coach Review</span>
                    <h3>今日の観測まとめ</h3>
                  </div>
                  <span className="review-status-pill">
                    {dailySession.review_status === "generated" ? "generated" : "pending"}
                  </span>
                </div>

                {dailyReview ? (
                  <div className="daily-review-content">
                    <section className="daily-review-block">
                      <span className="summary-label">今日の観測まとめ</span>
                      <div className="reflection-box">{dailyReview.summary}</div>
                    </section>

                    <section className="daily-review-block">
                      <span className="summary-label">観測メモ</span>
                      <div className="review-list">
                        {dailyReview.key_observations.map((item) => (
                          <p key={item}>{item}</p>
                        ))}
                      </div>
                    </section>

                    <section className="daily-review-block">
                      <span className="summary-label">明日の重点候補</span>
                      <div className="review-list">
                        {dailyReview.repeated_patterns.map((item) => (
                          <p key={item}>{item}</p>
                        ))}
                      </div>
                    </section>

                    <section className="daily-review-block">
                      <span className="summary-label">コーチコメント</span>
                      <div className="reflection-box">{dailyReview.coach_comment}</div>
                    </section>
                  </div>
                ) : (
                  <div className="review-empty-state">
                    <p>3問完了後に、その日の観測をまとめます。</p>
                    <p>まだ最終判断ではなく、今日の振り返りだけを残します。</p>
                  </div>
                )}

                <button
                  className="primary-button"
                  onClick={() => void generateDailyReview()}
                  type="button"
                  disabled={reviewActionStatus !== "idle" || dailySession.review_status === "generated"}
                >
                  {reviewActionStatus === "generating"
                    ? "Generating..."
                    : dailySession.review_status === "generated"
                      ? "Daily Review Generated"
                      : "Generate Daily Review"}
                </button>
              </article>

              <article className="panel tomorrow-plan-panel">
                <div className="panel-heading tight daily-review-heading">
                  <div>
                    <span className="panel-kicker">Tomorrow Plan</span>
                    <h3>明日の練習方針</h3>
                  </div>
                  <span className="review-status-pill">
                    {dailySession.tomorrow_plan_status === "generated" ? "generated" : "pending"}
                  </span>
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
                    <p>Daily Review のあとで、明日の練習方針を組み立てます。</p>
                    <p>「次の一問」ではなく、「明日はこれを見ましょう」を残します。</p>
                  </div>
                )}

                <button
                  className="primary-button"
                  onClick={() => void generateTomorrowPlan()}
                  type="button"
                  disabled={
                    planActionStatus !== "idle" ||
                    dailySession.tomorrow_plan_status === "generated" ||
                    dailySession.review_status !== "generated"
                  }
                >
                  {planActionStatus === "generating"
                    ? "Generating..."
                    : dailySession.tomorrow_plan_status === "generated"
                      ? "Tomorrow Plan Generated"
                      : "Generate Tomorrow Plan"}
                </button>
              </article>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
