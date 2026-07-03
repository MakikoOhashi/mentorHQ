export type AgentId = "reading" | "law" | "memory" | "pattern" | "review" | "coach";

export const DIALOGUE_MOVES = [
  "observe",
  "agree",
  "challenge",
  "extend",
  "recall",
  "update_hypothesis",
  "defer"
] as const;

export type DialogueMove = (typeof DIALOGUE_MOVES)[number];

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
  "integrated_retry",
  "light_monitoring",
  "condition_check",
  "slow_down_prompt"
] as const;

export type SelectedIntervention = (typeof SELECTED_INTERVENTIONS)[number];

export type AgentDefinition = {
  id: AgentId;
  name: string;
  role: string;
  scope: string[];
  allowedDialogueMoves: DialogueMove[];
  systemPrompt: string;
  outputSchema: string[];
};

export type QuestionStatement = {
  id: string;
  text: string;
  isCorrect: boolean;
  explanation: string;
};

export type LearnerCase = {
  exam: string;
  theme: string;
  questionTitle: string;
  questionStem: string;
  statements: QuestionStatement[];
  correctStatementIndex: number;
  finalSummary: string;
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
  dialogue_move?: DialogueMove;
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

export type CoachMindSpeaker = "reading" | "memory" | "pattern" | "review";

export type CoachMindTurn = {
  id: string;
  speaker: CoachMindSpeaker;
  speakerLabel: string;
  text: string;
  source_observation_id: string;
};

export type CoachMindTurnOutput = Omit<CoachMindTurn, "id" | "source_observation_id">;

export type CoachMindResponse = {
  mode: "ai" | "fallback";
  turns: CoachMindTurnOutput[];
};

export const DAILY_SESSION_STATUSES = ["draft", "active", "completed"] as const;

export type DailySessionStatus = (typeof DAILY_SESSION_STATUSES)[number];

export const DAILY_REVIEW_STATUSES = ["pending", "generated"] as const;

export type DailyReviewStatus = (typeof DAILY_REVIEW_STATUSES)[number];

export const TOMORROW_PLAN_STATUSES = ["pending", "generated"] as const;

export type TomorrowPlanStatus = (typeof TOMORROW_PLAN_STATUSES)[number];

export type DailySession = {
  id: string;
  created_at: string | null;
  status: DailySessionStatus;
  question_ids: string[];
  current_index: number;
  observation_count: number;
  review_status: DailyReviewStatus;
  tomorrow_plan_status: TomorrowPlanStatus;
};

export const OBSERVATION_MISUNDERSTANDING_TYPES = [
  "starting_point_confusion",
  "condition_omission",
  "stable_progress",
  "rushed_answer",
  "memory_based_judgment",
  "condition_based_judgment",
  "intuition_based_judgment",
  "uncertainty_signal",
  "unknown"
] as const;

export type ObservationMisunderstandingType = (typeof OBSERVATION_MISUNDERSTANDING_TYPES)[number];

export const REASONING_STYLES = [
  "memory_based",
  "condition_based",
  "intuition",
  "uncertainty"
] as const;

export type ReasoningStyle = (typeof REASONING_STYLES)[number];

export const STATEMENT_CHOICES = ["correct", "incorrect"] as const;

export type StatementChoice = (typeof STATEMENT_CHOICES)[number];

export const OBSERVATION_CORRECTNESS = ["correct", "wrong"] as const;

export type ObservationCorrectness = (typeof OBSERVATION_CORRECTNESS)[number];

export type ObservationEvent = {
  id: string;
  daily_session_id: string;
  question_id: string;
  question_index: number;
  statement_index: number | null;
  learner_choice: StatementChoice | null;
  correct_or_wrong: ObservationCorrectness | null;
  learner_reason: string | null;
  reasoning_style: ReasoningStyle | null;
  intervention_type: SelectedIntervention;
  misunderstanding_type: ObservationMisunderstandingType | null;
  answer_signal_score: number | null;
  observation_note: string;
  note: string;
  created_at: string | null;
};

export type ObservationEventInput = {
  daily_session_id: string;
  question_id: string;
  question_index: number;
  statement_index?: number | null;
  learner_choice?: StatementChoice | null;
  correct_or_wrong?: ObservationCorrectness | null;
  learner_reason?: string | null;
  reasoning_style?: ReasoningStyle | null;
  intervention_type: SelectedIntervention;
  misunderstanding_type: ObservationMisunderstandingType | null;
  answer_signal_score: number | null;
  observation_note?: string;
  note: string;
};

export const LEARNER_CHOICES = [
  "first_position",
  "condition_start",
  "unknown_start",
  "use_condition",
  "ignore_condition",
  "unsure_condition",
  "check_starting_point",
  "check_condition",
  "check_unit",
  "answer_directly"
] as const;

export type LearnerChoice = (typeof LEARNER_CHOICES)[number];

export type DailyReview = {
  id: string;
  daily_session_id: string;
  summary: string;
  key_observations: string[];
  repeated_patterns: string[];
  coach_comment: string;
  created_at: string | null;
};

export type DailyReviewInput = {
  daily_session_id: string;
  summary: string;
  key_observations: string[];
  repeated_patterns: string[];
  coach_comment: string;
};

export type TomorrowPlan = {
  id: string;
  daily_session_id: string;
  daily_review_id: string;
  focus_theme: string;
  practice_items: string[];
  caution_points: string[];
  coach_message: string;
  created_at: string | null;
};

export type TomorrowPlanInput = {
  daily_session_id: string;
  daily_review_id: string;
  focus_theme: string;
  practice_items: string[];
  caution_points: string[];
  coach_message: string;
};
