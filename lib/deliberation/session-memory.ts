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
let firestoreModulePromise: Promise<FirestoreModule | null> | null = null;

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

type FirestoreConstructor = new (settings?: { projectId?: string }) => FirestoreClient;

type FirestoreFieldValue = {
  serverTimestamp: () => unknown;
};

type FirestoreModule = {
  Firestore: FirestoreConstructor;
  FieldValue: FirestoreFieldValue;
  debug: Record<string, unknown>;
};

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

function isFirestoreConstructor(value: unknown): value is FirestoreConstructor {
  return typeof value === "function";
}

function hasServerTimestamp(value: unknown): value is FirestoreFieldValue {
  return typeof value === "object" && value !== null && typeof (value as FirestoreFieldValue).serverTimestamp === "function";
}

function describeFirestoreImportShape(moduleValue: unknown): Record<string, unknown> {
  if (!moduleValue || typeof moduleValue !== "object") {
    return { moduleType: typeof moduleValue };
  }

  const moduleRecord = moduleValue as Record<string, unknown>;
  const defaultExport =
    moduleRecord.default && typeof moduleRecord.default === "object"
      ? (moduleRecord.default as Record<string, unknown>)
      : null;

  return {
    moduleType: typeof moduleValue,
    moduleKeys: Object.keys(moduleRecord).sort(),
    defaultType: typeof moduleRecord.default,
    defaultKeys: defaultExport ? Object.keys(defaultExport).sort() : [],
    firestoreExportType: typeof moduleRecord.Firestore,
    defaultFirestoreExportType: typeof defaultExport?.Firestore,
    fieldValueExportType: typeof moduleRecord.FieldValue,
    defaultFieldValueExportType: typeof defaultExport?.FieldValue
  };
}

async function loadFirestoreModule(): Promise<FirestoreModule | null> {
  if (isFirestoreDisabled()) {
    return null;
  }

  if (!firestoreModulePromise) {
    firestoreModulePromise = (async () => {
      try {
        const moduleValue = await import("@google-cloud/firestore");
        const importShape = describeFirestoreImportShape(moduleValue);
        const moduleRecord = moduleValue as Record<string, unknown>;
        const defaultExport =
          moduleRecord.default && typeof moduleRecord.default === "object"
            ? (moduleRecord.default as Record<string, unknown>)
            : null;

        const FirestoreExport = isFirestoreConstructor(moduleRecord.Firestore)
          ? moduleRecord.Firestore
          : isFirestoreConstructor(defaultExport?.Firestore)
            ? defaultExport.Firestore
            : isFirestoreConstructor(moduleRecord.default)
              ? moduleRecord.default
              : null;

        const FieldValueExport = hasServerTimestamp(moduleRecord.FieldValue)
          ? moduleRecord.FieldValue
          : hasServerTimestamp(defaultExport?.FieldValue)
            ? defaultExport.FieldValue
            : null;

        console.info("[firestore] import resolved", {
          ...importShape,
          resolvedFirestoreCtor: FirestoreExport?.name ?? null,
          resolvedFieldValue: Boolean(FieldValueExport)
        });

        if (!FirestoreExport || !FieldValueExport) {
          throw new TypeError("Unable to resolve Firestore exports from @google-cloud/firestore");
        }

        return {
          Firestore: FirestoreExport,
          FieldValue: FieldValueExport,
          debug: {
            ...importShape,
            resolvedFirestoreCtor: FirestoreExport.name ?? null,
            resolvedFieldValue: true
          }
        };
      } catch (error) {
        console.warn("[firestore] module import skipped", getErrorDetails(error));
        return null;
      }
    })();
  }

  return firestoreModulePromise;
}

async function getFirestoreClient(): Promise<FirestoreClient | null> {
  if (isFirestoreDisabled()) {
    return null;
  }

  if (!firestoreClientPromise) {
    firestoreClientPromise = (async () => {
      const firestoreModule = await loadFirestoreModule();
      if (!firestoreModule) {
        return null;
      }

      const projectId =
        process.env.FIRESTORE_PROJECT_ID?.trim() ||
        process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
        process.env.GCLOUD_PROJECT?.trim() ||
        undefined;

      try {
        const client = new firestoreModule.Firestore({
          projectId
        });

        console.info("[firestore] client init ok", {
          projectId: projectId ?? null,
          ctorName: firestoreModule.debug.resolvedFirestoreCtor ?? null,
          importBranch: firestoreModule.debug
        });

        return client;
      } catch (error) {
        console.warn("[firestore] client init skipped", {
          ...getErrorDetails(error),
          projectId: projectId ?? null,
          importBranch: firestoreModule.debug
        });
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
  const firestoreModule = await loadFirestoreModule();
  if (!firestore || !firestoreModule) {
    return;
  }

  try {
    await firestore
      .collection(SESSIONS_COLLECTION)
      .doc(crypto.randomUUID())
      .set({
        learnerCase,
        deliberation_events: deliberation.deliberation_events,
        coach_decision: deliberation.coach_decision,
        mode: deliberation.mode,
        created_at: firestoreModule.FieldValue.serverTimestamp()
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
