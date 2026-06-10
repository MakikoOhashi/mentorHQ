export type AgentId = "misconception" | "memory" | "load" | "coach";

export type DeliberationRound = 1 | 2 | 3 | 4;

export type DeliberationEventType = "observation" | "revision" | "recommendation" | "decision";

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
  type: DeliberationEventType;
  message: string;
  hypothesis: string;
  confidence: number;
  influenced_by: AgentId[];
  recommendation?: string;
};

export type DeliberationObservationEvent = DeliberationEventBase & {
  type: "observation" | "recommendation" | "decision";
};

export type DeliberationRevisionEvent = DeliberationEventBase & {
  type: "revision";
  confidence_before: number;
  confidence_after: number;
};

export type DeliberationEvent = DeliberationObservationEvent | DeliberationRevisionEvent;

export type CoachDecision = {
  selected_intervention: string;
  reason: string;
  next_question: string;
};

export type DeliberationResponse = {
  mode: "mock" | "ai";
  deliberation_events: DeliberationEvent[];
  coach_decision: CoachDecision;
};
