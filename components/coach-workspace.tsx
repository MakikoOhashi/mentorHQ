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
  LearnerChoice,
  ObservationEvent,
  ObservationEventInput,
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

type QuestionOption = {
  label: string;
  value: LearnerChoice;
};

type QuestionConfig = {
  prompt: string;
  options: QuestionOption[];
};

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

const QUESTION_CONFIGS: Record<string, QuestionConfig> = {
  q1: {
    prompt: "どこから数え始めますか？",
    options: [
      { label: "最初から", value: "first_position" },
      { label: "条件を満たしたところから", value: "condition_start" },
      { label: "わからない", value: "unknown_start" }
    ]
  },
  q2: {
    prompt: "この条件は使いますか？",
    options: [
      { label: "使う", value: "use_condition" },
      { label: "使わない", value: "ignore_condition" },
      { label: "迷っている", value: "unsure_condition" }
    ]
  },
  q3: {
    prompt: "答える前に何を確認しますか？",
    options: [
      { label: "起算点", value: "check_starting_point" },
      { label: "条件句", value: "check_condition" },
      { label: "単位", value: "check_unit" },
      { label: "そのまま答える", value: "answer_directly" }
    ]
  }
};

const EVENT_DURATIONS: Record<DeliberationEvent["type"], number> = {
  observation: 1500,
  challenge: 2000,
  revision: 2500,
  recommendation: 2000,
  coach_decision: 3000
};

const CHOICE_OBSERVATION_MAP: Record<LearnerChoice, Omit<ObservationEventInput, "daily_session_id" | "question_id" | "question_index">> = {
  first_position: {
    misunderstanding_type: "starting_point_confusion",
    intervention_type: "starting_point_check",
    confidence: 0.82,
    note: "起算点を最初に置いている可能性があります"
  },
  condition_start: {
    misunderstanding_type: "stable_progress",
    intervention_type: "light_monitoring",
    confidence: 0.7,
    note: "条件を見て起算点を調整できています"
  },
  unknown_start: {
    misunderstanding_type: "starting_point_confusion",
    intervention_type: "starting_point_check",
    confidence: 0.58,
    note: "起算点の置き方をまだ迷っています"
  },
  use_condition: {
    misunderstanding_type: "stable_progress",
    intervention_type: "light_monitoring",
    confidence: 0.74,
    note: "条件句を判断材料として使えています"
  },
  ignore_condition: {
    misunderstanding_type: "condition_omission",
    intervention_type: "condition_check",
    confidence: 0.84,
    note: "条件句を読み飛ばしている可能性があります"
  },
  unsure_condition: {
    misunderstanding_type: "condition_omission",
    intervention_type: "condition_check",
    confidence: 0.62,
    note: "条件句を使う場面で迷いが残っています"
  },
  check_starting_point: {
    misunderstanding_type: "stable_progress",
    intervention_type: "light_monitoring",
    confidence: 0.72,
    note: "答える前に起算点を確認しようとしています"
  },
  check_condition: {
    misunderstanding_type: "stable_progress",
    intervention_type: "light_monitoring",
    confidence: 0.72,
    note: "答える前に条件句へ目を向けています"
  },
  check_unit: {
    misunderstanding_type: "stable_progress",
    intervention_type: "light_monitoring",
    confidence: 0.66,
    note: "単位の確認を挟んで慎重に進めています"
  },
  answer_directly: {
    misunderstanding_type: "rushed_answer",
    intervention_type: "slow_down_prompt",
    confidence: 0.86,
    note: "確認せずに答えへ進む傾向があります"
  }
};

function getObservationIcon(observation: ObservationEvent) {
  if (observation.intervention_type === "starting_point_check") return "🧠";
  if (observation.intervention_type === "contrast_check" || observation.intervention_type === "condition_check") {
    return "🔁";
  }
  if (observation.intervention_type === "integrated_retry" || observation.intervention_type === "slow_down_prompt") {
    return "💭";
  }
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

function buildObservationFromChoice(params: {
  dailySessionId: string;
  questionId: string;
  questionIndex: number;
  learnerChoice: LearnerChoice;
}): ObservationEventInput {
  const mapped = CHOICE_OBSERVATION_MAP[params.learnerChoice];

  return {
    daily_session_id: params.dailySessionId,
    question_id: params.questionId,
    question_index: params.questionIndex,
    intervention_type: mapped.intervention_type,
    misunderstanding_type: mapped.misunderstanding_type,
    confidence: mapped.confidence,
    note: mapped.note
  };
}

export function CoachWorkspace({ initialCase }: CoachWorkspaceProps) {
  const [learnerCase, setLearnerCase] = useState(initialCase);
  const [dailySession, setDailySession] = useState<DailySession | null>(null);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [observations, setObservations] = useState<ObservationEvent[]>([]);
  const [latestObservation, setLatestObservation] = useState<ObservationEvent | null>(null);
  const [dailyReview, setDailyReview] = useState<DailyReview | null>(null);
  const [tomorrowPlan, setTomorrowPlan] = useState<TomorrowPlan | null>(null);
  const [events, setEvents] = useState<DeliberationEvent[]>([]);
  const [decision, setDecision] = useState<CoachDecision | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "streaming" | "done" | "error">("idle");
  const [sessionActionStatus, setSessionActionStatus] = useState<"idle" | "starting" | "advancing">("idle");
  const [reviewActionStatus, setReviewActionStatus] = useState<"idle" | "generating">("idle");
  const [planActionStatus, setPlanActionStatus] = useState<"idle" | "generating">("idle");
  const [learnerStepOverride, setLearnerStepOverride] = useState<LearnerStep | null>(null);
  const [mode, setMode] = useState<"mock" | "ai">("mock");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentChoice, setCurrentChoice] = useState<LearnerChoice | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const timeoutIdsRef = useRef<number[]>([]);

  const clearScheduledUpdates = useCallback(() => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current = [];
  }, []);

  const clearLearnerFlow = useCallback(() => {
    setDailySession(null);
    setCurrentQuestionId(null);
    setObservations([]);
    setLatestObservation(null);
    setDailyReview(null);
    setTomorrowPlan(null);
    setLearnerCase(initialCase);
    setEvents([]);
    setDecision(null);
    setStatus("idle");
    setErrorMessage(null);
    setCurrentChoice(null);
    setLearnerStepOverride(null);
    clearScheduledUpdates();
  }, [clearScheduledUpdates, initialCase]);

  const runDeliberation = useCallback(async (targetCase?: LearnerCase) => {
    clearScheduledUpdates();
    setStatus("loading");
    setEvents([]);
    setDecision(null);

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
    } catch {
      setStatus("error");
    }
  }, [clearScheduledUpdates, learnerCase]);

  useEffect(() => () => {
    clearScheduledUpdates();
  }, [clearScheduledUpdates]);

  const applyDailySessionPayload = useCallback((payload: DailySessionPayload) => {
    setDailySession(payload.session);
    setCurrentQuestionId(payload.currentQuestionId);
    setObservations(payload.observations);
    setLatestObservation(payload.latestObservation);
    setDailyReview(payload.dailyReview);
    setTomorrowPlan(payload.tomorrowPlan);
    setCurrentChoice(null);

    if (payload.learnerCase) {
      setLearnerCase(payload.learnerCase);
    }

    if (payload.session.status === "completed") {
      clearScheduledUpdates();
      setEvents([]);
      setDecision(null);
      setStatus("idle");
    }
  }, [clearScheduledUpdates]);

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
        void runDeliberation(payload.learnerCase);
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
      const observation =
        currentQuestionId && currentChoice
          ? buildObservationFromChoice({
              dailySessionId: dailySession.id,
              questionId: currentQuestionId,
              questionIndex: dailySession.current_index,
              learnerChoice: currentChoice
            })
          : currentQuestionId && decision
            ? buildObservationInput({
                dailySessionId: dailySession.id,
                questionId: currentQuestionId,
                questionIndex: dailySession.current_index,
                coachDecision: decision,
                deliberationEvents: events
              })
            : undefined;

      const response = await fetch("/api/daily-session/advance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: dailySession.id,
          learner_choice: currentChoice ?? undefined,
          observation
        })
      });

      if (!response.ok) {
        throw new Error("Daily session advance failed.");
      }

      const payload = (await response.json()) as DailySessionPayload;
      setLearnerStepOverride(null);
      applyDailySessionPayload(payload);

      if (payload.session.status !== "completed" && payload.learnerCase) {
        void runDeliberation(payload.learnerCase);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSessionActionStatus("idle");
    }
  }, [applyDailySessionPayload, currentChoice, currentQuestionId, dailySession, decision, events, runDeliberation]);

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
  const currentQuestionConfig = currentQuestionId ? QUESTION_CONFIGS[currentQuestionId] : null;
  const isQuestionStep = currentStep.startsWith("question-");
  const questionButtonLabel =
    currentStep === "question-3" ? "今日のふりかえりへ" : currentChoice ? "次へ" : "答える";

  return (
    <main className="demo-viewport">
      <section className="device-layout">
        <article className="phone-frame">
          <div className="device-scroll-shell">
            <div className="phone-chrome">
              <div className="phone-menu-wrap">
                <button
                  aria-expanded={menuOpen}
                  aria-label="メニュー"
                  className="menu-button"
                  onClick={() => setMenuOpen((current) => !current)}
                  type="button"
                >
                  <span />
                  <span />
                  <span />
                </button>
                {menuOpen ? (
                  <div className="phone-menu-panel">
                    <button
                      className="phone-menu-item"
                      onClick={() => {
                        clearLearnerFlow();
                        setMenuOpen(false);
                      }}
                      type="button"
                    >
                      最初から
                    </button>
                    <button
                      className="phone-menu-item"
                      onClick={() => {
                        setLearnerStepOverride("morning");
                        setMenuOpen(false);
                      }}
                      type="button"
                    >
                      今日の流れ
                    </button>
                    <button
                      className="phone-menu-item"
                      onClick={() => {
                        clearLearnerFlow();
                        void startDailySession();
                        setMenuOpen(false);
                      }}
                      type="button"
                    >
                      デモをリセット
                    </button>
                  </div>
                ) : null}
                <div>
                  <p className="phone-app-label">Learner App</p>
                  <p className="phone-app-name">MentorHQ Student</p>
                </div>
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
                  <p className="body-copy">今日は3問だけ進めます。問題を見て、選んで、次へ進みます。</p>
                  <div className="reflection-box">Start Daily Session を押すと 1問目が始まります。</div>
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

              {isQuestionStep && currentQuestionConfig ? (
                <>
                  <div className="panel-heading tight">
                    <span className="panel-kicker">{STEP_LABELS[currentStep]}</span>
                    <h3>{currentQuestionConfig.prompt}</h3>
                  </div>
                  <div className="question-meta-strip">
                    <span>{activeQuestionNumber} / {totalQuestions}</span>
                    <span>{learnerCase.theme}</span>
                  </div>
                  <p className="body-copy">{learnerCase.questionStem}</p>
                  <div className="prompt-card">
                    <span className="summary-label">今日の問題</span>
                    <p>{learnerCase.currentLeg}</p>
                  </div>
                  <div className="choice-list" role="radiogroup" aria-label={currentQuestionConfig.prompt}>
                    {currentQuestionConfig.options.map((option) => (
                      <button
                        aria-checked={currentChoice === option.value}
                        className={`choice-card ${currentChoice === option.value ? "is-selected" : ""}`}
                        key={option.value}
                        onClick={() => setCurrentChoice(option.value)}
                        role="radio"
                        type="button"
                      >
                        <span className="choice-marker" aria-hidden="true" />
                        <span>{option.label}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    className="primary-button phone-button"
                    onClick={() => void advanceToNextQuestion()}
                    type="button"
                    disabled={!currentChoice || sessionActionStatus !== "idle"}
                  >
                    {sessionActionStatus === "advancing" ? "進んでいます..." : questionButtonLabel}
                  </button>
                </>
              ) : null}

              {currentStep === "review" ? (
                <>
                  <div className="panel-heading tight">
                    <span className="panel-kicker">Daily Coach Review</span>
                    <h3>今日のふりかえり</h3>
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
                    </div>
                  ) : (
                    <div className="review-empty-state">
                      <p>3問分の様子がそろいました。</p>
                      <p>ここで今日の流れを短くまとめます。</p>
                    </div>
                  )}
                  {dailyReview ? (
                    <button
                      className="primary-button phone-button"
                      onClick={() => setLearnerStepOverride(null)}
                      type="button"
                    >
                      明日の練習を見る
                    </button>
                  ) : (
                    <button
                      className="primary-button phone-button"
                      onClick={() => void generateDailyReview()}
                      type="button"
                      disabled={reviewActionStatus !== "idle"}
                    >
                      {reviewActionStatus === "generating" ? "作成中..." : "今日のふりかえりへ"}
                    </button>
                  )}
                </>
              ) : null}

              {currentStep === "tomorrow" ? (
                <>
                  <div className="panel-heading tight">
                    <span className="panel-kicker">Tomorrow Plan</span>
                    <h3>明日の練習</h3>
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
                    </div>
                  ) : (
                    <div className="review-empty-state">
                      <p>今日のふりかえりをもとに、明日の練習を組み立てます。</p>
                    </div>
                  )}
                  {tomorrowPlan ? (
                    <button
                      className="primary-button phone-button"
                      onClick={() => setLearnerStepOverride(null)}
                      type="button"
                    >
                      おわる
                    </button>
                  ) : (
                    <button
                      className="primary-button phone-button"
                      onClick={() => void generateTomorrowPlan()}
                      type="button"
                      disabled={planActionStatus !== "idle" || dailySession?.review_status !== "generated"}
                    >
                      {planActionStatus === "generating" ? "作成中..." : "明日の練習を見る"}
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
                      ? `明日は ${tomorrowPlan.focus_theme} を意識して進めます。`
                      : "明日の流れを持ち帰ります。"}
                  </div>
                  <button
                    className="primary-button phone-button"
                    onClick={() => void startDailySession()}
                    type="button"
                    disabled={sessionActionStatus !== "idle"}
                  >
                    {sessionActionStatus === "starting" ? "Starting..." : "最初から"}
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
                <p className="device-caption">
                  {learnerCase.exam} / {mode === "ai" ? "AI Deliberation" : "Mock Fallback"}
                </p>
              </div>
              <span className="observation-count-pill">
                {dailySession ? `${dailySession.observation_count} observations` : "0 observations"}
              </span>
            </div>
            <p className="observation-intro-copy">
              起算点や条件句、答える前の確認の仕方を記録しています。結論は Review まで持ち込みません。
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
