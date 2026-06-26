"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { buildStatementObservationInput } from "@/lib/deliberation/observation";
import type {
  DailyReview,
  DailySession,
  LearnerCase,
  ObservationEvent,
  StatementChoice,
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

type QuestionPhase = "stem" | "statement" | "final" | "result";

type StatementFeedback = {
  title: string;
  message: string;
};

type FinalResult = {
  selectedIndex: number;
  correctIndex: number;
  summary: string;
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

const STATEMENT_OPTIONS: Array<{ label: string; value: StatementChoice }> = [
  { label: "○ 正しい", value: "correct" },
  { label: "× 誤り", value: "incorrect" }
];

const FEEDBACK_BY_CHOICE: Record<StatementChoice, StatementFeedback> = {
  correct: {
    title: "なるほど。",
    message: "その見方を、短く言葉にして残してください。"
  },
  incorrect: {
    title: "ありがとうございます。",
    message: "どこが気になったのかを1〜2行で残してください。"
  }
};

function getObservationIcon(observation: ObservationEvent) {
  if (observation.reasoning_style === "memory_based") return "🧠";
  if (observation.reasoning_style === "condition_based") return "🔁";
  if (observation.reasoning_style === "uncertainty") return "💭";
  return "📌";
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

function formatChoiceLabel(choice: ObservationEvent["learner_choice"]) {
  if (choice === "correct") return "○";
  if (choice === "incorrect") return "×";
  return "未記録";
}

function formatReasoningStyle(reasoningStyle: ObservationEvent["reasoning_style"]) {
  if (reasoningStyle === "memory_based") return "memory_based";
  if (reasoningStyle === "condition_based") return "condition_based";
  if (reasoningStyle === "intuition") return "intuition";
  if (reasoningStyle === "uncertainty") return "uncertainty";
  return "unclassified";
}

function getQuestionPhaseFromObservations(learnerCase: LearnerCase | null, questionObservations: ObservationEvent[]): QuestionPhase {
  if (!learnerCase) {
    return "stem";
  }

  if (questionObservations.length === 0) {
    return "stem";
  }

  if (questionObservations.length < learnerCase.statements.length) {
    return "statement";
  }

  return "final";
}

export function CoachWorkspace({ initialCase }: CoachWorkspaceProps) {
  const [learnerCase, setLearnerCase] = useState(initialCase);
  const [dailySession, setDailySession] = useState<DailySession | null>(null);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [observations, setObservations] = useState<ObservationEvent[]>([]);
  const [latestObservation, setLatestObservation] = useState<ObservationEvent | null>(null);
  const [dailyReview, setDailyReview] = useState<DailyReview | null>(null);
  const [tomorrowPlan, setTomorrowPlan] = useState<TomorrowPlan | null>(null);
  const [sessionActionStatus, setSessionActionStatus] = useState<"idle" | "starting" | "saving" | "advancing">("idle");
  const [reviewActionStatus, setReviewActionStatus] = useState<"idle" | "generating">("idle");
  const [planActionStatus, setPlanActionStatus] = useState<"idle" | "generating">("idle");
  const [learnerStepOverride, setLearnerStepOverride] = useState<LearnerStep | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [questionPhase, setQuestionPhase] = useState<QuestionPhase>("stem");
  const [currentStatementIndex, setCurrentStatementIndex] = useState(0);
  const [statementChoice, setStatementChoice] = useState<StatementChoice | null>(null);
  const [statementReason, setStatementReason] = useState("");
  const [finalChoice, setFinalChoice] = useState<number | null>(null);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const [queuedNextPayload, setQueuedNextPayload] = useState<DailySessionPayload | null>(null);

  const applyDailySessionPayload = useCallback((payload: DailySessionPayload) => {
    setDailySession(payload.session);
    setCurrentQuestionId(payload.currentQuestionId);
    setObservations(payload.observations);
    setLatestObservation(payload.latestObservation);
    setDailyReview(payload.dailyReview);
    setTomorrowPlan(payload.tomorrowPlan);

    if (payload.learnerCase) {
      setLearnerCase(payload.learnerCase);
    }
  }, []);

  const clearLearnerFlow = useCallback(() => {
    setDailySession(null);
    setCurrentQuestionId(null);
    setObservations([]);
    setLatestObservation(null);
    setDailyReview(null);
    setTomorrowPlan(null);
    setLearnerCase(initialCase);
    setErrorMessage(null);
    setLearnerStepOverride(null);
    setQuestionPhase("stem");
    setCurrentStatementIndex(0);
    setStatementChoice(null);
    setStatementReason("");
    setFinalChoice(null);
    setFinalResult(null);
    setQueuedNextPayload(null);
  }, [initialCase]);

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

  const currentQuestionObservations = useMemo(
    () => observations.filter((observation) => observation.question_id === currentQuestionId),
    [currentQuestionId, observations]
  );

  useEffect(() => {
    if (!currentQuestionId || dailySession?.status === "completed" || queuedNextPayload || finalResult) {
      return;
    }

    setQuestionPhase(getQuestionPhaseFromObservations(learnerCase, currentQuestionObservations));
    setCurrentStatementIndex(currentQuestionObservations.length);
    setStatementChoice(null);
    setStatementReason("");
    setFinalChoice(null);
  }, [
    currentQuestionId,
    currentQuestionObservations,
    dailySession?.status,
    finalResult,
    learnerCase,
    queuedNextPayload
  ]);

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
      setQuestionPhase("stem");
      setCurrentStatementIndex(0);
      setStatementChoice(null);
      setStatementReason("");
      setFinalChoice(null);
      setFinalResult(null);
      setQueuedNextPayload(null);
      applyDailySessionPayload(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSessionActionStatus("idle");
    }
  }, [applyDailySessionPayload]);

  const saveStatementObservation = useCallback(async () => {
    if (!dailySession || !currentQuestionId || !learnerCase || !statementChoice) {
      return;
    }

    const currentStatement = learnerCase.statements[currentStatementIndex];
    if (!currentStatement || statementReason.trim().length === 0) {
      return;
    }

    setSessionActionStatus("saving");
    setErrorMessage(null);

    try {
      const observation = buildStatementObservationInput({
        dailySessionId: dailySession.id,
        questionId: currentQuestionId,
        questionIndex: dailySession.current_index,
        statementIndex: currentStatementIndex + 1,
        statement: currentStatement,
        learnerChoice: statementChoice,
        learnerReason: statementReason
      });

      const response = await fetch("/api/daily-session/observation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          sessionId: dailySession.id,
          observation
        })
      });

      if (!response.ok) {
        throw new Error("Observation save failed.");
      }

      const payload = (await response.json()) as DailySessionPayload;
      applyDailySessionPayload(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSessionActionStatus("idle");
    }
  }, [
    applyDailySessionPayload,
    currentQuestionId,
    currentStatementIndex,
    dailySession,
    learnerCase,
    statementChoice,
    statementReason
  ]);

  const submitFinalAnswer = useCallback(async () => {
    if (!dailySession || !learnerCase || !currentQuestionId || !finalChoice) {
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
          sessionId: dailySession.id
        })
      });

      if (!response.ok) {
        throw new Error("Daily session advance failed.");
      }

      const payload = (await response.json()) as DailySessionPayload;
      setFinalResult({
        selectedIndex: finalChoice,
        correctIndex: learnerCase.correctStatementIndex,
        summary: learnerCase.finalSummary
      });
      setQuestionPhase("result");
      setQueuedNextPayload(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSessionActionStatus("idle");
    }
  }, [currentQuestionId, dailySession, finalChoice, learnerCase]);

  const proceedAfterResult = useCallback(() => {
    if (!queuedNextPayload) {
      return;
    }

    applyDailySessionPayload(queuedNextPayload);
    setQueuedNextPayload(null);
    setFinalResult(null);
    setQuestionPhase("stem");
    setCurrentStatementIndex(0);
    setStatementChoice(null);
    setStatementReason("");
    setFinalChoice(null);
    setLearnerStepOverride(null);
  }, [applyDailySessionPayload, queuedNextPayload]);

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
  const isQuestionStep = currentStep.startsWith("question-");
  const currentStatement = learnerCase.statements[currentStatementIndex] ?? null;
  const nextResultLabel =
    queuedNextPayload?.session.status === "completed" ? "今日のふりかえりへ" : "次の問題へ";

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
                  <p className="body-copy">今日は各問題を4つの肢に分けて観察し、最後にだけ全体回答します。</p>
                  <div className="reflection-box">Start Daily Session を押すと 1問目の問題文だけが表示されます。</div>
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

              {isQuestionStep ? (
                <>
                  <div className="panel-heading tight">
                    <span className="panel-kicker">{STEP_LABELS[currentStep]}</span>
                    <h3>{learnerCase.questionTitle}</h3>
                  </div>
                  <div className="question-meta-strip">
                    <span>
                      {activeQuestionNumber} / {totalQuestions}
                    </span>
                    <span>{learnerCase.theme}</span>
                  </div>
                  <p className="body-copy">{learnerCase.questionStem}</p>

                  {questionPhase === "stem" ? (
                    <>
                      <div className="prompt-card">
                        <span className="summary-label">Step 1</span>
                        <p>まずは問題文だけを確認します。まだ正解は選びません。</p>
                      </div>
                      <button
                        className="primary-button phone-button"
                        onClick={() => setQuestionPhase("statement")}
                        type="button"
                      >
                        肢1を見る
                      </button>
                    </>
                  ) : null}

                  {questionPhase === "statement" && currentStatement ? (
                    <>
                      <div className="prompt-card statement-card">
                        <span className="summary-label">肢{currentStatementIndex + 1}</span>
                        <p>{currentStatement.text}</p>
                      </div>
                      <div className="choice-list" role="radiogroup" aria-label={`肢${currentStatementIndex + 1}の判断`}>
                        {STATEMENT_OPTIONS.map((option) => (
                          <button
                            aria-checked={statementChoice === option.value}
                            className={`choice-card ${statementChoice === option.value ? "is-selected" : ""}`}
                            key={option.value}
                            onClick={() => setStatementChoice(option.value)}
                            role="radio"
                            type="button"
                          >
                            <span className="choice-marker" aria-hidden="true" />
                            <span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                      {statementChoice ? (
                        <section className="feedback-card feedback-card--caution">
                          <span className="feedback-eyebrow">Immediate Coach Feedback</span>
                          <h4>{FEEDBACK_BY_CHOICE[statementChoice].title}</h4>
                          <p>{FEEDBACK_BY_CHOICE[statementChoice].message}</p>
                          <label className="reason-label" htmlFor="statement-reason">
                            なぜそう思いましたか？
                          </label>
                          <textarea
                            className="reason-textarea"
                            id="statement-reason"
                            onChange={(event) => setStatementReason(event.target.value)}
                            placeholder="例: 3か月という数字を覚えていたため"
                            rows={3}
                            value={statementReason}
                          />
                          <button
                            className="primary-button phone-button"
                            onClick={() => void saveStatementObservation()}
                            type="button"
                            disabled={statementReason.trim().length === 0 || sessionActionStatus !== "idle"}
                          >
                            {sessionActionStatus === "saving" ? "記録中..." : "この理由を記録する"}
                          </button>
                        </section>
                      ) : null}
                    </>
                  ) : null}

                  {questionPhase === "final" ? (
                    <>
                      <div className="prompt-card final-choice-card">
                        <span className="summary-label">全4肢を表示</span>
                        <div className="statement-stack">
                          {learnerCase.statements.map((statement, index) => (
                            <div className="statement-stack-item" key={statement.id}>
                              <span className="statement-index">{index + 1}</span>
                              <p>{statement.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                      <p className="body-copy">ここまで考えてきました。では、どの肢が正しいと思いますか？</p>
                      <div className="final-choice-grid">
                        {learnerCase.statements.map((statement, index) => (
                          <button
                            className={`final-choice-button ${finalChoice === index + 1 ? "is-selected" : ""}`}
                            key={statement.id}
                            onClick={() => setFinalChoice(index + 1)}
                            type="button"
                          >
                            {index + 1}
                          </button>
                        ))}
                      </div>
                      <button
                        className="primary-button phone-button"
                        onClick={() => void submitFinalAnswer()}
                        type="button"
                        disabled={!finalChoice || sessionActionStatus !== "idle"}
                      >
                        {sessionActionStatus === "advancing" ? "送信中..." : "最終回答する"}
                      </button>
                    </>
                  ) : null}

                  {questionPhase === "result" && finalResult ? (
                    <>
                      <section className="feedback-card feedback-card--good">
                        <span className="feedback-eyebrow">Final Feedback</span>
                        <h4>正解は {finalResult.correctIndex} です。</h4>
                        <p>
                          あなたの最終回答は {finalResult.selectedIndex} でした。各肢の見方を下で整理します。
                        </p>
                      </section>
                      <div className="result-explanation-list">
                        {learnerCase.statements.map((statement, index) => (
                          <section className="result-explanation-card" key={statement.id}>
                            <div className="result-explanation-head">
                              <span>肢{index + 1}</span>
                              <strong>{statement.isCorrect ? "正しい" : "誤り"}</strong>
                            </div>
                            <p>{statement.explanation}</p>
                          </section>
                        ))}
                      </div>
                      <div className="reflection-box">{finalResult.summary}</div>
                      <button className="primary-button phone-button" onClick={proceedAfterResult} type="button">
                        {nextResultLabel}
                      </button>
                    </>
                  ) : null}
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
                      <p>各問題で4肢ずつ観察がそろいました。</p>
                      <p>ここで今日の思考傾向を短くまとめます。</p>
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
                      <p>今日の肢別観察をもとに、明日の練習を組み立てます。</p>
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
              <span>{observations.length} observations</span>
            </div>
          </div>
        </article>

        <article className="tablet-frame">
          <div className="device-scroll-shell coach-scroll-shell">
            <div className="panel-heading tight observation-stream-heading">
              <div>
                <span className="panel-kicker">AI Coach Mind</span>
                <h3>まだ判断せず、観察だけを積みます</h3>
                <p className="device-caption">{learnerCase.exam} / Statement-by-statement observation</p>
              </div>
              <span className="observation-count-pill">
                {dailySession ? `${observations.length} observations` : "0 observations"}
              </span>
            </div>
            <p className="observation-intro-copy">
              ○×の結果ではなく、各肢で何を根拠にし、どこで迷ったかを記録しています。
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
                    <p className="latest-observation-meta">
                      肢{latestObservation.statement_index ?? "-"} / {formatChoiceLabel(latestObservation.learner_choice)} /{" "}
                      {formatReasoningStyle(latestObservation.reasoning_style)}
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
                    <p>肢1から順に、右側へ静かに増えていきます。</p>
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
                          {observation.learner_reason ? (
                            <p className="observation-reason">理由: {observation.learner_reason}</p>
                          ) : null}
                          <div className="observation-meta-row">
                            <span>肢{observation.statement_index ?? "-"}</span>
                            <span>{formatChoiceLabel(observation.learner_choice)}</span>
                            <span>{formatReasoningStyle(observation.reasoning_style)}</span>
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
