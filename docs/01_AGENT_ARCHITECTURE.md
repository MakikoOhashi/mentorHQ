# Agent Architecture

## System Layout

MentorHQ の基本構成は、中央に Coach、左に Learner interaction、右に Agent reports を置く 2 カラム構成とする。

```text
┌──────────────────────────────┬──────────────────────────────┐
│ Left Column                  │ Right Column                 │
│ Learner ↔ Coach              │ Agent Reports for Coach      │
│                              │                              │
│ - Question                   │ - Memory Agent               │
│ - Learner answer             │ - Misconception Agent        │
│ - Reflection input           │ - Milestone Agent            │
│ - Coach response             │ - Health Agent               │
│ - Final integrated question  │ - Load Agent                 │
└──────────────────────────────┴──────────────────────────────┘
                     \            |            /
                      \           |           /
                           Final Coach Judgment
```

## Core Roles

### Learner

- 問題に答える
- 各脚を true / false / unsure で判断する
- 必要に応じて短い理由を書く
- Coach の問い返しに再考で応じる

### Coach

- 学習者からの入力を受け取る
- Agent report を比較する
- 今回扱う論点を 1 つに絞る
- 学習者への介入文と次アクションを決める
- 最終 decision trace を残す

### Agents

各 Agent は以下の共通 schema で Coach を支援する。

- finding
- risk
- recommendation
- confidence
- evidence

## Agent Constellation

MentorHQ MVP では以下を周辺 Agent とする。

- Memory Agent
- Misconception Agent
- Milestone Agent
- Health Agent
- Load Agent

各 Agent は Coach に対して report を返し、Coach が最終判断する。

```text
Memory Agent ───────────────┐
Misconception Agent ────────┤
Milestone Agent ────────────┼──> Coach ───> Learner
Health Agent ───────────────┤
Load Agent ─────────────────┘
```

## Report Contract

Agent の出力は learner-facing message ではなく、coach-facing decision material とする。

最低限の出力項目:

- finding: 何が起きているか
- risk: 何を注意すべきか
- recommendation: 次に何をすべきか
- confidence: 推定の確からしさ
- evidence: どの事実に基づくか

## UI Composition Proposal

### Left Column

- Question
- Learner answer
- Reflection input
- Coach response
- Final integrated question

### Right Column

- Agent reports
- Confidence
- Evidence
- Recommendation
- Final coach decision trace

## Interaction Principle

- Agent は学習者へ直接話しかけない
- Coach は複数 Agent 提案を統合する
- 1 回の介入で扱う論点は 1 つに絞る
- Agent は autonomous teacher ではなく analytical assistant として振る舞う

## Architecture Boundary

MVP の範囲では、Agent 間の重い相互依存は持たせない。

- 各 Agent は shared facts と derived state から推定する
- report の統合責務は Coach に置く
- orchestration よりも explainability を優先する
