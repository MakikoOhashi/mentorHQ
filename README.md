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

MentorHQ の出題フローは、いきなり一問を丸ごと解かせるのではなく、思考過程を観測するために分解して扱います。

1. Select past exam question
2. Break question into individual choices/legs
3. Ask learner to judge each leg as true / false / unsure
4. Ask short reason only when useful
5. Store learner belief separately from objective truth
6. Run Misconception Agent and Memory Agent
7. Coach gives targeted intervention
8. Repeat for relevant choices
9. Show original integrated multiple-choice question
10. Ask final answer
11. Compare local leg-level understanding with final integrated performance
12. Store outcome

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
- 脚ごとの ○× 判断
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
