import type {
  CoachDecision,
  DailyReview,
  DailyReviewInput,
  DailyReviewStatus,
  DailySession,
  DailySessionStatus,
  DeliberationEvent,
  DeliberationResponse,
  LearnerCase,
  ObservationEvent,
  ObservationEventInput,
  TomorrowPlan,
  TomorrowPlanInput,
  TomorrowPlanStatus
} from "@/lib/deliberation/types";
import { detectMisunderstandingTypeFromDeliberation } from "@/lib/deliberation/observation";
import { buildDailyReviewInput } from "@/lib/deliberation/review";
import { buildTomorrowPlanInput } from "@/lib/deliberation/tomorrow-plan";
import { applicationDefault, getApp, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore, type QueryDocumentSnapshot, type Timestamp } from "firebase-admin/firestore";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type SessionRecord = {
  id: string;
  learnerCase: LearnerCase;
  deliberation_events: DeliberationEvent[];
  coach_decision: CoachDecision;
  mode: DeliberationResponse["mode"];
  misunderstanding_type?: string | null;
  created_at?: string | null;
};

export type MemorySummary = {
  selectedIntervention: DeliberationResponse["coach_decision"]["selected_intervention"];
  previousNextQuestion: string | null;
  previousReason: string | null;
  recentInterventions: DeliberationResponse["coach_decision"]["selected_intervention"][];
  repeatedInterventionCount: number;
  repeatedPatternDetected: boolean;
  recentMisunderstandings: string[];
  repeatedMisunderstandingDetected: boolean;
  mostRepeatedMisunderstanding: string | null;
  memoryMessageHint: string;
};

type MisunderstandingType =
  | "starting_point_confusion"
  | "condition_omission"
  | "stable_progress"
  | "rushed_answer"
  | "unknown";

type SaveSessionInput = {
  learnerCase: LearnerCase;
  deliberation: DeliberationResponse;
};

export type SaveDailySessionInput = {
  questionIds: string[];
  status?: DailySessionStatus;
  currentIndex?: number;
  observationCount?: number;
  reviewStatus?: DailyReviewStatus;
  tomorrowPlanStatus?: TomorrowPlanStatus;
};

export type AdvanceDailySessionInput = {
  sessionId: string;
  observation?: ObservationEventInput;
};

export type GenerateDailyReviewInput = {
  sessionId: string;
};

export type GenerateTomorrowPlanInput = {
  sessionId: string;
};

const SESSIONS_COLLECTION = "sessions";
const DAILY_SESSIONS_COLLECTION = "daily_sessions";
const OBSERVATION_EVENTS_COLLECTION = "observation_events";
const DAILY_REVIEWS_COLLECTION = "daily_reviews";
const TOMORROW_PLANS_COLLECTION = "tomorrow_plans";
const RECENT_SESSION_LIMIT = 5;
const inMemoryDailySessions = new Map<string, DailySession>();
const inMemoryObservationEvents = new Map<string, ObservationEvent>();
const inMemoryDailyReviews = new Map<string, DailyReview>();
const inMemoryTomorrowPlans = new Map<string, TomorrowPlan>();
const DAILY_SESSIONS_FALLBACK_PATH = join("/tmp", "mentorhq-daily-sessions.json");
const OBSERVATION_EVENTS_FALLBACK_PATH = join("/tmp", "mentorhq-observation-events.json");
const DAILY_REVIEWS_FALLBACK_PATH = join("/tmp", "mentorhq-daily-reviews.json");
const TOMORROW_PLANS_FALLBACK_PATH = join("/tmp", "mentorhq-tomorrow-plans.json");

function getInterventionLabel(intervention: DeliberationResponse["coach_decision"]["selected_intervention"]): string {
  switch (intervention) {
    case "starting_point_check":
      return "起算点確認";
    case "contrast_check":
      return "比較確認";
    case "integrated_retry":
      return "統合リトライ";
    case "leg_breakdown":
      return "脚分解";
    case "light_monitoring":
      return "軽い観察";
    case "condition_check":
      return "条件確認";
    case "slow_down_prompt":
      return "確認促し";
    default:
      return intervention;
  }
}

function getMisunderstandingLabel(misunderstandingType: string | null): string {
  switch (misunderstandingType) {
    case "starting_point_confusion":
      return "起算点の誤解";
    case "condition_omission":
      return "条件の読み落とし";
    case "stable_progress":
      return "安定して確認できている";
    case "rushed_answer":
      return "急いで答えやすい";
    case "unknown":
      return "誤解パターン";
    default:
      return misunderstandingType ?? "誤解パターン";
  }
}

function detectMisunderstandingTypeFromParts(
  coachDecision: CoachDecision,
  deliberationEvents: DeliberationEvent[]
): MisunderstandingType {
  return detectMisunderstandingTypeFromDeliberation(coachDecision, deliberationEvents);
}

let firestorePromise: Promise<Firestore | null> | null = null;
let firestoreRuntimeDisabled = false;

function isFirestoreDisabled(): boolean {
  if (firestoreRuntimeDisabled) {
    return true;
  }

  const value = process.env.FIRESTORE_DISABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function disableFirestoreRuntime() {
  firestoreRuntimeDisabled = true;
}

function getErrorDetails(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    name: typeof error,
    message: String(error)
  };
}

function isMissingDefaultCredentialsError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Could not load the default credentials");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function removeUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => removeUndefinedDeep(item)) as T;
  }

  if (isPlainObject(value)) {
    const sanitizedEntries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, removeUndefinedDeep(entryValue)]);

    return Object.fromEntries(sanitizedEntries) as T;
  }

  return value;
}

async function getFirestoreClient(): Promise<Firestore | null> {
  if (isFirestoreDisabled()) {
    return null;
  }

  if (!firestorePromise) {
    firestorePromise = (async () => {
      const projectId =
        process.env.FIRESTORE_PROJECT_ID?.trim() ||
        process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
        process.env.GCLOUD_PROJECT?.trim() ||
        undefined;

      try {
        const app =
          getApps().length > 0
            ? getApp()
            : initializeApp({
                credential: applicationDefault(),
                projectId
              });
        const firestore = getFirestore(app);

        console.info("[firestore] admin init ok", { projectId: projectId ?? null });

        return firestore;
      } catch (error) {
        console.warn("[firestore] admin init skipped", {
          ...getErrorDetails(error),
          projectId: projectId ?? null
        });
        return null;
      }
    })();
  }

  return firestorePromise;
}

function toSerializableCreatedAt(createdAt: unknown): string | null {
  if (!createdAt) {
    return null;
  }

  if (typeof createdAt === "string") {
    return createdAt;
  }

  const timestamp = createdAt as Timestamp;
  const date = timestamp.toDate?.();
  return date instanceof Date ? date.toISOString() : null;
}

function toSerializableSession(snapshot: QueryDocumentSnapshot): SessionRecord | null {
  const data = snapshot.data();

  if (!data.learnerCase || !data.coach_decision || !Array.isArray(data.deliberation_events)) {
    return null;
  }

  return {
    id: snapshot.id,
    learnerCase: data.learnerCase as LearnerCase,
    deliberation_events: data.deliberation_events as DeliberationEvent[],
    coach_decision: data.coach_decision as CoachDecision,
    mode: (data.mode as DeliberationResponse["mode"]) ?? "mock",
    misunderstanding_type:
      typeof data.misunderstanding_type === "string"
        ? data.misunderstanding_type
        : detectMisunderstandingTypeFromParts(
            data.coach_decision as CoachDecision,
            data.deliberation_events as DeliberationEvent[]
          ),
    created_at: toSerializableCreatedAt(data.created_at)
  };
}

function toSerializableDailySession(snapshot: QueryDocumentSnapshot): DailySession | null {
  const data = snapshot.data();

  if (!Array.isArray(data.question_ids)) {
    return null;
  }

  return {
    id: snapshot.id,
    created_at: toSerializableCreatedAt(data.created_at),
    status: isDailySessionStatus(data.status) ? data.status : "draft",
    question_ids: data.question_ids.filter((value: unknown): value is string => typeof value === "string"),
    current_index: typeof data.current_index === "number" ? data.current_index : 0,
    observation_count: typeof data.observation_count === "number" ? data.observation_count : 0,
    review_status: normalizeDailyReviewStatus(data.review_status),
    tomorrow_plan_status: normalizeTomorrowPlanStatus(data.tomorrow_plan_status)
  };
}

function toSerializableObservationEvent(snapshot: QueryDocumentSnapshot): ObservationEvent | null {
  const data = snapshot.data();

  if (
    typeof data.daily_session_id !== "string" ||
    typeof data.question_id !== "string" ||
    typeof data.question_index !== "number" ||
    !isSelectedIntervention(data.intervention_type) ||
    !isObservationMisunderstandingType(data.misunderstanding_type) ||
    typeof data.note !== "string"
  ) {
    return null;
  }

  return {
    id: snapshot.id,
    daily_session_id: data.daily_session_id,
    question_id: data.question_id,
    question_index: data.question_index,
    intervention_type: data.intervention_type,
    misunderstanding_type: data.misunderstanding_type,
    confidence: typeof data.confidence === "number" ? data.confidence : null,
    note: data.note,
    created_at: toSerializableCreatedAt(data.created_at)
  };
}

function toSerializableDailyReview(snapshot: QueryDocumentSnapshot): DailyReview | null {
  const data = snapshot.data();

  if (
    typeof data.daily_session_id !== "string" ||
    typeof data.summary !== "string" ||
    !Array.isArray(data.key_observations) ||
    !Array.isArray(data.repeated_patterns) ||
    typeof data.coach_comment !== "string"
  ) {
    return null;
  }

  return {
    id: snapshot.id,
    daily_session_id: data.daily_session_id,
    summary: data.summary,
    key_observations: data.key_observations.filter((value: unknown): value is string => typeof value === "string"),
    repeated_patterns: data.repeated_patterns.filter((value: unknown): value is string => typeof value === "string"),
    coach_comment: data.coach_comment,
    created_at: toSerializableCreatedAt(data.created_at)
  };
}

function toSerializableTomorrowPlan(snapshot: QueryDocumentSnapshot): TomorrowPlan | null {
  const data = snapshot.data();

  if (
    typeof data.daily_session_id !== "string" ||
    typeof data.daily_review_id !== "string" ||
    typeof data.focus_theme !== "string" ||
    !Array.isArray(data.practice_items) ||
    !Array.isArray(data.caution_points) ||
    typeof data.coach_message !== "string"
  ) {
    return null;
  }

  return {
    id: snapshot.id,
    daily_session_id: data.daily_session_id,
    daily_review_id: data.daily_review_id,
    focus_theme: data.focus_theme,
    practice_items: data.practice_items.filter((value: unknown): value is string => typeof value === "string"),
    caution_points: data.caution_points.filter((value: unknown): value is string => typeof value === "string"),
    coach_message: data.coach_message,
    created_at: toSerializableCreatedAt(data.created_at)
  };
}

function isDailySessionStatus(value: unknown): value is DailySessionStatus {
  return value === "draft" || value === "active" || value === "completed";
}

function isDailyReviewStatus(value: unknown): value is DailyReviewStatus {
  return value === "pending" || value === "generated";
}

function normalizeDailyReviewStatus(value: unknown): DailyReviewStatus {
  if (value === "ready") {
    return "generated";
  }

  return isDailyReviewStatus(value) ? value : "pending";
}

function isTomorrowPlanStatus(value: unknown): value is TomorrowPlanStatus {
  return value === "pending" || value === "generated";
}

function normalizeTomorrowPlanStatus(value: unknown): TomorrowPlanStatus {
  return isTomorrowPlanStatus(value) ? value : "pending";
}

function isSelectedIntervention(value: unknown): value is ObservationEvent["intervention_type"] {
  return (
    value === "leg_breakdown" ||
    value === "contrast_check" ||
    value === "starting_point_check" ||
    value === "integrated_retry" ||
    value === "light_monitoring" ||
    value === "condition_check" ||
    value === "slow_down_prompt"
  );
}

function isObservationMisunderstandingType(value: unknown): value is ObservationEvent["misunderstanding_type"] {
  return (
    value === "starting_point_confusion" ||
    value === "condition_omission" ||
    value === "stable_progress" ||
    value === "rushed_answer" ||
    value === "unknown"
  );
}

function formatCounts(items: string[]): string[] {
  const counts = items.reduce<Map<string, number>>((countMap, item) => {
    countMap.set(item, (countMap.get(item) ?? 0) + 1);
    return countMap;
  }, new Map());

  return Array.from(counts.entries()).map(([item, count]) => `- ${getMisunderstandingLabel(item)} x${count}`);
}

function formatRecentInterventions(recentInterventions: MemorySummary["recentInterventions"]): string[] {
  const interventionCounts = recentInterventions.reduce<Map<string, number>>((counts, intervention) => {
    counts.set(intervention, (counts.get(intervention) ?? 0) + 1);
    return counts;
  }, new Map());

  return Array.from(interventionCounts.entries()).map(
    ([intervention, count]) => `- ${intervention} x${count}`
  );
}

function buildMemoryContext(sessions: SessionRecord[]): string | null {
  const summary = buildMemorySummary(sessions);
  if (!summary) {
    return null;
  }

  const lines = [
    "Previous Session Memory",
    `- selected_intervention: ${summary.selectedIntervention}`,
    `- memory_message_hint: ${summary.memoryMessageHint}`,
    "",
    "Recent Memory Pattern",
    ...formatRecentInterventions(summary.recentInterventions),
    `- repeated_intervention_count: ${summary.repeatedInterventionCount}`,
    `- repeated_pattern_detected: ${summary.repeatedPatternDetected}`,
    "",
    "Recent Misunderstanding Pattern",
    ...formatCounts(summary.recentMisunderstandings),
    `- most_repeated_misunderstanding: ${summary.mostRepeatedMisunderstanding ?? "unknown"}`,
    `- repeated_misunderstanding_detected: ${summary.repeatedMisunderstandingDetected}`,
    summary.previousNextQuestion ? `- previous_next_question:\n  ${summary.previousNextQuestion}` : null,
    summary.previousReason ? `- previous_reason:\n  ${summary.previousReason}` : null
  ].filter((line): line is string => Boolean(line));

  const memoryContext = lines.length > 1 ? lines.join("\n") : null;

  if (!memoryContext) {
    return null;
  }

  return memoryContext.slice(0, 300);
}

function saveDailySessionToMemory(session: DailySession): DailySession {
  inMemoryDailySessions.set(session.id, session);
  return session;
}

async function loadFallbackDailySessions(): Promise<DailySession[]> {
  try {
    const text = await readFile(DAILY_SESSIONS_FALLBACK_PATH, "utf8");
    const sessions = JSON.parse(text) as DailySession[];
    if (!Array.isArray(sessions)) {
      return [];
    }

    return sessions.map((session) => ({
      ...session,
      review_status: normalizeDailyReviewStatus(session.review_status),
      tomorrow_plan_status: normalizeTomorrowPlanStatus(session.tomorrow_plan_status)
    }));
  } catch {
    return [];
  }
}

async function persistFallbackDailySessions(sessions: DailySession[]): Promise<void> {
  await writeFile(DAILY_SESSIONS_FALLBACK_PATH, JSON.stringify(sessions, null, 2), "utf8");
}

async function saveDailySessionToFallback(session: DailySession): Promise<DailySession> {
  saveDailySessionToMemory(session);
  const sessions = await loadFallbackDailySessions();
  const nextSessions = sessions.filter((item) => item.id !== session.id);
  nextSessions.push(session);
  await persistFallbackDailySessions(nextSessions);
  return session;
}

function saveObservationEventToMemory(event: ObservationEvent): ObservationEvent {
  inMemoryObservationEvents.set(event.id, event);
  return event;
}

function saveDailyReviewToMemory(review: DailyReview): DailyReview {
  inMemoryDailyReviews.set(review.daily_session_id, review);
  return review;
}

function saveTomorrowPlanToMemory(plan: TomorrowPlan): TomorrowPlan {
  inMemoryTomorrowPlans.set(plan.daily_session_id, plan);
  return plan;
}

async function loadFallbackObservationEvents(): Promise<ObservationEvent[]> {
  try {
    const text = await readFile(OBSERVATION_EVENTS_FALLBACK_PATH, "utf8");
    const events = JSON.parse(text) as ObservationEvent[];
    if (!Array.isArray(events)) {
      return [];
    }

    return events;
  } catch {
    return [];
  }
}

async function persistFallbackObservationEvents(events: ObservationEvent[]): Promise<void> {
  await writeFile(OBSERVATION_EVENTS_FALLBACK_PATH, JSON.stringify(events, null, 2), "utf8");
}

async function saveObservationEventToFallback(event: ObservationEvent): Promise<ObservationEvent> {
  saveObservationEventToMemory(event);
  const events = await loadFallbackObservationEvents();
  const nextEvents = events.filter((item) => item.id !== event.id);
  nextEvents.push(event);
  await persistFallbackObservationEvents(nextEvents);
  return event;
}

async function loadFallbackDailyReviews(): Promise<DailyReview[]> {
  try {
    const text = await readFile(DAILY_REVIEWS_FALLBACK_PATH, "utf8");
    const reviews = JSON.parse(text) as DailyReview[];
    if (!Array.isArray(reviews)) {
      return [];
    }

    return reviews;
  } catch {
    return [];
  }
}

async function persistFallbackDailyReviews(reviews: DailyReview[]): Promise<void> {
  await writeFile(DAILY_REVIEWS_FALLBACK_PATH, JSON.stringify(reviews, null, 2), "utf8");
}

async function saveDailyReviewToFallback(review: DailyReview): Promise<DailyReview> {
  saveDailyReviewToMemory(review);
  const reviews = await loadFallbackDailyReviews();
  const nextReviews = reviews.filter((item) => item.daily_session_id !== review.daily_session_id);
  nextReviews.push(review);
  await persistFallbackDailyReviews(nextReviews);
  return review;
}

async function loadFallbackTomorrowPlans(): Promise<TomorrowPlan[]> {
  try {
    const text = await readFile(TOMORROW_PLANS_FALLBACK_PATH, "utf8");
    const plans = JSON.parse(text) as TomorrowPlan[];
    if (!Array.isArray(plans)) {
      return [];
    }

    return plans;
  } catch {
    return [];
  }
}

async function persistFallbackTomorrowPlans(plans: TomorrowPlan[]): Promise<void> {
  await writeFile(TOMORROW_PLANS_FALLBACK_PATH, JSON.stringify(plans, null, 2), "utf8");
}

async function saveTomorrowPlanToFallback(plan: TomorrowPlan): Promise<TomorrowPlan> {
  saveTomorrowPlanToMemory(plan);
  const plans = await loadFallbackTomorrowPlans();
  const nextPlans = plans.filter((item) => item.daily_session_id !== plan.daily_session_id);
  nextPlans.push(plan);
  await persistFallbackTomorrowPlans(nextPlans);
  return plan;
}

async function getObservationEventsFromFallback(dailySessionId: string): Promise<ObservationEvent[]> {
  const fileEvents = await loadFallbackObservationEvents();
  const memoryEvents = Array.from(inMemoryObservationEvents.values());
  const dedupedEvents = [...fileEvents, ...memoryEvents].reduce<Map<string, ObservationEvent>>((map, event) => {
    map.set(event.id, event);
    return map;
  }, new Map());

  return Array.from(dedupedEvents.values())
    .filter((event) => event.daily_session_id === dailySessionId)
    .sort((left, right) => {
      if ((left.created_at ?? "") === (right.created_at ?? "")) {
        return left.question_index - right.question_index;
      }

      return (left.created_at ?? "").localeCompare(right.created_at ?? "");
    });
}

async function getLatestDailySessionFromFallback(): Promise<DailySession | null> {
  const fileSessions = await loadFallbackDailySessions();
  const memorySessions = Array.from(inMemoryDailySessions.values());
  const sessions = [...fileSessions, ...memorySessions].reduce<Map<string, DailySession>>((map, session) => {
    map.set(session.id, session);
    return map;
  }, new Map());

  const sortedSessions = Array.from(sessions.values()).sort((left, right) => {
    return (right.created_at ?? "").localeCompare(left.created_at ?? "");
  });

  return sortedSessions[0] ?? null;
}

async function getDailyReviewFromFallback(dailySessionId: string): Promise<DailyReview | null> {
  const fileReviews = await loadFallbackDailyReviews();
  const memoryReviews = Array.from(inMemoryDailyReviews.values());
  const reviews = [...fileReviews, ...memoryReviews].reduce<Map<string, DailyReview>>((map, review) => {
    map.set(review.daily_session_id, review);
    return map;
  }, new Map());

  return reviews.get(dailySessionId) ?? null;
}

async function getTomorrowPlanFromFallback(dailySessionId: string): Promise<TomorrowPlan | null> {
  const filePlans = await loadFallbackTomorrowPlans();
  const memoryPlans = Array.from(inMemoryTomorrowPlans.values());
  const plans = [...filePlans, ...memoryPlans].reduce<Map<string, TomorrowPlan>>((map, plan) => {
    map.set(plan.daily_session_id, plan);
    return map;
  }, new Map());

  return plans.get(dailySessionId) ?? null;
}

function buildMemoryMessageHint(summary: Omit<MemorySummary, "memoryMessageHint">): string {
  if (summary.repeatedMisunderstandingDetected && summary.mostRepeatedMisunderstanding) {
    const misunderstandingLabel = getMisunderstandingLabel(summary.mostRepeatedMisunderstanding);
    if (summary.mostRepeatedMisunderstanding === "starting_point_confusion") {
      return `${misunderstandingLabel}が続いてますね。前回もここで迷ってました。`;
    }

    return `${misunderstandingLabel}が続いてますね。誤解パターンの再発かも。`;
  }

  const interventionLabel = getInterventionLabel(summary.selectedIntervention);

  if (summary.repeatedPatternDetected) {
    if (summary.repeatedInterventionCount >= 3) {
      return `${interventionLabel} が続いてますね。似た誤解かも。`;
    }

    return `前回も ${interventionLabel} でした。同じ介入が続いてます。`;
  }

  return `前回も ${interventionLabel} でした。`;
}

export function buildMemorySummary(sessions: SessionRecord[]): MemorySummary | null {
  const [latestSession] = sessions;
  if (!latestSession) {
    return null;
  }

  const previousNextQuestion = latestSession.coach_decision.next_question.trim() || null;
  const previousReason = latestSession.coach_decision.reason.trim() || null;
  const recentInterventions = sessions
    .map((session) => session.coach_decision.selected_intervention)
    .filter((value): value is MemorySummary["selectedIntervention"] => Boolean(value));
  const selectedIntervention = recentInterventions[0] ?? latestSession.coach_decision.selected_intervention;
  const repeatedInterventionCount = recentInterventions.filter(
    (intervention) => intervention === selectedIntervention
  ).length;
  const repeatedPatternDetected = repeatedInterventionCount >= 2;
  const recentMisunderstandings = sessions
    .map((session) => session.misunderstanding_type ?? "unknown")
    .filter((value) => value !== "");
  const misunderstandingCounts = recentMisunderstandings.reduce<Map<string, number>>((counts, misunderstanding) => {
    counts.set(misunderstanding, (counts.get(misunderstanding) ?? 0) + 1);
    return counts;
  }, new Map());
  const mostRepeatedMisunderstanding =
    Array.from(misunderstandingCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  const repeatedMisunderstandingDetected =
    mostRepeatedMisunderstanding !== null &&
    mostRepeatedMisunderstanding !== "unknown" &&
    (misunderstandingCounts.get(mostRepeatedMisunderstanding) ?? 0) >= 2;

  const summaryBase = {
    selectedIntervention,
    previousNextQuestion,
    previousReason,
    recentInterventions,
    repeatedInterventionCount,
    repeatedPatternDetected,
    recentMisunderstandings,
    repeatedMisunderstandingDetected,
    mostRepeatedMisunderstanding
  };

  return {
    ...summaryBase,
    memoryMessageHint: buildMemoryMessageHint(summaryBase)
  };
}

export async function saveDeliberationSession({ learnerCase, deliberation }: SaveSessionInput): Promise<void> {
  const firestore = await getFirestoreClient();
  if (!firestore) {
    return;
  }

  try {
    const sessionPayload = removeUndefinedDeep({
      learnerCase,
      deliberation_events: deliberation.deliberation_events,
      coach_decision: deliberation.coach_decision,
      misunderstanding_type: detectMisunderstandingTypeFromParts(
        deliberation.coach_decision,
        deliberation.deliberation_events
      ),
      mode: deliberation.mode,
      created_at: FieldValue.serverTimestamp()
    });

    await firestore
      .collection(SESSIONS_COLLECTION)
      .doc(crypto.randomUUID())
      .set(sessionPayload);
    console.info("[firestore] session saved");
  } catch (error) {
    if (isMissingDefaultCredentialsError(error)) {
      disableFirestoreRuntime();
    }
    console.warn("[firestore] save session skipped", getErrorDetails(error));
  }
}

export async function createDailySession({
  questionIds,
  status = "draft",
  currentIndex = 0,
  observationCount = 0,
  reviewStatus = "pending",
  tomorrowPlanStatus = "pending"
}: SaveDailySessionInput): Promise<DailySession | null> {
  const firestore = await getFirestoreClient();
  const sessionId = crypto.randomUUID();
  const fallbackSession: DailySession = {
    id: sessionId,
    created_at: new Date().toISOString(),
    status,
    question_ids: questionIds,
    current_index: currentIndex,
    observation_count: observationCount,
    review_status: reviewStatus,
    tomorrow_plan_status: tomorrowPlanStatus
  };

  if (!firestore) {
    return saveDailySessionToFallback(fallbackSession);
  }

  try {
    const sessionPayload = removeUndefinedDeep({
      status,
      question_ids: questionIds,
      current_index: currentIndex,
      observation_count: observationCount,
      review_status: reviewStatus,
      tomorrow_plan_status: tomorrowPlanStatus,
      created_at: FieldValue.serverTimestamp()
    });

    await firestore.collection(DAILY_SESSIONS_COLLECTION).doc(sessionId).set(sessionPayload);
    console.info("[firestore] daily session created");

    return {
      ...fallbackSession,
      created_at: null
    };
  } catch (error) {
    if (isMissingDefaultCredentialsError(error)) {
      disableFirestoreRuntime();
    }
    console.warn("[firestore] create daily session skipped", getErrorDetails(error));
    return saveDailySessionToFallback(fallbackSession);
  }
}

async function createObservationEvent(observation: ObservationEventInput): Promise<ObservationEvent | null> {
  const firestore = await getFirestoreClient();
  const eventId = crypto.randomUUID();
  const fallbackEvent: ObservationEvent = {
    id: eventId,
    daily_session_id: observation.daily_session_id,
    question_id: observation.question_id,
    question_index: observation.question_index,
    intervention_type: observation.intervention_type,
    misunderstanding_type: observation.misunderstanding_type,
    confidence: observation.confidence,
    note: observation.note,
    created_at: new Date().toISOString()
  };

  if (!firestore) {
    return saveObservationEventToFallback(fallbackEvent);
  }

  try {
    const payload = removeUndefinedDeep({
      daily_session_id: observation.daily_session_id,
      question_id: observation.question_id,
      question_index: observation.question_index,
      intervention_type: observation.intervention_type,
      misunderstanding_type: observation.misunderstanding_type,
      confidence: observation.confidence,
      note: observation.note,
      created_at: FieldValue.serverTimestamp()
    });

    await firestore.collection(OBSERVATION_EVENTS_COLLECTION).doc(eventId).set(payload);
    console.info("[firestore] observation event created");

    return {
      ...fallbackEvent,
      created_at: null
    };
  } catch (error) {
    if (isMissingDefaultCredentialsError(error)) {
      disableFirestoreRuntime();
    }
    console.warn("[firestore] create observation event skipped", getErrorDetails(error));
    return saveObservationEventToFallback(fallbackEvent);
  }
}

async function createDailyReview(review: DailyReviewInput): Promise<DailyReview | null> {
  const firestore = await getFirestoreClient();
  const reviewId = crypto.randomUUID();
  const fallbackReview: DailyReview = {
    id: reviewId,
    daily_session_id: review.daily_session_id,
    summary: review.summary,
    key_observations: review.key_observations,
    repeated_patterns: review.repeated_patterns,
    coach_comment: review.coach_comment,
    created_at: new Date().toISOString()
  };

  if (!firestore) {
    return saveDailyReviewToFallback(fallbackReview);
  }

  try {
    const payload = removeUndefinedDeep({
      daily_session_id: review.daily_session_id,
      summary: review.summary,
      key_observations: review.key_observations,
      repeated_patterns: review.repeated_patterns,
      coach_comment: review.coach_comment,
      created_at: FieldValue.serverTimestamp()
    });

    await firestore.collection(DAILY_REVIEWS_COLLECTION).doc(reviewId).set(payload);
    console.info("[firestore] daily review created");

    return {
      ...fallbackReview,
      created_at: null
    };
  } catch (error) {
    if (isMissingDefaultCredentialsError(error)) {
      disableFirestoreRuntime();
    }
    console.warn("[firestore] create daily review skipped", getErrorDetails(error));
    return saveDailyReviewToFallback(fallbackReview);
  }
}

async function createTomorrowPlan(plan: TomorrowPlanInput): Promise<TomorrowPlan | null> {
  const firestore = await getFirestoreClient();
  const planId = crypto.randomUUID();
  const fallbackPlan: TomorrowPlan = {
    id: planId,
    daily_session_id: plan.daily_session_id,
    daily_review_id: plan.daily_review_id,
    focus_theme: plan.focus_theme,
    practice_items: plan.practice_items,
    caution_points: plan.caution_points,
    coach_message: plan.coach_message,
    created_at: new Date().toISOString()
  };

  if (!firestore) {
    return saveTomorrowPlanToFallback(fallbackPlan);
  }

  try {
    const payload = removeUndefinedDeep({
      daily_session_id: plan.daily_session_id,
      daily_review_id: plan.daily_review_id,
      focus_theme: plan.focus_theme,
      practice_items: plan.practice_items,
      caution_points: plan.caution_points,
      coach_message: plan.coach_message,
      created_at: FieldValue.serverTimestamp()
    });

    await firestore.collection(TOMORROW_PLANS_COLLECTION).doc(planId).set(payload);
    console.info("[firestore] tomorrow plan created");

    return {
      ...fallbackPlan,
      created_at: null
    };
  } catch (error) {
    if (isMissingDefaultCredentialsError(error)) {
      disableFirestoreRuntime();
    }
    console.warn("[firestore] create tomorrow plan skipped", getErrorDetails(error));
    return saveTomorrowPlanToFallback(fallbackPlan);
  }
}

export async function getDailySessionById(sessionId: string): Promise<DailySession | null> {
  const firestore = await getFirestoreClient();
  if (!firestore) {
    return (
      inMemoryDailySessions.get(sessionId) ??
      (await loadFallbackDailySessions()).find((session) => session.id === sessionId) ??
      null
    );
  }

  try {
    const snapshot = await firestore.collection(DAILY_SESSIONS_COLLECTION).doc(sessionId).get();
    if (!snapshot.exists) {
      return null;
    }

    return toSerializableDailySession(snapshot as QueryDocumentSnapshot);
  } catch (error) {
    if (isMissingDefaultCredentialsError(error)) {
      disableFirestoreRuntime();
    }
    console.warn("[firestore] daily session lookup skipped", getErrorDetails(error));
    return (
      inMemoryDailySessions.get(sessionId) ??
      (await loadFallbackDailySessions()).find((session) => session.id === sessionId) ??
      null
    );
  }
}

async function updateDailySessionReviewStatus(
  session: DailySession,
  reviewStatus: DailyReviewStatus
): Promise<DailySession> {
  const nextSession: DailySession = {
    ...session,
    review_status: reviewStatus
  };
  const firestore = await getFirestoreClient();

  if (!firestore) {
    return saveDailySessionToFallback(nextSession);
  }

  try {
    await firestore.collection(DAILY_SESSIONS_COLLECTION).doc(session.id).set(
      removeUndefinedDeep({
        review_status: reviewStatus
      }),
      { merge: true }
    );

    saveDailySessionToMemory(nextSession);
    return nextSession;
  } catch (error) {
    if (isMissingDefaultCredentialsError(error)) {
      disableFirestoreRuntime();
    }
    console.warn("[firestore] daily session review status update skipped", getErrorDetails(error));
    return saveDailySessionToFallback(nextSession);
  }
}

async function updateDailySessionTomorrowPlanStatus(
  session: DailySession,
  tomorrowPlanStatus: TomorrowPlanStatus
): Promise<DailySession> {
  const nextSession: DailySession = {
    ...session,
    tomorrow_plan_status: tomorrowPlanStatus
  };
  const firestore = await getFirestoreClient();

  if (!firestore) {
    return saveDailySessionToFallback(nextSession);
  }

  try {
    await firestore.collection(DAILY_SESSIONS_COLLECTION).doc(session.id).set(
      removeUndefinedDeep({
        tomorrow_plan_status: tomorrowPlanStatus
      }),
      { merge: true }
    );

    saveDailySessionToMemory(nextSession);
    return nextSession;
  } catch (error) {
    if (isMissingDefaultCredentialsError(error)) {
      disableFirestoreRuntime();
    }
    console.warn("[firestore] tomorrow plan status update skipped", getErrorDetails(error));
    return saveDailySessionToFallback(nextSession);
  }
}

export async function advanceDailySession({ sessionId, observation }: AdvanceDailySessionInput): Promise<DailySession | null> {
  const firestore = await getFirestoreClient();
  if (!firestore) {
    const currentSession =
      inMemoryDailySessions.get(sessionId) ??
      (await loadFallbackDailySessions()).find((session) => session.id === sessionId) ??
      null;
    if (!currentSession) {
      return null;
    }

    const savedObservation = observation ? await createObservationEvent(observation) : null;
    const nextObservationCount = currentSession.observation_count + (savedObservation ? 1 : 0);
    const nextIndex = Math.min(currentSession.current_index + 1, currentSession.question_ids.length);
    const isCompleted = nextIndex >= currentSession.question_ids.length;
    const nextStatus: DailySessionStatus = isCompleted ? "completed" : "active";

    return saveDailySessionToFallback({
      ...currentSession,
      current_index: nextIndex,
      observation_count: nextObservationCount,
      status: nextStatus
    });
  }

  try {
    const sessionRef = firestore.collection(DAILY_SESSIONS_COLLECTION).doc(sessionId);
    const snapshot = await sessionRef.get();

    if (!snapshot.exists) {
      return null;
    }

    const currentSession = toSerializableDailySession(snapshot as QueryDocumentSnapshot);
    if (!currentSession) {
      return null;
    }

    const savedObservation = observation ? await createObservationEvent(observation) : null;
    const nextObservationCount = currentSession.observation_count + (savedObservation ? 1 : 0);
    const nextIndex = Math.min(currentSession.current_index + 1, currentSession.question_ids.length);
    const isCompleted = nextIndex >= currentSession.question_ids.length;
    const nextStatus: DailySessionStatus = isCompleted ? "completed" : "active";

    await sessionRef.set(
      removeUndefinedDeep({
        current_index: nextIndex,
        observation_count: nextObservationCount,
        status: nextStatus
      }),
      { merge: true }
    );

    return {
      ...currentSession,
      current_index: nextIndex,
      observation_count: nextObservationCount,
      status: nextStatus
    };
  } catch (error) {
    if (isMissingDefaultCredentialsError(error)) {
      disableFirestoreRuntime();
    }
    console.warn("[firestore] advance daily session skipped", getErrorDetails(error));
    const currentSession =
      inMemoryDailySessions.get(sessionId) ??
      (await loadFallbackDailySessions()).find((session) => session.id === sessionId) ??
      null;
    if (!currentSession) {
      return null;
    }

    const savedObservation = observation ? await createObservationEvent(observation) : null;
    const nextObservationCount = currentSession.observation_count + (savedObservation ? 1 : 0);
    const nextIndex = Math.min(currentSession.current_index + 1, currentSession.question_ids.length);
    const isCompleted = nextIndex >= currentSession.question_ids.length;
    const nextStatus: DailySessionStatus = isCompleted ? "completed" : "active";

    return saveDailySessionToFallback({
      ...currentSession,
      current_index: nextIndex,
      observation_count: nextObservationCount,
      status: nextStatus
    });
  }
}

export async function getDailyReviewForSession(dailySessionId: string): Promise<DailyReview | null> {
  const firestore = await getFirestoreClient();
  if (!firestore) {
    return getDailyReviewFromFallback(dailySessionId);
  }

  try {
    const snapshot = await firestore
      .collection(DAILY_REVIEWS_COLLECTION)
      .where("daily_session_id", "==", dailySessionId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return toSerializableDailyReview(snapshot.docs[0]);
  } catch (error) {
    if (isMissingDefaultCredentialsError(error)) {
      disableFirestoreRuntime();
    }
    console.warn("[firestore] daily review lookup skipped", getErrorDetails(error));
    return getDailyReviewFromFallback(dailySessionId);
  }
}

export async function getTomorrowPlanForSession(dailySessionId: string): Promise<TomorrowPlan | null> {
  const firestore = await getFirestoreClient();
  if (!firestore) {
    return getTomorrowPlanFromFallback(dailySessionId);
  }

  try {
    const snapshot = await firestore
      .collection(TOMORROW_PLANS_COLLECTION)
      .where("daily_session_id", "==", dailySessionId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return toSerializableTomorrowPlan(snapshot.docs[0]);
  } catch (error) {
    if (isMissingDefaultCredentialsError(error)) {
      disableFirestoreRuntime();
    }
    console.warn("[firestore] tomorrow plan lookup skipped", getErrorDetails(error));
    return getTomorrowPlanFromFallback(dailySessionId);
  }
}

export async function generateDailyReviewForSession({
  sessionId
}: GenerateDailyReviewInput): Promise<{ session: DailySession; review: DailyReview } | null> {
  const session = await getDailySessionById(sessionId);
  if (!session || session.status !== "completed") {
    return null;
  }

  const existingReview = await getDailyReviewForSession(sessionId);
  if (existingReview) {
    const updatedSession =
      session.review_status === "generated"
        ? session
        : await updateDailySessionReviewStatus(session, "generated");

    return {
      session: updatedSession,
      review: existingReview
    };
  }

  const observations = await getObservationEventsForDailySession(sessionId);
  if (observations.length === 0) {
    return null;
  }

  const memorySummary = await getLatestMemorySummary();
  const reviewInput = buildDailyReviewInput({
    dailySessionId: sessionId,
    observations,
    memorySummary
  });
  const review = await createDailyReview(reviewInput);
  if (!review) {
    return null;
  }

  const updatedSession = await updateDailySessionReviewStatus(session, "generated");

  return {
    session: updatedSession,
    review
  };
}

export async function generateTomorrowPlanForSession({
  sessionId
}: GenerateTomorrowPlanInput): Promise<{ session: DailySession; plan: TomorrowPlan } | null> {
  const session = await getDailySessionById(sessionId);
  if (!session || session.status !== "completed" || session.review_status !== "generated") {
    return null;
  }

  const review = await getDailyReviewForSession(sessionId);
  if (!review) {
    return null;
  }

  const existingPlan = await getTomorrowPlanForSession(sessionId);
  if (existingPlan) {
    const updatedSession =
      session.tomorrow_plan_status === "generated"
        ? session
        : await updateDailySessionTomorrowPlanStatus(session, "generated");

    return {
      session: updatedSession,
      plan: existingPlan
    };
  }

  const observations = await getObservationEventsForDailySession(sessionId);
  if (observations.length === 0) {
    return null;
  }

  const memorySummary = await getLatestMemorySummary();
  const planInput = buildTomorrowPlanInput({
    dailySessionId: sessionId,
    dailyReview: review,
    observations,
    memorySummary
  });
  const plan = await createTomorrowPlan(planInput);
  if (!plan) {
    return null;
  }

  const updatedSession = await updateDailySessionTomorrowPlanStatus(session, "generated");

  return {
    session: updatedSession,
    plan
  };
}

export async function getObservationEventsForDailySession(dailySessionId: string): Promise<ObservationEvent[]> {
  const firestore = await getFirestoreClient();
  if (!firestore) {
    return getObservationEventsFromFallback(dailySessionId);
  }

  try {
    const snapshot = await firestore
      .collection(OBSERVATION_EVENTS_COLLECTION)
      .where("daily_session_id", "==", dailySessionId)
      .get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs
      .map((eventSnapshot) => toSerializableObservationEvent(eventSnapshot))
      .filter((event): event is ObservationEvent => event !== null)
      .sort((left, right) => {
        if (left.question_index !== right.question_index) {
          return left.question_index - right.question_index;
        }

        if (left.created_at && right.created_at) {
          return left.created_at.localeCompare(right.created_at);
        }

        return left.id.localeCompare(right.id);
      });
  } catch (error) {
    if (isMissingDefaultCredentialsError(error)) {
      disableFirestoreRuntime();
    }
    console.warn("[firestore] observation events lookup skipped", getErrorDetails(error));
    return getObservationEventsFromFallback(dailySessionId);
  }
}

export async function getRecentSessions(limit = RECENT_SESSION_LIMIT): Promise<SessionRecord[]> {
  const firestore = await getFirestoreClient();
  if (!firestore) {
    return [];
  }

  try {
    const snapshot = await firestore
      .collection(SESSIONS_COLLECTION)
      .orderBy("created_at", "desc")
      .limit(limit)
      .get();

    if (snapshot.empty) {
      return [];
    }

    const sessions = snapshot.docs
      .map((sessionSnapshot) => toSerializableSession(sessionSnapshot))
      .filter((session): session is SessionRecord => session !== null);

    if (sessions.length > 0) {
      console.info("[firestore] recent sessions loaded", { count: sessions.length });
    }

    return sessions;
  } catch (error) {
    if (isMissingDefaultCredentialsError(error)) {
      disableFirestoreRuntime();
    }
    console.warn("[firestore] recent sessions lookup skipped", getErrorDetails(error));
    return [];
  }
}

export async function getLatestSession(): Promise<SessionRecord | null> {
  const [session] = await getRecentSessions(1);
  return session ?? null;
}

export async function getLatestDailySession(): Promise<DailySession | null> {
  const firestore = await getFirestoreClient();
  if (!firestore) {
    return getLatestDailySessionFromFallback();
  }

  try {
    const snapshot = await firestore
      .collection(DAILY_SESSIONS_COLLECTION)
      .orderBy("created_at", "desc")
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return toSerializableDailySession(snapshot.docs[0]);
  } catch (error) {
    if (isMissingDefaultCredentialsError(error)) {
      disableFirestoreRuntime();
    }
    console.warn("[firestore] latest daily session lookup skipped", getErrorDetails(error));
    return getLatestDailySessionFromFallback();
  }
}

export async function getLatestMemoryContext(): Promise<string | null> {
  const sessions = await getRecentSessions();
  return buildMemoryContext(sessions);
}

export async function getLatestMemorySummary(): Promise<MemorySummary | null> {
  const sessions = await getRecentSessions();
  return buildMemorySummary(sessions);
}
