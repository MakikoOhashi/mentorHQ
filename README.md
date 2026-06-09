# MentorHQ

## Overview

MentorHQ is a coach-centered multi-agent system where specialized AI agents support a single coach’s decisions before the coach responds to the learner.

MentorHQ は AI Tutor ではなく、Coach Decision OS です。
学習者を直接支援するのではなく、Coach の判断を支援することを主目的にしています。

## Core Concept

- 学習者に直接話しかける主役は常に Coach
- Agent は learner-facing ではなく coach-facing
- Agent は教えるのではなく、観察・分析・推薦を行う
- Agent は他 Agent の観測を受けて判断を更新する
- 最後に学習者へ介入するのは Coach

## Deliberation Model

MentorHQ は「Agent が個別に分析するシステム」ではなく、
「複数 Agent が学習者について解釈を形成し、その上で Coach が意思決定するシステム」として設計する。

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

## Two-column UI

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

## Question Flow

MentorHQ does not hardcode one teaching flow.
It treats question handling as coach-selected `intervention_type`s.

For the MVP, leg breakdown is the default `intervention_type` because it makes learner belief visible before explanation.
The coach can then choose a focused check question or integrated retry based on agent observations and deliberation.

1. Select past exam question
2. Coach selects an intervention type based on current context
3. Default MVP `intervention_type` is leg_breakdown
4. Ask learner to judge each selected leg as true / false / unsure
5. Ask short reason only when useful
6. Store learner belief separately from objective truth
7. Run relevant Agents
8. Coach selects the next `selected_intervention`
9. Repeat only if the next observation is useful
10. Show original integrated multiple-choice question when ready
11. Ask final answer
12. Compare local leg-level understanding with final integrated performance
13. Store outcome

## Agent Catalog

- Memory Agent
- Misconception Agent
- Milestone Agent
- Health Agent
- Load Agent

各 Agent は答えを返すのではなく、Coach に以下を渡します。

- Finding
- Risk
- Recommendation
- Confidence
- Evidence

## MVP Scope

### In Scope

- 左右 2 カラム UI
- 過去問 1 問
- leg_breakdown as default MVP intervention_type
- intervention_type selection by Coach
- 短い理由入力
- Agent Reports
- Agent Deliberation
- Coach Decision
- Final integrated question
- Decision trace
- Local JSON memory or simple storage

### Out of Scope

- 完全な問題 DB
- ログイン
- 課金
- 本格 Firestore
- OpenMetadata
- 会社全体の経営シミュレーション
- Marketing Agent
- Back Office Agent
- 汎用資格対応

## Hackathon Target

- DevOps x AI Agent Hackathon
- Google Cloud Run + Gemini API planned
- 題材は管理業務主任者試験

## Design Docs

- `docs/00_VISION.md`
- `docs/01_AGENT_ARCHITECTURE.md`
- `docs/02_AGENT_CATALOG.md`
- `docs/03_COACH_DECISION_FLOW.md`
- `docs/04_QUESTION_FLOW.md`
- `docs/05_DATA_MODEL.md`
- `docs/06_MVP_SCOPE.md`
- `docs/07_IMPLEMENTATION_PLAN.md`
- `docs/08_TERMINOLOGY.md` - MentorHQ の canonical terminology, naming rules, ambiguous term handling
- `docs/09_UI_BLUEPRINT.md` - MentorHQ MVP の2カラムUI、state-based UI flow、mock data contract を定義する設計書
- `docs/10_AGENT_DELIBERATION.md` - Agent Deliberation の定義、責務変更、UI 含意を定義する設計書

## Phase 1 Static UI

このリポジトリには、Phase 1 用の静的な `Mentor Workspace` 画面を追加しています。

- 左: `Learner / Coach Workspace`
- 右: `Coach Decision Workspace`
- すべて固定 mock data
- API / DB / 認証なし

### Run

```bash
npm install
npm run dev
```

その後、[http://localhost:3000](http://localhost:3000) を開いてください。
