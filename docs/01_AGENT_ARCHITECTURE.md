# Agent Architecture

## System Layout

MentorHQ の基本構成は、中央に Coach、左に Learner interaction、右に Agent observation / deliberation material を置く 2 カラム構成とする。

```text
┌──────────────────────────────┬──────────────────────────────┐
│ Left Column                  │ Right Column                 │
│ Learner ↔ Coach              │ Agent Deliberation for Coach │
│                              │                              │
│ - Question                   │ - Memory Agent               │
│ - Learner answer             │ - Misconception Agent        │
│ - Reflection input           │ - Milestone Agent            │
│ - Coach response             │ - Health Agent               │
│ - Final integrated question  │ - Load Agent                 │
└──────────────────────────────┴──────────────────────────────┘
                     \            |            /
                      \           |           /
                           Coach Decision
```

## Core Architecture Flow

従来の中心概念は「各 Agent が独立に分析して recommendation を返すこと」だった。

新設計では、MentorHQ の本質を次の流れとして定義する。

```text
Learner
  ↓
Initial Agent Observations
  ↓
Agent Deliberation
  ↓
Coach Decision
  ↓
Intervention
```

このため Agent は独立したレポート生成器ではなく、相互に観測を参照しながら仮説と recommendation を更新する分析主体として扱う。

## Core Roles

### Learner

- 問題に答える
- 各脚を true / false / unsure で判断する
- 必要に応じて短い理由を書く
- Coach の問い返しに再考で応じる

### Coach

- 学習者からの入力を受け取る
- initial observation と deliberation を比較する
- 今回扱う論点を 1 つに絞る
- 学習者への介入文と `next_action` を決める
- 最終 `decision_trace` を残す

### Agents

各 Agent は以下の共通 schema で Coach を支援する。

- finding
- risk
- recommendation
- confidence
- evidence

加えて各 Agent は次の責務を持つ。

- initial observation を出す
- 他 Agent の observation を受け取る
- hypothesis / confidence / recommendation を更新する

## Agent Deliberation

`agent_deliberation` とは、複数 Agent がそれぞれの観測結果を共有し、互いの情報によって仮説・信頼度・推奨介入を更新するプロセスである。

重要なのは、これは UI 演出のための会話ではなく、Agent 間の情報共有と仮説更新そのものを表す設計概念だという点である。

## Agent Constellation

MentorHQ MVP では以下を周辺 Agent とする。

- Memory Agent
- Misconception Agent
- Milestone Agent
- Health Agent
- Load Agent

各 Agent はまず initial observation を返し、その後 `agent_deliberation` を通じて recommendation を更新する。Coach はその過程を踏まえて最終判断する。

```text
Memory Agent ───────────────┐
Misconception Agent ────────┼──> Agent Deliberation ───> Coach ───> Learner
Milestone Agent ────────────┤
Health Agent ───────────────┤
Load Agent ─────────────────┘
```

## Observation Contract

Agent の出力は learner-facing message ではなく、coach-facing decision material とする。

最低限の出力項目:

- finding: 何が起きているか
- risk: 何を注意すべきか
- recommendation: 次に何をすべきか
- confidence: 推定の確からしさ
- evidence: どの事実に基づくか

この contract は initial observation にも deliberation 後の更新版にも適用される。

## UI Composition Proposal

### Left Column

- Question
- Learner answer
- Reflection input
- Coach response
- Final integrated question

### Right Column

- Initial agent observations
- Agent deliberation stream
- Confidence
- Evidence
- Recommendation
- Decision trace

## Interaction Principle

- Agent は学習者へ直接話しかけない
- Agent は他 Agent の観測を受けて判断を更新できる
- Coach は複数 Agent 提案の多数決を採らず、観測と deliberation を統合する
- 1 回の介入で扱う論点は 1 つに絞る
- Agent は autonomous teacher ではなく analytical assistant として振る舞う

## Architecture Boundary

MVP の範囲では、Agent 間の重い相互依存は持たせない。

- 各 Agent は shared facts、past history、他 Agent の観測結果から推定する
- `agent_deliberation` は軽量な仮説更新プロセスとして扱う
- 最終統合責務は Coach に置く
- orchestration よりも explainability を優先する
