export type AgentId = "misconception" | "memory" | "load" | "coach";

export type DeliberationRound = number;

export type DeliberationEventType =
  | "observation"
  | "challenge"
  | "revision"
  | "recommendation"
  | "coach_decision";

export const SELECTED_INTERVENTIONS = [
  "leg_breakdown",
  "contrast_check",
  "starting_point_check",
  "integrated_retry"
] as const;

export type SelectedIntervention = (typeof SELECTED_INTERVENTIONS)[number];

export type AgentDefinition = {
  id: AgentId;
  name: string;
  role: string;
  perspective: string;
  systemPrompt: string;
  outputSchema: string[];
};

export type LearnerCase = {
  exam: string;
  theme: string;
  questionTitle: string;
  questionStem: string;
  currentLeg: string;
  learnerAnswer: string;
  reason: string;
  objectiveTruth: string;
};

type DeliberationEventBase = {
  round: DeliberationRound;
  speaker: AgentId;
  speaker_label: string;
  type: DeliberationEventType;
  message: string;
  hypothesis?: string;
  confidence_before?: number;
  confidence_after?: number;
  influenced_by?: AgentId[];
};

export type DeliberationRevisionEvent = DeliberationEventBase & {
  type: "revision";
  hypothesis: string;
  confidence_before: number;
  confidence_after: number;
  influenced_by: AgentId[];
};

export type DeliberationEvent = DeliberationRevisionEvent | DeliberationEventBase;

export type CoachDecision = {
  selected_intervention: SelectedIntervention;
  reason: string;
  next_question: string;
};

export type DeliberationResponse = {
  mode: "mock" | "ai";
  deliberation_events: DeliberationEvent[];
  coach_decision: CoachDecision;
};

export const DAILY_SESSION_STATUSES = ["draft", "active", "completed"] as const;

export type DailySessionStatus = (typeof DAILY_SESSION_STATUSES)[number];

export const DAILY_REVIEW_STATUSES = ["pending", "ready"] as const;

export type DailyReviewStatus = (typeof DAILY_REVIEW_STATUSES)[number];

export type DailySession = {
  id: string;
  created_at: string | null;
  status: DailySessionStatus;
  question_ids: string[];
  current_index: number;
  observation_count: number;
  review_status: DailyReviewStatus;
};
