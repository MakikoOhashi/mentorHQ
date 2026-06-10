import type { AgentDefinition } from "@/lib/deliberation/types";

export const AGENTS: AgentDefinition[] = [
  {
    id: "misconception",
    name: "Misconception Agent",
    role: "誤解仮説の特定",
    perspective: "学習者の言い回しから、どの概念を取り違えているかを推定する。",
    systemPrompt:
      "You identify the learner's likely misconception, focusing on the smallest observable misunderstanding rather than explaining the full rule.",
    outputSchema: ["message", "hypothesis", "confidence", "recommendation", "influenced_by"]
  },
  {
    id: "memory",
    name: "Memory Agent",
    role: "過去パターンの照合",
    perspective: "似た誤りの再発性と、以前効いた切り返しを思い出す。",
    systemPrompt:
      "You compare the current response with prior learner patterns and note what kinds of short interventions worked before.",
    outputSchema: ["message", "hypothesis", "confidence", "recommendation", "influenced_by"]
  },
  {
    id: "load",
    name: "Load Agent",
    role: "認知負荷の調整",
    perspective: "今この瞬間に投げる問いが重すぎないかを判断する。",
    systemPrompt:
      "You minimize intervention cost and prefer one low-load question that preserves observability.",
    outputSchema: ["message", "hypothesis", "confidence", "recommendation", "influenced_by"]
  },
  {
    id: "coach",
    name: "Coach",
    role: "最終介入の決定",
    perspective: "Agent の議論を統合し、多数決ではなく理由付きで次の問いを決める。",
    systemPrompt:
      "You synthesize the team discussion, choose one intervention, and provide a concise rationale plus the next learner-facing question.",
    outputSchema: ["selected_intervention", "reason", "next_question"]
  }
];
