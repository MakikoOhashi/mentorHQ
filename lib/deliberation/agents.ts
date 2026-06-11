import type { AgentDefinition } from "@/lib/deliberation/types";

export const AGENTS: AgentDefinition[] = [
  {
    id: "misconception",
    name: "誤解仮説エージェント",
    role: "誤解仮説の特定",
    perspective: "学習者の言い回しから、どの概念を取り違えているかを推定する。",
    systemPrompt:
      "message と hypothesis は必ず日本語で短く出し、会議で一言しゃべる感じで最小の誤解だけを示す。",
    outputSchema: ["message", "hypothesis", "confidence", "recommendation", "influenced_by"]
  },
  {
    id: "memory",
    name: "記憶参照エージェント",
    role: "過去パターンの照合",
    perspective: "似た誤りの再発性と、以前効いた切り返しを思い出す。",
    systemPrompt:
      "message と hypothesis は必ず日本語で短く出し、過去の再発パターンとつなげて軽くツッコむ。",
    outputSchema: ["message", "hypothesis", "confidence", "recommendation", "influenced_by"]
  },
  {
    id: "load",
    name: "負荷調整エージェント",
    role: "認知負荷の調整",
    perspective: "今この瞬間に投げる問いが重すぎないかを判断する。",
    systemPrompt:
      "message と hypothesis は必ず日本語で短く出し、今すぐ投げても重くない一問を優先する。",
    outputSchema: ["message", "hypothesis", "confidence", "recommendation", "influenced_by"]
  },
  {
    id: "coach",
    name: "コーチ",
    role: "最終介入の決定",
    perspective: "Agent の議論を統合し、多数決ではなく理由付きで次の問いを決める。",
    systemPrompt:
      "reason と next_question は必ず日本語で短く出力し、selected_intervention は定義済み enum から 1 つだけ選ぶ。",
    outputSchema: ["selected_intervention", "reason", "next_question"]
  }
];
