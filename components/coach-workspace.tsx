"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CoachDecision,
  DeliberationEvent,
  DeliberationResponse,
  LearnerCase
} from "@/lib/deliberation/types";

type CoachWorkspaceProps = {
  initialCase: LearnerCase;
};

type StreamEvent = {
  id: string;
  event: DeliberationEvent;
  phase: "live" | "exiting";
};

const agentIcons: Record<string, string> = {
  misconception: "🧠",
  memory: "🔁",
  load: "⚖️",
  coach: "🎓"
};

const shortSpeakerLabels: Record<string, string> = {
  misconception: "誤解担当",
  memory: "記憶担当",
  load: "負荷担当",
  coach: "コーチ"
};

function formatSpeakerName(event: DeliberationEvent) {
  return shortSpeakerLabels[event.speaker] ?? event.speaker_label;
}

function getTone(event: DeliberationEvent) {
  if (event.speaker === "coach") return "consensus";
  if (event.type === "revision") return "primary";
  if (event.type === "challenge") return "primary";
  if (event.type === "recommendation") return "consensus";
  return "support";
}

function formatDecisionLabel(value?: string | null) {
  if (!value) return "Deliberation 完了後に表示されます";
  if (value === "starting_point_check") return "起算点の確認から入る";
  if (value === "contrast_check") return "比較でズレをあぶり出す";
  if (value === "leg_breakdown") return "肢を分けて読み直す";
  if (value === "integrated_retry") return "理解をまとめて再挑戦する";
  return value;
}

function getStreamStatus(status: "idle" | "loading" | "streaming" | "done" | "error") {
  if (status === "done") {
    return {
      kicker: "Decision Reached",
      title: "Agent Deliberation",
      pill: "Decision Reached"
    };
  }

  if (status === "error") {
    return {
      kicker: "Deliberation Error",
      title: "Agent Deliberation",
      pill: "Error"
    };
  }

  return {
    kicker: "Agent Deliberation",
    title: "Thinking...",
    pill: "Thinking..."
  };
}

const EVENT_DURATIONS: Record<DeliberationEvent["type"], number> = {
  observation: 1500,
  challenge: 2000,
  revision: 2500,
  recommendation: 2000,
  coach_decision: 3000
};

const MAX_VISIBLE_EVENTS = 5;
const EXIT_ANIMATION_MS = 420;

function getCumulativeEventDelay(events: DeliberationEvent[], index: number) {
  let total = 350;

  for (let currentIndex = 0; currentIndex <= index; currentIndex += 1) {
    total += EVENT_DURATIONS[events[currentIndex].type];
  }

  return total;
}

export function CoachWorkspace({ initialCase }: CoachWorkspaceProps) {
  const [learnerCase] = useState(initialCase);
  const [events, setEvents] = useState<DeliberationEvent[]>([]);
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [decision, setDecision] = useState<CoachDecision | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "streaming" | "done" | "error">("idle");
  const [mode, setMode] = useState<"mock" | "ai">("mock");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);
  const sequenceRef = useRef(0);

  const clearScheduledUpdates = useCallback(() => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current = [];
  }, []);

  const runDeliberation = useCallback(async () => {
    clearScheduledUpdates();
    setStatus("loading");
    setEvents([]);
    setStreamEvents([]);
    setDecision(null);
    setErrorMessage(null);
    sequenceRef.current = 0;

    try {
      const response = await fetch("/api/deliberate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ learnerCase })
      });

      if (!response.ok) {
        throw new Error("Deliberation request failed.");
      }

      const payload = (await response.json()) as DeliberationResponse;
      setMode(payload.mode);
      setStatus("streaming");

      payload.deliberation_events.forEach((event, index) => {
        const timeoutId = window.setTimeout(() => {
          setEvents((current) => [...current, event]);
          sequenceRef.current += 1;

          const streamId = `${event.speaker}-${event.round}-${sequenceRef.current}`;
          setStreamEvents((current) => {
            const next = [...current, { id: streamId, event, phase: "live" as const }];

            if (next.length > MAX_VISIBLE_EVENTS) {
              const oldestLiveIndex = next.findIndex((item) => item.phase === "live");

              if (oldestLiveIndex >= 0) {
                const exitingId = next[oldestLiveIndex].id;
                next[oldestLiveIndex] = { ...next[oldestLiveIndex], phase: "exiting" };

                const removalTimeoutId = window.setTimeout(() => {
                  setStreamEvents((rendered) => rendered.filter((item) => item.id !== exitingId));
                }, EXIT_ANIMATION_MS);
                timeoutIdsRef.current.push(removalTimeoutId);
              }
            }

            return next;
          });

          if (index === payload.deliberation_events.length - 1) {
            const decisionTimeoutId = window.setTimeout(() => {
              setDecision(payload.coach_decision);
              setStatus("done");
            }, 220);
            timeoutIdsRef.current.push(decisionTimeoutId);
          }
        }, getCumulativeEventDelay(payload.deliberation_events, index));
        timeoutIdsRef.current.push(timeoutId);
      });
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
    }
  }, [clearScheduledUpdates, learnerCase]);

  useEffect(() => {
    void runDeliberation();
    return () => {
      clearScheduledUpdates();
    };
  }, [clearScheduledUpdates, runDeliberation]);

  const visibleLiveCount = streamEvents.filter((item) => item.phase !== "exiting").length;

  const streamStatus = getStreamStatus(status);

  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">MentorHQ MVP Demo</p>
          <h1>Agent Deliberation Workspace</h1>
        </div>
        <div className="hero-meta">
          <span>{learnerCase.exam}</span>
          <span>{learnerCase.theme}</span>
          <span>{mode === "ai" ? "AI Deliberation" : "Mock Fallback"}</span>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="column">
          <div className="column-header">
            <p className="eyebrow">ケース概要</p>
            <h2>学習者の状況</h2>
          </div>

          <article className="panel compact problem-panel">
            <div className="panel-heading tight">
              <span className="panel-kicker">問題</span>
              <h3>{learnerCase.questionTitle}</h3>
            </div>
            <p className="body-copy compact-copy">{learnerCase.questionStem}</p>
            <p className="leg-statement">{learnerCase.currentLeg}</p>
          </article>

          <article className="panel compact answer-panel">
            <div className="compact-stack">
              <div>
                <span className="summary-label">学習者の回答</span>
                <p className="value-text">{learnerCase.learnerAnswer}</p>
              </div>
              <div>
                <span className="summary-label">理由</span>
                <div className="reflection-box">{learnerCase.reason}</div>
              </div>
              <div>
                <span className="summary-label">客観的真偽</span>
                <div className="reflection-box">{learnerCase.objectiveTruth}</div>
              </div>
            </div>
          </article>

          <article className="panel compact answer-panel">
            <div className="panel-heading tight">
              <span className="panel-kicker">Run Control</span>
              <h3>Deliberation を再実行</h3>
            </div>
            <p className="body-copy compact-copy">短い発言を流しながら、次の一問を絞り込みます。</p>
            <button className="primary-button" onClick={() => void runDeliberation()} type="button">
              {status === "loading" || status === "streaming" ? "Running..." : "Run Deliberation"}
            </button>
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
          </article>
        </div>

        <div className="column">
          <div className="column-header">
            <p className="eyebrow">Agent Deliberation Stream</p>
            <h2>AIスタッフ会議の実況</h2>
          </div>

          <article className="panel discussion-panel">
            <div className="panel-heading tight discussion-heading">
              <div>
                <span className="panel-kicker">{streamStatus.kicker}</span>
                <h3>{streamStatus.title}</h3>
              </div>
              <span className="live-pill">{streamStatus.pill}</span>
            </div>

            <div className="stream-viewport">
              <div className="discussion-timeline chat-timeline">
                {streamEvents.length === 0 ? (
                  <div className="pending-row">会議が立ち上がるのを待っています…</div>
                ) : null}

                {streamEvents.map(({ id, event, phase }, index) => {
                  const liveIndex = streamEvents
                    .filter((item) => item.phase !== "exiting")
                    .findIndex((item) => item.id === id);
                  const age = liveIndex >= 0 ? visibleLiveCount - liveIndex - 1 : MAX_VISIBLE_EVENTS;
                  const isLatest = phase !== "exiting" && age === 0;
                  const isPrevious = phase !== "exiting" && age === 1;

                  return (
                  <section
                    className={`discussion-row chat-row tone-${getTone(event)} ${
                      event.type === "revision" ? "is-revision" : ""
                    } ${event.type === "coach_decision" ? "is-coach-decision" : ""} ${
                      phase === "exiting" ? "is-exiting" : ""
                    } ${isLatest ? "is-latest" : ""} ${isPrevious ? "is-previous" : ""} stream-depth-${Math.min(
                      age,
                      MAX_VISIBLE_EVENTS - 1
                    )}`}
                    key={id}
                  >
                    <div className="discussion-avatar" aria-hidden="true">
                      {agentIcons[event.speaker]}
                    </div>
                    <div className="discussion-bubble">
                      <div className="discussion-meta">
                        <span className="discussion-agent">{formatSpeakerName(event)}</span>
                        {event.type === "revision" ? <span className="discussion-role">考えが変わった</span> : null}
                      </div>

                      <p>{event.message}</p>

                      {event.type === "revision" &&
                      event.confidence_before !== undefined &&
                      event.confidence_after !== undefined ? (
                        <div className="revision-block" aria-label="confidence revision">
                          <span className="revision-icon" aria-hidden="true">
                            🧠
                          </span>
                          <span className="revision-shift">見解更新</span>
                          <span className="delta-chip revision-delta">
                            {`${Math.round(event.confidence_before * 100)}% → ${Math.round(
                              event.confidence_after * 100
                            )}%`}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </section>
                  );
                })}

                {status === "streaming" || status === "loading" ? (
                  <div className="pending-row">次のひと言を考えています…</div>
                ) : null}
              </div>
            </div>
          </article>

          <article className="panel spotlight decision-panel">
            <div className="decision-hero">
              <div>
                <span className="panel-kicker">Coach Decision</span>
                <h3>{formatDecisionLabel(decision?.selected_intervention)}</h3>
              </div>
              <p className="decision-reached-label">
                {decision ? "Decision Reached" : "議論がまとまるとここに着地します"}
              </p>
              <p className="decision-summary">
                {decision?.reason ?? "最後にコーチがひとつに決め切ります。"}
              </p>
            </div>
          </article>

          <article className="panel next-question-panel">
            <div className="panel-heading tight">
              <span className="panel-kicker">Next Question</span>
              <h3>学習者へ返す次の一問</h3>
            </div>
            <p className="next-question-copy">
              {decision?.next_question ?? "Coach Decision の完了後に、ここへ固定表示されます。"}
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
