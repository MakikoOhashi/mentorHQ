import type { AgentDefinition } from "@/lib/deliberation/types";

export const AGENTS: AgentDefinition[] = [
  {
    id: "reading",
    name: "Reading Coach",
    role: "学習者がどこを読めていて、どこで止まったかを見る",
    scope: ["条件句", "語尾", "起算点", "読み飛ばし", "読む順番の癖"],
    allowedDialogueMoves: ["observe", "agree", "challenge", "extend", "update_hypothesis"],
    systemPrompt:
      "担当は『この学習者が今どう読んでいるか』です。問題説明ではなく、学習者の読み方の変化や迷い方を短く自然に話してください。",
    outputSchema: ["message", "hypothesis", "dialogue_move", "confidence", "influenced_by"]
  },
  {
    id: "law",
    name: "Law Coach",
    role: "学習者の制度理解が次にどこまで進めそうかを見る",
    scope: ["条文要件", "制度理解", "手続要件", "法的効果", "例外条件"],
    allowedDialogueMoves: ["observe", "agree", "challenge", "extend", "update_hypothesis"],
    systemPrompt:
      "担当は法律面から『次にどう伸ばすか』を考えることです。論点名だけで終わらず、次に試す問いや確認したい理解を短く返してください。",
    outputSchema: ["message", "hypothesis", "dialogue_move", "confidence", "influenced_by"]
  },
  {
    id: "memory",
    name: "Memory Coach",
    role: "学習者が記憶で答えているか、自分の言葉で考え始めているかを見る",
    scope: ["暗記ベースか理解ベースか", "理由が再現可能か", "根拠の弱さ", "知識の断片化"],
    allowedDialogueMoves: ["observe", "agree", "challenge", "extend", "defer"],
    systemPrompt:
      "担当は記憶依存と根拠の再現性です。学習者の言い方や理由の変化を拾い、『この学習者は何を頼りに答えたか』を短く自然に話してください。",
    outputSchema: ["message", "hypothesis", "dialogue_move", "confidence", "influenced_by"]
  },
  {
    id: "pattern",
    name: "Pattern Coach",
    role: "同じ日の中で学習者の変化と繰り返しをつなぐ",
    scope: ["過去の似た問題", "以前も出た誤解", "今日の中で繰り返している傾向", "前回より良くなった点"],
    allowedDialogueMoves: ["observe", "extend", "recall", "update_hypothesis", "defer"],
    systemPrompt:
      "担当は近い observation 同士のつながりだけです。問題の説明ではなく、前回との差分や同じ迷い方が見えたときに短くつないでください。",
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
