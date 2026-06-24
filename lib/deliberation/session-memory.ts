import type {
  CoachDecision,
  DailyReviewStatus,
  DailySession,
  DailySessionStatus,
  DeliberationEvent,
  DeliberationResponse,
  LearnerCase
} from "@/lib/deliberation/types";
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

type MisunderstandingType = "starting_point_confusion" | "condition_omission" | "unknown";

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
};

export type AdvanceDailySessionInput = {
  sessionId: string;
};

const SESSIONS_COLLECTION = "sessions";
const DAILY_SESSIONS_COLLECTION = "daily_sessions";
const RECENT_SESSION_LIMIT = 5;
const inMemoryDailySessions = new Map<string, DailySession>();
const DAILY_SESSIONS_FALLBACK_PATH = join("/tmp", "mentorhq-daily-sessions.json");

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
    case "unknown":
      return "誤解パターン";
    default:
      return misunderstandingType ?? "誤解パターン";
  }
}

function eventTexts(deliberationEvents: DeliberationEvent[]): string {
  return deliberationEvents
    .filter((event) => event.speaker === "misconception" || event.type === "revision")
    .map((event) => `${event.hypothesis ?? ""} ${event.message}`)
    .join(" ")
    .toLowerCase();
}

function detectMisunderstandingTypeFromParts(
  coachDecision: CoachDecision,
  deliberationEvents: DeliberationEvent[]
): MisunderstandingType {
  const text = eventTexts(deliberationEvents);
  const startingPointCueCount = [
    coachDecision.selected_intervention === "starting_point_check" || false,
    /起算点/g.test(text),
    /いつから/g.test(text),
    /知った時/g.test(text)
  ].filter(Boolean).length;
  const conditionCueCount = [/条件/g.test(text), /読み落とし/g.test(text), /見落とし/g.test(text)].filter(Boolean)
    .length;

  if (conditionCueCount >= 2) {
    return "condition_omission";
  }

  if (startingPointCueCount >= 1) {
    return "starting_point_confusion";
  }

  if (conditionCueCount >= 1) {
    return "condition_omission";
  }

  return "unknown";
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
    review_status: isDailyReviewStatus(data.review_status) ? data.review_status : "pending"
  };
}

function isDailySessionStatus(value: unknown): value is DailySessionStatus {
  return value === "draft" || value === "active" || value === "completed";
}

function isDailyReviewStatus(value: unknown): value is DailyReviewStatus {
  return value === "pending" || value === "ready";
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

    return sessions;
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
  reviewStatus = "pending"
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
    review_status: reviewStatus
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

export async function advanceDailySession({ sessionId }: AdvanceDailySessionInput): Promise<DailySession | null> {
  const firestore = await getFirestoreClient();
  if (!firestore) {
    const currentSession =
      inMemoryDailySessions.get(sessionId) ??
      (await loadFallbackDailySessions()).find((session) => session.id === sessionId) ??
      null;
    if (!currentSession) {
      return null;
    }

    const nextObservationCount = currentSession.observation_count + 1;
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

    const nextObservationCount = currentSession.observation_count + 1;
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

    const nextObservationCount = currentSession.observation_count + 1;
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
