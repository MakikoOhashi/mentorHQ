import type {
  CoachDecision,
  DeliberationEvent,
  DeliberationResponse,
  LearnerCase
} from "@/lib/deliberation/types";
import { applicationDefault, getApp, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, type Firestore, type QueryDocumentSnapshot, type Timestamp } from "firebase-admin/firestore";

export type SessionRecord = {
  id: string;
  learnerCase: LearnerCase;
  deliberation_events: DeliberationEvent[];
  coach_decision: CoachDecision;
  mode: DeliberationResponse["mode"];
  created_at?: string | null;
};

export type MemorySummary = {
  selectedIntervention: DeliberationResponse["coach_decision"]["selected_intervention"];
  previousNextQuestion: string | null;
  previousReason: string | null;
  memoryMessageHint: string;
};

type SaveSessionInput = {
  learnerCase: LearnerCase;
  deliberation: DeliberationResponse;
};

const SESSIONS_COLLECTION = "sessions";

let firestorePromise: Promise<Firestore | null> | null = null;

function isFirestoreDisabled(): boolean {
  const value = process.env.FIRESTORE_DISABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
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
    created_at: toSerializableCreatedAt(data.created_at)
  };
}

function buildMemoryContext(session: SessionRecord | null): string | null {
  const summary = buildMemorySummary(session);
  if (!summary) {
    return null;
  }

  const lines = [
    "Previous Session Memory",
    `- selected_intervention: ${summary.selectedIntervention}`,
    `- memory_message_hint: ${summary.memoryMessageHint}`,
    summary.previousNextQuestion ? `- previous_next_question:\n  ${summary.previousNextQuestion}` : null,
    summary.previousReason ? `- previous_reason:\n  ${summary.previousReason}` : null
  ].filter((line): line is string => Boolean(line));

  const memoryContext = lines.length > 1 ? lines.join("\n") : null;

  if (!memoryContext) {
    return null;
  }

  return memoryContext.slice(0, 300);
}

export function buildMemorySummary(session: SessionRecord | null): MemorySummary | null {
  if (!session) {
    return null;
  }

  const previousNextQuestion = session.coach_decision.next_question.trim() || null;
  const previousReason = session.coach_decision.reason.trim() || null;
  const selectedIntervention = session.coach_decision.selected_intervention;

  return {
    selectedIntervention,
    previousNextQuestion,
    previousReason,
    memoryMessageHint: `前回も ${selectedIntervention} でした。`
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
      mode: deliberation.mode,
      created_at: FieldValue.serverTimestamp()
    });

    await firestore
      .collection(SESSIONS_COLLECTION)
      .doc(crypto.randomUUID())
      .set(sessionPayload);
    console.info("[firestore] session saved");
  } catch (error) {
    console.warn("[firestore] save session skipped", getErrorDetails(error));
  }
}

export async function getLatestSession(): Promise<SessionRecord | null> {
  const firestore = await getFirestoreClient();
  if (!firestore) {
    return null;
  }

  try {
    const snapshot = await firestore.collection(SESSIONS_COLLECTION).orderBy("created_at", "desc").limit(1).get();

    if (snapshot.empty) {
      return null;
    }

    const session = toSerializableSession(snapshot.docs[0]);
    if (session) {
      console.info("[firestore] latest session loaded");
    }
    return session;
  } catch (error) {
    console.warn("[firestore] latest session lookup skipped", getErrorDetails(error));
    return null;
  }
}

export async function getLatestMemoryContext(): Promise<string | null> {
  const session = await getLatestSession();
  return buildMemoryContext(session);
}

export async function getLatestMemorySummary(): Promise<MemorySummary | null> {
  const session = await getLatestSession();
  return buildMemorySummary(session);
}
