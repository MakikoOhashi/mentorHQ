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
