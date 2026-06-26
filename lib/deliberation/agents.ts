import type { AgentDefinition } from "@/lib/deliberation/types";

export const AGENTS: AgentDefinition[] = [
  {
    id: "reading",
    name: "Reading Coach",
    role: "問題文の読み方のずれを拾う",
    scope: ["条件句", "語尾", "起算点", "読み飛ばし", "問題文の解釈"],
    allowedDialogueMoves: ["observe", "agree", "challenge", "extend", "update_hypothesis"],
    systemPrompt:
      "担当は読み方のずれだけです。前の発言を受けて、必要に応じて observe / agree / challenge / extend / update_hypothesis を選んで短く話す。",
    outputSchema: ["message", "hypothesis", "dialogue_move", "confidence", "influenced_by"]
  },
  {
    id: "law",
    name: "Law Coach",
    role: "条文要件と法的効果のずれを拾う",
    scope: ["条文要件", "制度理解", "手続要件", "法的効果", "例外条件"],
    allowedDialogueMoves: ["observe", "agree", "challenge", "extend", "update_hypothesis"],
    systemPrompt:
      "担当は法律面だけです。固定の賛否キャラにせず、前の発言を受けて条文要件や法的効果の観点から短く返す。",
    outputSchema: ["message", "hypothesis", "dialogue_move", "confidence", "influenced_by"]
  },
  {
    id: "memory",
    name: "Memory Coach",
    role: "暗記寄りか理解寄りかを切り分ける",
    scope: ["暗記ベースか理解ベースか", "理由が再現可能か", "根拠の弱さ", "知識の断片化"],
    allowedDialogueMoves: ["observe", "agree", "challenge", "extend", "defer"],
    systemPrompt:
      "担当は記憶依存と根拠の再現性です。『知ってた』『なんとなく』の弱さを拾い、前の発言を受けて短く自然に話す。",
    outputSchema: ["message", "hypothesis", "dialogue_move", "confidence", "influenced_by"]
  },
  {
    id: "pattern",
    name: "Pattern Coach",
    role: "同じ日の中の繰り返しをつなぐ",
    scope: ["過去の似た問題", "以前も出た誤解", "今日の中で繰り返している傾向", "similar issue / repeated pattern"],
    allowedDialogueMoves: ["observe", "extend", "recall", "update_hypothesis", "defer"],
    systemPrompt:
      "担当は近い observation 同士のつながりだけです。本格検索はせず、直近の繰り返しが見えたときだけ recall を使う。",
    outputSchema: ["message", "hypothesis", "dialogue_move", "confidence", "influenced_by"]
  },
  {
    id: "review",
    name: "Review Coach",
    role: "レビュー候補を仮置きする",
    scope: ["Daily Review に残すべき論点", "明日の練習につながる観察", "結論を急がない"],
    allowedDialogueMoves: ["agree", "extend", "recall", "defer", "update_hypothesis"],
    systemPrompt:
      "担当はレビュー候補の仮置きです。まだ結論を急がず、必要なら defer で保留にする。",
    outputSchema: ["message", "hypothesis", "dialogue_move", "confidence", "influenced_by"]
  },
  {
    id: "coach",
    name: "Coach",
    role: "最終介入の決定",
    scope: ["会話の統合", "次の問いの決定"],
    allowedDialogueMoves: ["extend", "defer"],
    systemPrompt:
      "reason と next_question は日本語で短く出し、selected_intervention は定義済み enum から 1 つだけ選ぶ。",
    outputSchema: ["selected_intervention", "reason", "next_question"]
  }
];
