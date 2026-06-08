# MentorHQ

## Overview

MentorHQ is a coach-centered multi-agent system where specialized AI agents support a single coach’s decisions before the coach responds to the learner.

MentorHQ は AI Tutor ではなく、Coach Decision OS です。
学習者を直接支援するのではなく、Coach の判断を支援することを主目的にしています。

## Core Concept

- 学習者に直接話しかける主役は常に Coach
- Agent は learner-facing ではなく coach-facing
- Agent は教えるのではなく、観察・分析・推薦を行う
- 最後に学習者へ介入するのは Coach

## Two-column UI

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

## Question Flow

MentorHQ does not hardcode one teaching flow.
It treats question handling as coach-selected intervention strategies.

For the MVP, leg breakdown is the default observation strategy because it makes learner belief visible before explanation.
The coach can then choose a focused check question or integrated retry based on agent reports.

1. Select past exam question
2. Coach selects an intervention type based on current context
3. Default MVP strategy is leg breakdown
4. Ask learner to judge each selected leg as true / false / unsure
5. Ask short reason only when useful
6. Store learner belief separately from objective truth
7. Run relevant Agents
8. Coach selects next intervention
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
- leg_breakdown as default MVP intervention strategy
- intervention_type selection by Coach
- 短い理由入力
- Agent Reports
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
