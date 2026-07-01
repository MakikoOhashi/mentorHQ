"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildCoachConversation } from "@/lib/deliberation/coach-conversation";
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

type QuestionPhase = "stem" | "statement" | "statement-result" | "final" | "result";

type CorrectQuickFeedback = {
  mode: "correct";
  point: string;
};

type IncorrectConversation = {
  mode: "incorrect";
  messages?: Array<{ id: string; role: "learner" | "coach"; text: string }>;
  resolved?: boolean;
};

type StatementResult = CorrectQuickFeedback | IncorrectConversation;

type FinalResult = {
  selectedIndex: number;
  correctIndex: number;
  summary: string;
};

const MAX_VISIBLE_THOUGHTS = 12;
const THOUGHT_REVEAL_DELAY_MS = 280;

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

function getQuestionPhaseFromObservations(learnerCase: LearnerCase | null, questionObservations: ObservationEvent[]): QuestionPhase {
  const completedStatementCount = new Set(
    questionObservations
      .map((observation) => observation.statement_index)
      .filter((statementIndex): statementIndex is number => typeof statementIndex === "number")
  ).size;

  if (!learnerCase) {
    return "stem";
  }

  if (completedStatementCount === 0) {
    return "stem";
  }

  if (completedStatementCount < learnerCase.statements.length) {
    return "statement";
  }

  return "final";
}

function buildPointLine(statement: LearnerCase["statements"][number]): string {
  return statement.explanation.replace(/\s+/g, " ").trim();
}

function buildTranscriptNote(
  messages: Array<{ role: "learner" | "coach"; text: string }>,
  learnerMessage: string,
  coachReply: string
): string {
  const transcript = [
    ...messages.map((message) => `${message.role === "learner" ? "Learner" : "Coach"}: ${message.text}`),
    `Learner: ${learnerMessage}`,
    `Coach: ${coachReply}`
  ];
  return transcript.join("\n");
}

function buildImmediateCoaching(
  statement: LearnerCase["statements"][number],
  choice: StatementChoice
): StatementResult {
  const learnerMarkedCorrect = choice === "correct";
  const isRight = learnerMarkedCorrect === statement.isCorrect;

  if (isRight) {
    return {
      mode: "correct",
      point: buildPointLine(statement)
    };
  }

  return {
    mode: "incorrect",
    messages: [],
    resolved: false
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
  const [sessionActionStatus, setSessionActionStatus] = useState<"idle" | "starting" | "saving" | "advancing">("idle");
  const [reviewActionStatus, setReviewActionStatus] = useState<"idle" | "generating">("idle");
  const [planActionStatus, setPlanActionStatus] = useState<"idle" | "generating">("idle");
  const [learnerStepOverride, setLearnerStepOverride] = useState<LearnerStep | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [questionPhase, setQuestionPhase] = useState<QuestionPhase>("stem");
  const [currentStatementIndex, setCurrentStatementIndex] = useState(0);
  const [statementChoice, setStatementChoice] = useState<StatementChoice | null>(null);
  const [incorrectChatInput, setIncorrectChatInput] = useState("");
  const [finalChoice, setFinalChoice] = useState<number | null>(null);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
  const [submittedStatementResult, setSubmittedStatementResult] = useState<StatementResult | null>(null);
  const [queuedNextPayload, setQueuedNextPayload] = useState<DailySessionPayload | null>(null);
  const [visibleThoughtIds, setVisibleThoughtIds] = useState<string[]>([]);
  const revealTimeoutIdsRef = useRef<number[]>([]);

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
    setIncorrectChatInput("");
    setFinalChoice(null);
    setFinalResult(null);
    setSubmittedStatementResult(null);
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
  const completedStatementCount = useMemo(
    () =>
      new Set(
        currentQuestionObservations
          .map((observation) => observation.statement_index)
          .filter((statementIndex): statementIndex is number => typeof statementIndex === "number")
      ).size,
    [currentQuestionObservations]
  );

  const coachConversation = useMemo(() => buildCoachConversation(observations), [observations]);
  const visibleTurns = useMemo(
    () => coachConversation.filter((turn) => visibleThoughtIds.includes(turn.id)),
    [coachConversation, visibleThoughtIds]
  );
  const isCoachThinking =
    sessionActionStatus !== "idle" || reviewActionStatus === "generating" || planActionStatus === "generating";

  useEffect(() => {
    const nextIds = coachConversation.map((turn) => turn.id);

    setVisibleThoughtIds((current) => {
      const retainedIds = current.filter((id) => nextIds.includes(id)).slice(-MAX_VISIBLE_THOUGHTS);
      const knownIds = new Set(retainedIds);
      const appendedIds = nextIds.filter((id) => !knownIds.has(id));

      revealTimeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      revealTimeoutIdsRef.current = [];

      appendedIds.forEach((id, index) => {
        const timeoutId = window.setTimeout(() => {
          setVisibleThoughtIds((visible) => {
            if (visible.includes(id)) {
              return visible;
            }

            return [...visible, id].slice(-MAX_VISIBLE_THOUGHTS);
          });
        }, index * THOUGHT_REVEAL_DELAY_MS);

        revealTimeoutIdsRef.current.push(timeoutId);
      });

      return retainedIds;
    });

    return () => {
      revealTimeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      revealTimeoutIdsRef.current = [];
    };
  }, [coachConversation]);

  useEffect(() => {
    if (
      !currentQuestionId ||
      dailySession?.status === "completed" ||
      queuedNextPayload ||
      finalResult ||
      submittedStatementResult
    ) {
      return;
    }

    setQuestionPhase(getQuestionPhaseFromObservations(learnerCase, currentQuestionObservations));
    setCurrentStatementIndex(completedStatementCount);
    setStatementChoice(null);
    setIncorrectChatInput("");
    setFinalChoice(null);
  }, [
    completedStatementCount,
    currentQuestionId,
    currentQuestionObservations,
    dailySession?.status,
    finalResult,
    learnerCase,
    queuedNextPayload,
    submittedStatementResult
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
      setIncorrectChatInput("");
      setFinalChoice(null);
      setFinalResult(null);
      setSubmittedStatementResult(null);
      setQueuedNextPayload(null);
      applyDailySessionPayload(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSessionActionStatus("idle");
    }
  }, [applyDailySessionPayload]);

  const saveStatementObservation = useCallback(async (choice: StatementChoice) => {
    if (!dailySession || !currentQuestionId || !learnerCase) {
      return;
    }

    const currentStatement = learnerCase.statements[currentStatementIndex];
    if (!currentStatement) {
      return;
    }

    setSessionActionStatus("saving");
    setErrorMessage(null);
    setQuestionPhase("statement-result");
    setStatementChoice(choice);

    try {
      const observation = buildStatementObservationInput({
        dailySessionId: dailySession.id,
        questionId: currentQuestionId,
        questionIndex: dailySession.current_index,
        statementIndex: currentStatementIndex + 1,
        statement: currentStatement,
        learnerChoice: choice
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
      setSubmittedStatementResult(buildImmediateCoaching(currentStatement, choice));
      applyDailySessionPayload(payload);
    } catch (error) {
      setSubmittedStatementResult(null);
      setQuestionPhase("statement");
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSessionActionStatus("idle");
    }
  }, [
    applyDailySessionPayload,
    currentQuestionId,
    currentStatementIndex,
    dailySession,
    learnerCase
  ]);

  const proceedAfterStatementResult = useCallback(() => {
    setSubmittedStatementResult(null);
    setCurrentStatementIndex(completedStatementCount);
    setStatementChoice(null);
    setIncorrectChatInput("");
    setFinalChoice(null);
    setQuestionPhase(getQuestionPhaseFromObservations(learnerCase, currentQuestionObservations));
  }, [completedStatementCount, currentQuestionObservations, learnerCase]);

  const sendIncorrectCoachingMessage = useCallback(async () => {
    const statementForChat = learnerCase.statements[currentStatementIndex] ?? null;

    if (
      !dailySession ||
      !currentQuestionId ||
      !statementForChat ||
      !statementChoice ||
      !submittedStatementResult ||
      submittedStatementResult.mode !== "incorrect"
    ) {
      return;
    }

    const learnerMessage = incorrectChatInput.trim();
    if (!learnerMessage) {
      return;
    }

    const existingMessages = submittedStatementResult.messages ?? [];

    setSessionActionStatus("saving");
    setErrorMessage(null);

    try {
      const learnerChatResponse = await fetch("/api/learner-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currentQuestion: {
            exam: learnerCase.exam,
            theme: learnerCase.theme,
            questionTitle: learnerCase.questionTitle,
            questionStem: learnerCase.questionStem,
            statements: learnerCase.statements
          },
          currentStatement: statementForChat,
          statementExplanation: buildPointLine(statementForChat),
          learnerMessage,
          chatHistory: existingMessages
        })
      });

      if (!learnerChatResponse.ok) {
        throw new Error("Learner chat failed.");
      }

      const learnerChatPayload = (await learnerChatResponse.json()) as {
        reply?: string;
      };
      const replyText = learnerChatPayload.reply?.trim();

      if (!replyText) {
        throw new Error("Learner chat returned empty reply.");
      }

      const observation = buildStatementObservationInput({
        dailySessionId: dailySession.id,
        questionId: currentQuestionId,
        questionIndex: dailySession.current_index,
        statementIndex: currentStatementIndex + 1,
        statement: statementForChat,
        learnerChoice: statementChoice,
        learnerReason: learnerMessage,
        learnerNote: buildTranscriptNote(existingMessages, learnerMessage, replyText)
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
      setSubmittedStatementResult((current) =>
        current && current.mode === "incorrect"
          ? {
              ...current,
              messages: [
                ...existingMessages,
                { id: `${Date.now()}-learner`, role: "learner", text: learnerMessage },
                { id: `${Date.now()}-coach`, role: "coach", text: replyText }
              ],
              resolved: false
            }
          : current
      );
      setIncorrectChatInput("");
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
    incorrectChatInput,
    learnerCase,
    statementChoice,
    submittedStatementResult
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
    setIncorrectChatInput("");
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
          <div className="phone-hardware">
            <div className="phone-island" aria-hidden="true" />
            <div className="device-scroll-shell phone-screen">
            <div className="simulator-status-bar phone-simulator-status" aria-hidden="true">
              <span className="simulator-time">9:41</span>
              <div className="simulator-status-icons">
                <span className="simulator-signal">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span className="simulator-wifi">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="simulator-battery">
                  <span className="simulator-battery-level" />
                </span>
              </div>
            </div>
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
                <div className="phone-title-group">
                  <p className="phone-app-label">MentorHQ</p>
                  <p className="phone-app-name">Student</p>
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
                            onClick={() => void saveStatementObservation(option.value)}
                            role="radio"
                            type="button"
                            disabled={sessionActionStatus !== "idle"}
                          >
                            <span className="choice-marker" aria-hidden="true" />
                            <span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : null}

                  {questionPhase === "statement-result" ? (
                    sessionActionStatus === "saving" ? (
                      <div className="feedback-next-hint">考えています...</div>
                    ) : submittedStatementResult ? (
                      submittedStatementResult.mode === "correct" ? (
                        <section className="feedback-card feedback-card--good">
                          <p>✓ 正解</p>
                          <p>ポイント</p>
                          <p className="feedback-point-text">{submittedStatementResult.point}</p>
                          <div className="feedback-action-stack">
                            <button className="primary-button phone-button" onClick={proceedAfterStatementResult} type="button">
                              {completedStatementCount >= learnerCase.statements.length ? "全体回答へ進む" : "次の肢へ進む"}
                            </button>
                          </div>
                        </section>
                      ) : (
                        <section className="feedback-card feedback-card--caution">
                          <p>❌</p>
                          <p>今回はここだけ違いました。</p>
                          <p>ポイント</p>
                          <p className="feedback-point-text">{currentStatement ? buildPointLine(currentStatement) : ""}</p>
                          <p>気になることがあれば聞いてください。</p>
                          <div className="coaching-chat-list">
                            {(submittedStatementResult.messages ?? []).map((message) => (
                              <div className={`coaching-chat-bubble is-${message.role}`} key={message.id}>
                                <p>{message.text}</p>
                              </div>
                            ))}
                          </div>
                          <textarea
                            className="reason-textarea"
                            onChange={(event) => setIncorrectChatInput(event.target.value)}
                            placeholder="気になった点を入力してください"
                            rows={3}
                            value={incorrectChatInput}
                          />
                          <button
                            className="primary-button phone-button"
                            onClick={() => void sendIncorrectCoachingMessage()}
                            type="button"
                            disabled={sessionActionStatus !== "idle" || incorrectChatInput.trim().length === 0}
                          >
                            送る
                          </button>
                          <div className="feedback-action-stack">
                            <button className="secondary-button phone-button" onClick={proceedAfterStatementResult} type="button">
                              {completedStatementCount >= learnerCase.statements.length ? "全体回答へ進む" : "次の肢へ進む"}
                            </button>
                          </div>
                        </section>
                      )
                    ) : null
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
                          あなたの最終回答は {finalResult.selectedIndex} でした。ここまで各肢を確認してきたので、最後にもう一度整理します。
                        </p>
                      </section>
                      <div className="result-explanation-list">
                        {learnerCase.statements.map((statement, index) => (
                          <section className="result-explanation-card" key={statement.id}>
                            <div className="result-explanation-head">
                              <span>肢{index + 1}</span>
                              <strong>{statement.isCorrect ? "○" : "×"}</strong>
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
          </div>
        </article>

        <article className="tablet-frame">
          <div className="tablet-bezel">
            <div className="tablet-camera" aria-hidden="true" />
            <div className="device-scroll-shell coach-scroll-shell tablet-screen">
            <div className="simulator-status-bar tablet-simulator-status" aria-hidden="true">
              <span className="simulator-time">9:41</span>
              <div className="simulator-status-icons">
                <span className="simulator-wifi">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="simulator-battery">
                  <span className="simulator-battery-level" />
                </span>
              </div>
            </div>
            <div className="panel-heading tight observation-stream-heading">
              <div>
                <span className="panel-kicker">AI Coach Mind</span>
                <h3>Live Thought Stream</h3>
                <p className="device-caption">仮説が少しずつ更新されるライブ会話です。</p>
              </div>
              <div className="thought-stream-meta">
                <span className={`thinking-pill ${isCoachThinking ? "is-active" : ""}`}>Thinking...</span>
                <span className="observation-count-pill">
                  {dailySession ? `${visibleTurns.length}/${MAX_VISIBLE_THOUGHTS}` : `0/${MAX_VISIBLE_THOUGHTS}`}
                </span>
              </div>
            </div>

            <div className="observation-stream-viewport">
              <div className="observation-list coach-thought-list">
                {visibleTurns.length === 0 ? (
                  <div className="observation-empty-state">
                    <p>Thinking...</p>
                    <p>肢の回答後にライブ会話が始まります。</p>
                  </div>
                ) : (
                  visibleTurns.map((turn, index) => {
                      const isLatestThought =
                        turn.source_observation_id === latestObservation?.id && index === visibleTurns.length - 1;

                      return (
                        <section
                          className={`mind-entry chat-row ${
                            isLatestThought ? "is-latest-observation" : ""
                          } stream-depth-${Math.min(visibleTurns.length - 1 - index, 4)}`}
                          key={turn.id}
                        >
                          <p className="mind-log-speaker">{turn.speakerLabel}</p>
                          <p className="mind-log-line">{turn.text}</p>
                        </section>
                      );
                    })
                )}
              </div>
            </div>
          </div>
          </div>
        </article>
      </section>
    </main>
  );
}
