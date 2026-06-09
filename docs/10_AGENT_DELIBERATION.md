# Agent Deliberation

## Purpose

この文書は MentorHQ における `agent_deliberation` を正式な設計概念として定義する。

MentorHQ の本質は「各 Agent が個別に分析すること」ではなく、「複数 Agent が学習者について解釈を形成していくこと」にある。

---

## Definition

`agent_deliberation` とは、複数 Agent がそれぞれの観測結果を共有し、互いの情報によって仮説・信頼度・推奨介入を更新するプロセスである。

重要なのは、これは UI 演出のための会話ではなく、Agent 間の情報共有と仮説更新そのものを表す設計概念だという点である。

---

## Conceptual Flow

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

---

## Input Sources

各 Agent は次の 3 種類の情報を材料に判断を更新する。

- learner answer
- past history
- other agent observations

---

## Agent Responsibilities

### Before

Agent
→ recommendation を出す

### After

Agent

- observation を出す
- 他 Agent の observation を受け取る
- recommendation を更新できる

---

## What Changes During Deliberation

`agent_deliberation` によって更新されうる要素:

- hypothesis
- confidence
- recommendation

`finding` や `evidence` が補強・修正されることもある。

---

## Example

### Step 1: Initial observation

`Misconception Agent`

「起算点誤認の可能性があります」

### Step 2: Cross-agent input

`Memory Agent`

「過去パターンとは完全には一致しません。条件見落としの可能性もあります」

### Step 3: Updated view

`Misconception Agent`

「起算点誤認の確信度を下げます」

### Step 4: Intervention shaping

`Load Agent`

「両仮説を一問で切り分け可能です」

### Step 5: Final decision

`Coach`

「起算点確認を採用します」

---

## Coach Relationship

Coach は Agent の多数決を採用しない。

Coach は最終判断者として、次を参考に `selected_intervention` を決定する。

- observation
- deliberation
- recommendation

---

## UI Implication

現在の Agent Reports は暫定的な表現である。

将来的には右カラムに `Agent Deliberation Stream` を表示し、各 Agent の更新過程が見えるようにする。

表示例:

```text
🧠 Misconception Agent
起算点誤認の可能性があります

🔁 Memory Agent
過去パターンとは一致しません

🧠 Misconception Agent
確信度を下げます

⚖️ Load Agent
確認コストは低いです

🎓 Coach
起算点確認を採用します
```

---

## Design Constraints

- `agent_deliberation` は learner-facing 会話ではない
- 各 Agent は独立性を保ちつつ、他 Agent の観測を参照できる
- MVP では重い多段推論より、軽量な仮説更新を優先する
- explainability を orchestration complexity より優先する
