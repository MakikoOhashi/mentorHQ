import type {
  CoachDecision,
  DeliberationEvent,
  DeliberationResponse,
  LearnerCase
} from "@/lib/deliberation/types";

export type SessionRecord = {
  id: string;
  learnerCase: LearnerCase;
  deliberation_events: DeliberationEvent[];
  coach_decision: CoachDecision;
  mode: DeliberationResponse["mode"];
  created_at?: string | null;
};

type SaveSessionInput = {
  learnerCase: LearnerCase;
  deliberation: DeliberationResponse;
};

const SESSIONS_COLLECTION = "sessions";

let firestoreClientPromise: Promise<FirestoreClient | null> | null = null;

type FirestoreTimestampLike = {
  toDate?: () => Date;
};

type FirestoreDocSnapshot = {
  id: string;
  data: () => Record<string, unknown>;
};

type FirestoreClient = {
  collection: (name: string) => {
    doc: (id: string) => {
      set: (value: Record<string, unknown>) => Promise<void>;
    };
    orderBy: (field: string, direction: "desc" | "asc") => {
      limit: (count: number) => {
        get: () => Promise<{
          empty: boolean;
          docs: FirestoreDocSnapshot[];
        }>;
      };
    };
  };
};

function isFirestoreDisabled(): boolean {
  const value = process.env.FIRESTORE_DISABLED?.trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes";
}

function getErrorDetails(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }

  return {
    name: typeof error,
    message: String(error)
  };
}

async function getFirestoreClient(): Promise<FirestoreClient | null> {
  if (isFirestoreDisabled()) {
    return null;
  }

  if (!firestoreClientPromise) {
    firestoreClientPromise = (async () => {
      try {
        const { Firestore } = await import("@google-cloud/firestore");

        return new Firestore({
          projectId:
            process.env.FIRESTORE_PROJECT_ID?.trim() ||
            process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
            process.env.GCLOUD_PROJECT?.trim() ||
            undefined
        }) as unknown as FirestoreClient;
      } catch (error) {
        console.warn("[firestore] client init skipped", getErrorDetails(error));
        return null;
      }
    })();
  }

  return firestoreClientPromise;
}

function toSerializableCreatedAt(createdAt: unknown): string | null {
  if (!createdAt) {
    return null;
  }

  if (typeof createdAt === "string") {
    return createdAt;
  }

  const timestamp = createdAt as FirestoreTimestampLike;
  const date = timestamp.toDate?.();
  return date instanceof Date ? date.toISOString() : null;
}

function toSerializableSession(snapshot: FirestoreDocSnapshot): SessionRecord | null {
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

function getInterventionLabel(selectedIntervention: CoachDecision["selected_intervention"]): string {
  switch (selectedIntervention) {
    case "starting_point_check":
      return "起算点確認";
    case "contrast_check":
      return "対比確認";
    case "leg_breakdown":
      return "肢ごとの切り分け";
    case "integrated_retry":
      return "統合再回答";
    default:
      return selectedIntervention;
  }
}

function buildMemoryContext(session: SessionRecord | null): string | null {
  if (!session) {
    return null;
  }

  const revisionHypothesis =
    session.deliberation_events.find((event) => event.type === "revision")?.hypothesis?.trim() ?? "";
  const theme = session.learnerCase.theme?.trim();
  const intervention = getInterventionLabel(session.coach_decision.selected_intervention);

  const lines = [
    "Previous Memory:",
    theme ? `前回テーマ: ${theme}` : null,
    `前回は ${intervention} で介入した。`,
    revisionHypothesis ? `誤解仮説は「${revisionHypothesis}」だった。` : null
  ].filter((line): line is string => Boolean(line));

  return lines.length > 1 ? lines.join("\n") : null;
}

export async function saveDeliberationSession({ learnerCase, deliberation }: SaveSessionInput): Promise<void> {
  const firestore = await getFirestoreClient();
  if (!firestore) {
    return;
  }

  try {
    const { FieldValue } = await import("@google-cloud/firestore");

    await firestore
      .collection(SESSIONS_COLLECTION)
      .doc(crypto.randomUUID())
      .set({
        learnerCase,
        deliberation_events: deliberation.deliberation_events,
        coach_decision: deliberation.coach_decision,
        mode: deliberation.mode,
        created_at: FieldValue.serverTimestamp()
      });
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

    return toSerializableSession(snapshot.docs[0]);
  } catch (error) {
    console.warn("[firestore] latest session lookup skipped", getErrorDetails(error));
    return null;
  }
}

export async function getLatestMemoryContext(): Promise<string | null> {
  const session = await getLatestSession();
  return buildMemoryContext(session);
}
