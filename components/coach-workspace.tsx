"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CoachDecision,
  DeliberationEvent,
  DeliberationResponse,
  LearnerCase
} from "@/lib/deliberation/types";

type CoachWorkspaceProps = {
  initialCase: LearnerCase;
};

const agentIcons: Record<string, string> = {
  misconception: "🧠",
  memory: "🔁",
  load: "⚖️",
  coach: "🎓"
};

const roundLabels: Record<number, string> = {
  1: "Round 1 · Initial Observation",
  2: "Round 2 · Cross-Agent Review",
  3: "Round 3 · Recommendation Formation",
  4: "Round 4 · Coach Decision"
};

function formatTypeLabel(event: DeliberationEvent) {
  if (event.type === "observation") return "初期観測";
  if (event.type === "revision") return "仮説更新";
  if (event.type === "recommendation") return "介入提案";
  return "最終判断";
}

function formatSpeakerName(event: DeliberationEvent) {
  return event.speaker === "coach"
    ? "Coach"
    : `${event.speaker.charAt(0).toUpperCase()}${event.speaker.slice(1)} Agent`;
}

function getTone(event: DeliberationEvent) {
  if (event.speaker === "coach") return "consensus";
  if (event.type === "revision") return "primary";
  if (event.type === "recommendation") return "consensus";
  return "support";
}

function getDisplayedConfidence(event: DeliberationEvent) {
  if (event.type === "revision") {
    return event.confidence_after;
  }

  return event.confidence;
}

export function CoachWorkspace({ initialCase }: CoachWorkspaceProps) {
  const [learnerCase] = useState(initialCase);
  const [events, setEvents] = useState<DeliberationEvent[]>([]);
  const [decision, setDecision] = useState<CoachDecision | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "streaming" | "done" | "error">("idle");
  const [mode, setMode] = useState<"mock" | "ai">("mock");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timeoutIdsRef = useRef<number[]>([]);

  const clearScheduledUpdates = useCallback(() => {
    timeoutIdsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutIdsRef.current = [];
  }, []);

  const runDeliberation = useCallback(async () => {
    clearScheduledUpdates();
    setStatus("loading");
    setEvents([]);
    setDecision(null);
    setErrorMessage(null);

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

          if (index === payload.deliberation_events.length - 1) {
            const decisionTimeoutId = window.setTimeout(() => {
              setDecision(payload.coach_decision);
              setStatus("done");
            }, 220);
            timeoutIdsRef.current.push(decisionTimeoutId);
          }
        }, index * 540);
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

  const groupedEvents = useMemo(() => {
    return events.reduce<Record<number, DeliberationEvent[]>>((accumulator, event) => {
      accumulator[event.round] ??= [];
      accumulator[event.round].push(event);
      return accumulator;
    }, {});
  }, [events]);

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
            <p className="body-copy compact-copy">
              Agent 同士が互いの観測を受けて、仮説・confidence・推奨介入を更新します。
            </p>
            <button className="primary-button" onClick={() => void runDeliberation()} type="button">
              {status === "loading" || status === "streaming" ? "Running..." : "Run Deliberation"}
            </button>
            {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
          </article>
        </div>

        <div className="column">
          <div className="column-header">
            <p className="eyebrow">Agent Deliberation Stream</p>
            <h2>互いの観測で仮説が更新される流れ</h2>
          </div>

          <article className="panel discussion-panel">
            <div className="panel-heading tight discussion-heading">
              <div>
                <span className="panel-kicker">Deliberation Stream</span>
                <h3>AIスタッフ会議の実況</h3>
              </div>
              <span className="live-pill">
                {status === "done" ? "Completed" : status === "error" ? "Error" : "Live Deliberation"}
              </span>
            </div>

            <div className="round-list">
              {[1, 2, 3, 4].map((round) => (
                <section className="round-block" key={round}>
                  <div className="round-header">
                    <span className="trace-badge">{roundLabels[round]}</span>
                  </div>

                  <div className="discussion-timeline">
                    {(groupedEvents[round] ?? []).map((event, index) => (
                      <section className={`discussion-row tone-${getTone(event)}`} key={`${event.speaker}-${round}-${index}`}>
                        <div className="discussion-avatar" aria-hidden="true">
                          {agentIcons[event.speaker]}
                        </div>
                        <div className="discussion-bubble">
                          <div className="discussion-meta">
                            <span className="discussion-agent">{formatSpeakerName(event)}</span>
                            <span className="discussion-role">{formatTypeLabel(event)}</span>
                            <span className="confidence-chip">
                              {`${Math.round(getDisplayedConfidence(event) * 100)}%`}
                            </span>
                          </div>
                          <p>{event.message}</p>
                          <div className="trace-log">
                            <p>
                              <strong>Hypothesis:</strong> {event.hypothesis}
                            </p>
                            {"confidence_before" in event && event.confidence_before !== undefined ? (
                              <p>
                                <strong>Confidence:</strong> {Math.round(event.confidence_before * 100)}% →{" "}
                                {Math.round((event.confidence_after ?? event.confidence_before) * 100)}%
                              </p>
                            ) : null}
                            {event.influenced_by.length > 0 ? (
                              <p>
                                <strong>Influenced by:</strong> {event.influenced_by.join(", ")}
                              </p>
                            ) : (
                              <p>
                                <strong>Influenced by:</strong> independent initial read
                              </p>
                            )}
                            {event.recommendation ? (
                              <p>
                                <strong>Recommendation:</strong> {event.recommendation}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </section>
                    ))}

                    {status !== "done" && (groupedEvents[round] ?? []).length === 0 ? (
                      <div className="pending-row">このラウンドの発言を待っています…</div>
                    ) : null}
                  </div>
                </section>
              ))}
            </div>
          </article>

          <article className="panel spotlight decision-panel">
            <div className="decision-hero">
              <div>
                <span className="panel-kicker">Coach Decision</span>
                <h3>{decision?.selected_intervention ?? "Deliberation 完了後に表示されます"}</h3>
              </div>
              <p className="decision-summary">
                {decision?.reason ?? "Coach が多数決ではなく理由付きで最終介入を決めます。"}
              </p>
              <div className="decision-grid">
                <div className="decision-note">
                  <span className="summary-label">Next Question</span>
                  <p>{decision?.next_question ?? "Agent の更新が揃うまで待機中です。"}</p>
                </div>
                <div className="decision-note">
                  <span className="summary-label">Decision Basis</span>
                  <p>
                    {decision?.selected_intervention
                      ? "Cross-agent revision を踏まえて、最も観測効率の高い介入を採用。"
                      : "仮説更新・介入候補の絞り込みが進むとここに表示されます。"}
                  </p>
                </div>
              </div>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
