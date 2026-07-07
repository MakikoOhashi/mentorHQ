"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { buildStatementObservationInput } from "@/lib/deliberation/observation";
import type {
  CoachMindResponse,
  CoachMindTurn,
  DailyReview,
  DailySession,
  LearnerCase,
  ObservationEvent,
  ObservationEventInput,
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

type LocalObservationStatus = "pending" | "failed";

type LocalObservationEvent = ObservationEvent & {
  optimistic_status?: LocalObservationStatus;
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

type ReviewConsensusTurn = {
  id: string;
  speakerLabel: string;
  text: string;
};

type ConsensusMode = "review" | "tomorrow";

type FinalResult = {
  selectedIndex: number;
  correctIndex: number;
  summary: string;
};

const MAX_VISIBLE_THOUGHTS = 12;
const THOUGHT_REVEAL_DELAY_MS = 280;
const COACH_MIND_REVEAL_DELAY_MS = 750;
const REVIEW_CONSENSUS_REVEAL_DELAY_MS = 420;
const REVIEW_CONSENSUS_SETTLE_DELAY_MS = 520;

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

const QUESTION_PHASE_RANK: Record<QuestionPhase, number> = {
  stem: 0,
  statement: 1,
  "statement-result": 2,
  final: 3,
  result: 4
};

function getStatementChoiceLabel(choice: StatementChoice | null): string {
  if (choice === "correct") {
    return "○ 正しい";
  }

  if (choice === "incorrect") {
    return "× 誤り";
  }

  return "未回答";
}

function getCorrectnessLabel(isCorrect: boolean): string {
  return isCorrect ? "○ 正しい" : "× 誤り";
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

function getForwardQuestionPhase(current: QuestionPhase, next: QuestionPhase): QuestionPhase {
  return QUESTION_PHASE_RANK[next] < QUESTION_PHASE_RANK[current] ? current : next;
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

function buildOptimisticObservation(id: string, observation: ObservationEventInput): LocalObservationEvent {
  return {
    id,
    daily_session_id: observation.daily_session_id,
    question_id: observation.question_id,
    question_index: observation.question_index,
    statement_index: observation.statement_index ?? null,
    learner_choice: observation.learner_choice ?? null,
    correct_or_wrong: observation.correct_or_wrong ?? null,
    learner_reason: observation.learner_reason ?? null,
    reasoning_style: observation.reasoning_style ?? null,
    intervention_type: observation.intervention_type,
    misunderstanding_type: observation.misunderstanding_type,
    answer_signal_score: observation.answer_signal_score,
    observation_note: observation.observation_note ?? observation.note,
    note: observation.note,
    created_at: new Date().toISOString(),
    optimistic_status: "pending"
  };
}

function markOptimisticObservationFailed(
  observations: LocalObservationEvent[],
  tempObservationId: string
): LocalObservationEvent[] {
  return observations.map((observation) =>
    observation.id === tempObservationId
      ? {
          ...observation,
          optimistic_status: "failed"
        }
      : observation
  );
}

function mergeSavedObservation(
  current: LocalObservationEvent[],
  tempObservationId: string,
  savedObservations: ObservationEvent[]
): LocalObservationEvent[] {
  const savedIds = new Set(savedObservations.map((observation) => observation.id));
  const withoutTemp = current.filter((observation) => observation.id !== tempObservationId && !savedIds.has(observation.id));
  return [...withoutTemp, ...savedObservations];
}

function remapCoachMindTurnObservationIds(
  turns: CoachMindTurn[],
  tempObservationId: string,
  savedObservationId: string
): CoachMindTurn[] {
  return turns.map((turn) =>
    turn.source_observation_id === tempObservationId
      ? {
          ...turn,
          id: turn.id.replace(tempObservationId, savedObservationId),
          source_observation_id: savedObservationId
        }
      : turn
  );
}

function remapVisibleThoughtIds(
  visibleIds: string[],
  tempObservationId: string,
  savedObservationId: string
): string[] {
  return visibleIds.map((id) => id.replace(tempObservationId, savedObservationId));
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

function buildReviewConsensusTurns(): ReviewConsensusTurn[] {
  return [
    {
      id: "review-reading",
      speakerLabel: "Reading",
      text: "今日の Observation は十分集まりました。"
    },
    {
      id: "review-memory",
      speakerLabel: "Memory",
      text: "今日の Observation を過去と比較しています。"
    },
    {
      id: "review-pattern",
      speakerLabel: "Pattern",
      text: "今日の理解の変化を整理しています。"
    },
    {
      id: "review-review",
      speakerLabel: "Review",
      text: "今日の学習ポイントをまとめます。"
    },
    {
      id: "review-consensus",
      speakerLabel: "Consensus",
      text: "Daily Review を学習者へ送ります。"
    }
  ];
}

function buildTomorrowConsensusTurns(): ReviewConsensusTurn[] {
  return [
    {
      id: "tomorrow-reading",
      speakerLabel: "Reading",
      text: "今日の Review をもとに、明日の重点を整理します。"
    },
    {
      id: "tomorrow-memory",
      speakerLabel: "Memory",
      text: "Observation と今日の Review を確認します。"
    },
    {
      id: "tomorrow-pattern",
      speakerLabel: "Pattern",
      text: "明日の練習テーマを絞ります。"
    },
    {
      id: "tomorrow-review",
      speakerLabel: "Review",
      text: "Tomorrow Plan をまとめます。"
    },
    {
      id: "tomorrow-consensus",
      speakerLabel: "Consensus",
      text: "Tomorrow Plan を学習者へ送ります。"
    }
  ];
}


export function CoachWorkspace({ initialCase }: CoachWorkspaceProps) {
  const [learnerCase, setLearnerCase] = useState(initialCase);
  const [dailySession, setDailySession] = useState<DailySession | null>(null);
  const [currentQuestionId, setCurrentQuestionId] = useState<string | null>(null);
  const [observations, setObservations] = useState<LocalObservationEvent[]>([]);
  const [latestObservation, setLatestObservation] = useState<LocalObservationEvent | null>(null);
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
  const [coachMindTurns, setCoachMindTurns] = useState<CoachMindTurn[]>([]);
  const [coachMindStatus, setCoachMindStatus] = useState<"idle" | "generating" | "error">("idle");
  const [reviewConsensusTurns, setReviewConsensusTurns] = useState<ReviewConsensusTurn[]>([]);
  const [visibleReviewConsensusIds, setVisibleReviewConsensusIds] = useState<string[]>([]);
  const [reviewConsensusStatus, setReviewConsensusStatus] = useState<"idle" | "running" | "complete">("idle");
  const [consensusMode, setConsensusMode] = useState<ConsensusMode | null>(null);
  const revealTimeoutIdsRef = useRef<number[]>([]);
  const reviewConsensusTimeoutIdsRef = useRef<number[]>([]);
  const coachMindRevealTimeoutIdsRef = useRef<number[]>([]);
  const coachMindRevealGenerationRef = useRef(0);
  const generatedThoughtObservationIdsRef = useRef<Set<string>>(new Set());
  const generatingThoughtObservationIdsRef = useRef<Set<string>>(new Set());
  const failedOptimisticObservationIdsRef = useRef<Set<string>>(new Set());
  const optimisticObservationIdMapRef = useRef<Map<string, string>>(new Map());
  const coachMindTurnsRef = useRef<CoachMindTurn[]>([]);
  const previousSessionIdRef = useRef<string | null>(null);

  const clearCoachMindRevealQueue = useCallback(() => {
    coachMindRevealTimeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    coachMindRevealTimeoutIdsRef.current = [];
  }, []);

  const bumpCoachMindRevealGeneration = useCallback(() => {
    coachMindRevealGenerationRef.current += 1;
    clearCoachMindRevealQueue();
    return coachMindRevealGenerationRef.current;
  }, [clearCoachMindRevealQueue]);

  const enqueueCoachMindTurns = useCallback(
    (turns: CoachMindTurn[], generationId: number) => {
      if (turns.length === 0) {
        return;
      }

      turns.forEach((turn, index) => {
        const timeoutId = window.setTimeout(() => {
          if (coachMindRevealGenerationRef.current !== generationId) {
            return;
          }

          setCoachMindTurns((current) => [...current, turn]);
          coachMindTurnsRef.current = [...coachMindTurnsRef.current, turn];

          if (index === turns.length - 1) {
            setCoachMindStatus(generatingThoughtObservationIdsRef.current.size > 0 ? "generating" : "idle");
          }
        }, index * COACH_MIND_REVEAL_DELAY_MS);

        coachMindRevealTimeoutIdsRef.current.push(timeoutId);
      });
    },
    []
  );

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

  const generateCoachMindForObservation = useCallback(
    async (observation: LocalObservationEvent, sourceObservations: LocalObservationEvent[]) => {
      if (
        observation.optimistic_status === "failed" ||
        failedOptimisticObservationIdsRef.current.has(observation.id) ||
        generatedThoughtObservationIdsRef.current.has(observation.id) ||
        generatingThoughtObservationIdsRef.current.has(observation.id)
      ) {
        console.info("[coach-mind][ui] generation skipped", {
          observationId: observation.id,
          optimisticStatus: observation.optimistic_status ?? "saved"
        });
        return;
      }

      const observationIndex = sourceObservations.findIndex((candidate) => candidate.id === observation.id);
      const recentObservations =
        observationIndex >= 0
          ? sourceObservations.slice(Math.max(0, observationIndex - 4), observationIndex + 1)
          : [observation];

      generatingThoughtObservationIdsRef.current.add(observation.id);
      setCoachMindStatus("generating");

      console.info("[coach-mind][ui] generation started", {
        observationId: observation.id,
        optimisticStatus: observation.optimistic_status ?? "saved",
        recentObservationCount: recentObservations.length
      });

      try {
        const requestPayload = {
          latestObservation: observation,
          recentObservations,
          existingThoughts: coachMindTurnsRef.current.slice(-8).map((turn) => ({
            speaker: turn.speaker,
            speakerLabel: turn.speakerLabel,
            text: turn.text
          }))
        };

        console.info("[coach-mind][ui] request", {
          latestObservationId: requestPayload.latestObservation.id,
          recentObservationIds: requestPayload.recentObservations.map((item) => item.id),
          existingThoughtCount: requestPayload.existingThoughts.length
        });

        const response = await fetch("/api/coach-mind", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestPayload)
        });

        console.info("[coach-mind][ui] response", {
          observationId: observation.id,
          ok: response.ok,
          status: response.status
        });

        if (!response.ok) {
          throw new Error("Coach mind generation failed.");
        }

        const payload = (await response.json()) as CoachMindResponse;
        const sourceObservationId = optimisticObservationIdMapRef.current.get(observation.id) ?? observation.id;
        const nextTurns = payload.turns.map((turn, index) => ({
          ...turn,
          id: `${sourceObservationId}-${turn.speaker}-${index}`,
          source_observation_id: sourceObservationId
        })) satisfies CoachMindTurn[];

        if (failedOptimisticObservationIdsRef.current.has(observation.id)) {
          generatingThoughtObservationIdsRef.current.delete(observation.id);
          console.warn("[coach-mind][ui] response ignored for failed optimistic observation", {
            observationId: observation.id
          });
          setCoachMindStatus(generatingThoughtObservationIdsRef.current.size > 0 ? "generating" : "error");
          return;
        }

        console.info("[coach-mind][ui] turns ready", {
          observationId: observation.id,
          sourceObservationId,
          turnCount: nextTurns.length
        });

      generatedThoughtObservationIdsRef.current.add(observation.id);
      generatedThoughtObservationIdsRef.current.add(sourceObservationId);
      generatingThoughtObservationIdsRef.current.delete(observation.id);
        const generationId = bumpCoachMindRevealGeneration();
        enqueueCoachMindTurns(nextTurns, generationId);
      } catch (error) {
        generatingThoughtObservationIdsRef.current.delete(observation.id);
        console.error("[coach-mind][ui] generation failed", {
          observationId: observation.id,
          error
        });
        setCoachMindStatus(generatingThoughtObservationIdsRef.current.size > 0 ? "generating" : "error");
      }
    },
    [bumpCoachMindRevealGeneration, enqueueCoachMindTurns]
  );

  const appendOptimisticObservation = useCallback((observation: ObservationEventInput): LocalObservationEvent => {
    const tempObservationId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticObservation = buildOptimisticObservation(tempObservationId, observation);

    failedOptimisticObservationIdsRef.current.delete(tempObservationId);
    setCoachMindStatus("generating");
    setObservations((current) => [...current, optimisticObservation]);
    setLatestObservation(optimisticObservation);

    console.info("[coach-mind][ui] optimistic observation appended", {
      observationId: tempObservationId,
      questionId: observation.question_id,
      statementIndex: observation.statement_index
    });

    return optimisticObservation;
  }, []);

  const reconcileOptimisticObservation = useCallback((tempObservationId: string, payload: DailySessionPayload) => {
    const savedObservation = payload.latestObservation ?? payload.observations.at(-1) ?? null;
    const tempWasQueued =
      generatedThoughtObservationIdsRef.current.has(tempObservationId) ||
      generatingThoughtObservationIdsRef.current.has(tempObservationId);

    if (savedObservation && tempWasQueued) {
      optimisticObservationIdMapRef.current.set(tempObservationId, savedObservation.id);
      generatedThoughtObservationIdsRef.current.add(savedObservation.id);
      coachMindTurnsRef.current = remapCoachMindTurnObservationIds(
        coachMindTurnsRef.current,
        tempObservationId,
        savedObservation.id
      );
      setCoachMindTurns((current) => remapCoachMindTurnObservationIds(current, tempObservationId, savedObservation.id));
      setVisibleThoughtIds((current) => remapVisibleThoughtIds(current, tempObservationId, savedObservation.id));
    }

    setDailySession(payload.session);
    setCurrentQuestionId(payload.currentQuestionId);
    setObservations((current) => mergeSavedObservation(current, tempObservationId, payload.observations));
    setLatestObservation(savedObservation);
    setDailyReview(payload.dailyReview);
    setTomorrowPlan(payload.tomorrowPlan);

    if (payload.learnerCase) {
      setLearnerCase(payload.learnerCase);
    }
  }, []);

  const failOptimisticObservation = useCallback((tempObservationId: string) => {
    failedOptimisticObservationIdsRef.current.add(tempObservationId);
    generatingThoughtObservationIdsRef.current.delete(tempObservationId);
    setCoachMindStatus(generatingThoughtObservationIdsRef.current.size > 0 ? "generating" : "error");
    setObservations((current) => markOptimisticObservationFailed(current, tempObservationId));
    setLatestObservation((current) =>
      current?.id === tempObservationId
        ? {
            ...current,
            optimistic_status: "failed"
          }
        : current
    );
  }, []);

  const clearLearnerFlow = useCallback(() => {
    bumpCoachMindRevealGeneration();
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
    setCoachMindTurns([]);
    setCoachMindStatus("idle");
    setVisibleThoughtIds([]);
    setReviewConsensusTurns([]);
    setVisibleReviewConsensusIds([]);
    setReviewConsensusStatus("idle");
    setConsensusMode(null);
    generatedThoughtObservationIdsRef.current = new Set();
    generatingThoughtObservationIdsRef.current = new Set();
    failedOptimisticObservationIdsRef.current = new Set();
    optimisticObservationIdMapRef.current = new Map();
    coachMindTurnsRef.current = [];
  }, [bumpCoachMindRevealGeneration, initialCase]);

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
    () =>
      observations.filter(
        (observation) => observation.question_id === currentQuestionId && observation.optimistic_status !== "failed"
      ),
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

  const visibleTurns = useMemo(
    () => coachMindTurns.filter((turn) => visibleThoughtIds.includes(turn.id)),
    [coachMindTurns, visibleThoughtIds]
  );
  const visibleReviewConsensusTurns = useMemo(
    () => reviewConsensusTurns.filter((turn) => visibleReviewConsensusIds.includes(turn.id)),
    [reviewConsensusTurns, visibleReviewConsensusIds]
  );
  const isCoachThinking =
    sessionActionStatus !== "idle" ||
    reviewActionStatus === "generating" ||
    planActionStatus === "generating" ||
    coachMindStatus === "generating";

  useEffect(() => {
    coachMindTurnsRef.current = coachMindTurns;
  }, [coachMindTurns]);

  useEffect(() => {
    const nextSessionId = dailySession?.id ?? null;

    if (previousSessionIdRef.current === null) {
      previousSessionIdRef.current = nextSessionId;
      return;
    }

    if (previousSessionIdRef.current !== nextSessionId) {
      previousSessionIdRef.current = nextSessionId;
      bumpCoachMindRevealGeneration();
      setCoachMindTurns([]);
      setCoachMindStatus("idle");
      setVisibleThoughtIds([]);
      setReviewConsensusTurns([]);
      setVisibleReviewConsensusIds([]);
      setReviewConsensusStatus("idle");
      setConsensusMode(null);
      generatedThoughtObservationIdsRef.current = new Set();
      generatingThoughtObservationIdsRef.current = new Set();
      failedOptimisticObservationIdsRef.current = new Set();
      optimisticObservationIdMapRef.current = new Map();
      coachMindTurnsRef.current = [];
    }
  }, [bumpCoachMindRevealGeneration, dailySession?.id]);

  useEffect(() => {
    const nextIds = coachMindTurns.map((turn) => turn.id);

    setVisibleThoughtIds((current) => {
      const retainedIds = current.filter((id) => nextIds.includes(id));
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

            return [...visible, id];
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
  }, [coachMindTurns]);

  useEffect(() => {
    const nextIds = reviewConsensusTurns.map((turn) => turn.id);

    setVisibleReviewConsensusIds((current) => {
      const retainedIds = current.filter((id) => nextIds.includes(id));
      const knownIds = new Set(retainedIds);
      const appendedIds = nextIds.filter((id) => !knownIds.has(id));

      reviewConsensusTimeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      reviewConsensusTimeoutIdsRef.current = [];

      appendedIds.forEach((id, index) => {
        const timeoutId = window.setTimeout(() => {
          setVisibleReviewConsensusIds((visible) => {
            if (visible.includes(id)) {
              return visible;
            }

            return [...visible, id];
          });
        }, index * REVIEW_CONSENSUS_REVEAL_DELAY_MS);

        reviewConsensusTimeoutIdsRef.current.push(timeoutId);
      });

      return retainedIds;
    });

    return () => {
      reviewConsensusTimeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      reviewConsensusTimeoutIdsRef.current = [];
    };
  }, [reviewConsensusTurns]);

  useEffect(() => {
    if (observations.length === 0) {
      bumpCoachMindRevealGeneration();
      setCoachMindTurns([]);
      setCoachMindStatus("idle");
      generatedThoughtObservationIdsRef.current = new Set();
      generatingThoughtObservationIdsRef.current = new Set();
      failedOptimisticObservationIdsRef.current = new Set();
      optimisticObservationIdMapRef.current = new Map();
      coachMindTurnsRef.current = [];
      return;
    }
  }, [bumpCoachMindRevealGeneration, observations.length]);

  useEffect(() => {
    if (!currentQuestionId || dailySession?.status === "completed") {
      return;
    }

    setQuestionPhase("stem");
    setCurrentStatementIndex(completedStatementCount);
    setStatementChoice(null);
    setIncorrectChatInput("");
    setFinalChoice(null);
  }, [
    currentQuestionId,
    dailySession?.status
  ]);

  useEffect(() => {
    if (
      !currentQuestionId ||
      dailySession?.status === "completed" ||
      queuedNextPayload ||
      finalResult ||
      submittedStatementResult ||
      sessionActionStatus !== "idle" ||
      questionPhase === "statement-result"
    ) {
      return;
    }

    const nextPhase = getQuestionPhaseFromObservations(learnerCase, currentQuestionObservations);
    setQuestionPhase((current) => getForwardQuestionPhase(current, nextPhase));
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
    questionPhase,
    queuedNextPayload,
    sessionActionStatus,
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

    let optimisticObservation: LocalObservationEvent | null = null;

    try {
      const observation = buildStatementObservationInput({
        dailySessionId: dailySession.id,
        questionId: currentQuestionId,
        questionIndex: dailySession.current_index,
        statementIndex: currentStatementIndex + 1,
        statement: currentStatement,
        learnerChoice: choice
      });

      optimisticObservation = appendOptimisticObservation(observation);
      console.info("[coach-mind][ui] submit starting coach mind generation", {
        observationId: optimisticObservation.id
      });
      void generateCoachMindForObservation(optimisticObservation, [...observations, optimisticObservation]);

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
      reconcileOptimisticObservation(optimisticObservation.id, payload);
    } catch (error) {
      if (optimisticObservation) {
        failOptimisticObservation(optimisticObservation.id);
      }
      setSubmittedStatementResult(null);
      setQuestionPhase("statement");
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSessionActionStatus("idle");
    }
  }, [
    appendOptimisticObservation,
    currentQuestionId,
    currentStatementIndex,
    dailySession,
    failOptimisticObservation,
    generateCoachMindForObservation,
    observations,
    reconcileOptimisticObservation,
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

    let optimisticObservation: LocalObservationEvent | null = null;

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
        learnerNote: buildTranscriptNote(existingMessages, learnerMessage, replyText)
      });

      optimisticObservation = appendOptimisticObservation(observation);
      console.info("[coach-mind][ui] chat submit starting coach mind generation", {
        observationId: optimisticObservation.id
      });
      void generateCoachMindForObservation(optimisticObservation, [...observations, optimisticObservation]);

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
      reconcileOptimisticObservation(optimisticObservation.id, payload);
    } catch (error) {
      if (optimisticObservation) {
        failOptimisticObservation(optimisticObservation.id);
      }
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setSessionActionStatus("idle");
    }
  }, [
    appendOptimisticObservation,
    currentQuestionId,
    currentStatementIndex,
    dailySession,
    failOptimisticObservation,
    generateCoachMindForObservation,
    incorrectChatInput,
    learnerCase,
    observations,
    reconcileOptimisticObservation,
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

    const consensusTurns = buildReviewConsensusTurns();

    setReviewActionStatus("generating");
    setReviewConsensusStatus("running");
    setConsensusMode("review");
    setReviewConsensusTurns(consensusTurns);
    setVisibleReviewConsensusIds([]);
    setErrorMessage(null);

    try {
      const revealDuration =
        (consensusTurns.length - 1) * REVIEW_CONSENSUS_REVEAL_DELAY_MS + REVIEW_CONSENSUS_SETTLE_DELAY_MS;
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
      applyDailySessionPayload({
        ...payload,
        dailyReview: null
      });
      setLearnerStepOverride("review");
      await new Promise((resolve) => window.setTimeout(resolve, revealDuration));
      setDailyReview(payload.dailyReview);
      setReviewConsensusStatus("complete");
    } catch (error) {
      setReviewConsensusTurns([]);
      setVisibleReviewConsensusIds([]);
      setReviewConsensusStatus("idle");
      setConsensusMode(null);
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

    const consensusTurns = buildTomorrowConsensusTurns();

    setPlanActionStatus("generating");
    setReviewConsensusStatus("running");
    setConsensusMode("tomorrow");
    setReviewConsensusTurns(consensusTurns);
    setVisibleReviewConsensusIds([]);
    setErrorMessage(null);

    try {
      const revealDuration =
        (consensusTurns.length - 1) * REVIEW_CONSENSUS_REVEAL_DELAY_MS + REVIEW_CONSENSUS_SETTLE_DELAY_MS;
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
      applyDailySessionPayload({
        ...payload,
        tomorrowPlan: null
      });
      setLearnerStepOverride("tomorrow");
      await new Promise((resolve) => window.setTimeout(resolve, revealDuration));
      setTomorrowPlan(payload.tomorrowPlan);
      setReviewConsensusStatus("complete");
    } catch (error) {
      setReviewConsensusTurns([]);
      setVisibleReviewConsensusIds([]);
      setReviewConsensusStatus("idle");
      setConsensusMode(null);
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setPlanActionStatus("idle");
    }
  }, [applyDailySessionPayload, dailySession]);

  const derivedStep = getCurrentStep(dailySession, tomorrowPlan);
  const currentStep = learnerStepOverride ?? derivedStep;
  const isReviewConsensusActive =
    (currentStep === "review" || currentStep === "tomorrow") && reviewConsensusStatus !== "idle";
  const currentStepIndex = STEP_ORDER.indexOf(currentStep);
  const activeQuestionNumber =
    dailySession && dailySession.status !== "completed" ? dailySession.current_index + 1 : null;
  const totalQuestions = dailySession?.question_ids.length ?? 3;
  const completedQuestionCount = dailySession
    ? Math.min(dailySession.current_index, dailySession.question_ids.length)
    : 0;
  const isQuestionStep = currentStep.startsWith("question-");
  const currentStatement = learnerCase.statements[currentStatementIndex] ?? null;
  const answeredChoiceLabel = getStatementChoiceLabel(statementChoice);
  const correctChoiceLabel = currentStatement ? getCorrectnessLabel(currentStatement.isCorrect) : "";
  const nextResultLabel =
    queuedNextPayload?.session.status === "completed" ? "今日のふりかえりへ" : "次の問題へ";
  const displayedThoughtCount = isReviewConsensusActive ? visibleReviewConsensusTurns.length : visibleTurns.length;
  const displayedThoughtLimit = isReviewConsensusActive ? reviewConsensusTurns.length : coachMindTurns.length || MAX_VISIBLE_THOUGHTS;

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
                          {currentStatement ? (
                            <div className="feedback-statement-context">
                              <span className="summary-label">肢{currentStatementIndex + 1}</span>
                              <p className="feedback-statement-text">{currentStatement.text}</p>
                              <div className="feedback-context-chips">
                                <span className="feedback-chip">あなたの回答: {answeredChoiceLabel}</span>
                                <span className="feedback-chip">正しい判定: {correctChoiceLabel}</span>
                              </div>
                            </div>
                          ) : null}
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
                          {currentStatement ? (
                            <div className="feedback-statement-context">
                              <span className="summary-label">肢{currentStatementIndex + 1}</span>
                              <p className="feedback-statement-text">{currentStatement.text}</p>
                              <div className="feedback-context-chips">
                                <span className="feedback-chip">あなたの回答: {answeredChoiceLabel}</span>
                                <span className="feedback-chip">正しい判定: {correctChoiceLabel}</span>
                              </div>
                            </div>
                          ) : null}
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
                        <span className="summary-label">Key Insights</span>
                        <div className="review-list">
                          {dailyReview.key_observations.map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                        </div>
                      </section>
                      <section className="daily-review-block">
                        <span className="summary-label">Learner Pattern</span>
                        <div className="reflection-box">{dailyReview.coach_comment}</div>
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
                <p className="device-caption">
                  {isReviewConsensusActive
                    ? consensusMode === "tomorrow"
                      ? "Daily Review を入力に、AI Coach Team が Tomorrow Plan の総意をまとめています。"
                      : "Observation を受けて AI Coach Team が総意をまとめています。"
                    : "仮説が少しずつ更新されるライブ会話です。"}
                </p>
              </div>
              <div className="thought-stream-meta">
                <span className={`thinking-pill ${isCoachThinking ? "is-active" : ""}`}>Thinking...</span>
                <span className="observation-count-pill">
                  {dailySession ? `${displayedThoughtCount}/${displayedThoughtLimit}` : `0/${displayedThoughtLimit}`}
                </span>
              </div>
            </div>

            <div className="observation-stream-viewport">
              <div className="observation-list coach-thought-list">
                {isReviewConsensusActive ? (
                  visibleReviewConsensusTurns.length === 0 ? (
                    <div className="observation-empty-state">
                      <p>Coach Team Deliberation...</p>
                      <p>
                        {consensusMode === "tomorrow"
                          ? "Daily Review をもとに Tomorrow Plan を組み立てています。"
                          : "Observation をもとに総括をまとめています。"}
                      </p>
                    </div>
                  ) : (
                    visibleReviewConsensusTurns.map((turn, index) => (
                      <section
                        className={`mind-entry chat-row ${
                          turn.speakerLabel === "Consensus" ? "is-latest-observation" : ""
                        } stream-depth-${Math.min(visibleReviewConsensusTurns.length - 1 - index, 4)}`}
                        key={turn.id}
                      >
                        <p className="mind-log-speaker">{turn.speakerLabel}</p>
                        <p className="mind-log-line">{turn.text}</p>
                      </section>
                    ))
                  )
                ) : visibleTurns.length === 0 ? (
                  <div className="observation-empty-state">
                    <p>Thinking...</p>
                    <p>
                      {coachMindStatus === "error"
                        ? "AI Coach Team の生成に失敗しました。もう一度回答を確認してください。"
                        : coachMindStatus === "generating"
                        ? "AI Coach Team が回答を確認しています。"
                        : "肢の回答後にライブ会話が始まります。"}
                    </p>
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
