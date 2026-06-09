# UI Blueprint

## Purpose

MentorHQ MVP の UI は学習アプリ画面ではない。

MentorHQ MVP の UI は、Coach が learner response を受け取り、`agent_report` を比較し、`selected_intervention` を決めるための Coach Decision UI である。

- 主役は learner-facing explanation ではなく Coach decision support
- 画面の価値は Agent の賢さそのものではなく、Coach が何を見て何を選ぶかを可視化すること
- Agent は learner に直接話さず、Coach だけが learner-facing message を出す

## Core Screen

画面名: `Mentor Workspace`

```text
┌──────────────────────────────┬──────────────────────────────┐
│ Learner / Coach Workspace    │ Coach Decision Workspace     │
│                              │                              │
│ - Question                   │ - Agent Reports              │
│ - Leg Judgment               │ - Coach Thinking             │
│ - Reflection Input           │ - Decision Trace             │
│ - Coach Response             │ - Selected Intervention      │
│ - Integrated Retry           │                              │
└──────────────────────────────┴──────────────────────────────┘
```

## Left Column: Learner / Coach Workspace

目的:

学習者と Coach の表側のやり取りを表示する。

### Question stem

- purpose: 今回扱う設問の文脈と対象テーマを示す
- source data: `question.stem`
- when visible: `initial_question_loaded` 以降、`final_answer_submitted` まで表示

### Current question_leg

- purpose: 現在観測中の脚・選択肢を明示する
- source data: `question_leg.leg_text`, `question_leg.leg_index`
- when visible: `leg_judgment_pending` から `coach_response_shown` まで表示

### true / false / unsure buttons

- purpose: 学習者の `learner_belief` を objective truth 開示前に取得する
- source data: `question_leg.leg_id`, `learner_belief.selected_judgment`
- when visible: `leg_judgment_pending` の間のみ表示

### confidence self-report

- purpose: 判断の強さを取り、誤信と迷いを区別する
- source data: `learner_belief.confidence_self_report`
- when visible: confidence が必要なケースのみ `leg_judgment_pending` で表示

### reflection input

- purpose: learner の短い reasoning signal を取り、誤解仮説の根拠にする
- source data: `reflection_event.text`
- when visible: `reflection_pending` の間、または Coach が追加観測を求める場合に表示

### Coach response

- purpose: Coach が選んだ介入を learner-facing message として返す
- source data: `selected_intervention.learner_facing_message`, `selected_intervention.next_action`
- when visible: `coach_response_shown` 以降に表示

### integrated_retry question

- purpose: 局所観測後に本来の一問へ戻し、統合理解を確認する
- source data: `question.stem`, `selected_intervention.intervention_type`
- when visible: `integrated_retry_ready` 以降に表示

### final answer input

- purpose: 最終的な integrated performance を記録する
- source data: `learner_belief.final_answer`, `answer_event`
- when visible: `integrated_retry_ready` から `final_answer_submitted` まで表示

## Right Column: Coach Decision Workspace

目的:

Coach の頭の中で何が起きているかを可視化する。

### Agent Reports

各 `agent_report` をカードで表示する。

カード項目:

- `agent_name`
- `finding`
- `risk`
- `recommendation`
- `confidence`
- `evidence`

表示方針:

- 各カードは coach-facing only
- recommendation は learner-facing message ではなく判断材料として表示
- evidence は短く箇条書きで見せ、比較しやすさを優先する

### Coach Thinking

Coach が複数 `agent_report` を比較する領域。

表示項目:

- `key_conflict`
- `selected_priority`
- `rejected_recommendations`
- `why_now`

表示方針:

- Agent 間の食い違いを明示する
- 何を採用し、何を見送ったかを同時に残す
- 「なぜ今その問い返しなのか」を 1 文で説明できる形にする

### Decision Trace

`decision_trace` を表示する。

表示項目:

- `selected_intervention`
- `intervention_type`
- `intervention_target`
- `observation_goal`
- `decision_reason`

表示方針:

- Coach の確定判断を state と一緒に残す
- 観測目的と介入対象を分けて表示する
- 後から見返しても「なぜこの一手だったか」がわかる粒度にする

### Selected Intervention

Coach が learner に返す最終介入。

表示項目:

- `learner_facing_message`
- `next_action`
- `expected_signal`

表示方針:

- learner に見せる文面そのものを確定版として表示する
- 期待している signal を明示し、介入の成否を観測できるようにする

## State-based UI Flow

### 1. `initial_question_loaded`

- trigger: question と current session が読み込まれた
- left column display: `question.stem`
- right column display: 空状態、または今回の観測目的の placeholder
- next state: `leg_judgment_pending`

### 2. `leg_judgment_pending`

- trigger: Coach が `leg_breakdown` または leg-level observation を開始した
- left column display: `question.stem`, `question_leg`, true / false / unsure, optional confidence
- right column display: Agent 未実行状態、current focus placeholder
- next state: `reflection_pending`

### 3. `reflection_pending`

- trigger: learner judgment が送信され、reflection を求める条件を満たした
- left column display: selected judgment, reflection input
- right column display: provisional observation note
- next state: `agent_reports_ready`

### 4. `agent_reports_ready`

- trigger: relevant Agents が `agent_report[]` を返した
- left column display: question, selected judgment, reflection summary
- right column display: Agent Reports cards
- next state: `coach_decision_ready`

### 5. `coach_decision_ready`

- trigger: Coach が `agent_report` 比較に必要な材料を揃えた
- left column display: learner inputs summary
- right column display: Agent Reports, Coach Thinking, draft Decision Trace
- next state: `coach_response_shown`

### 6. `coach_response_shown`

- trigger: Coach が `selected_intervention` を確定した
- left column display: Coach response
- right column display: finalized Decision Trace, Selected Intervention
- next state: `integrated_retry_ready`

### 7. `integrated_retry_ready`

- trigger: focused check 完了後、本来の一問へ戻す準備ができた
- left column display: integrated_retry question, final answer input
- right column display: previous Decision Trace, expected signal
- next state: `final_answer_submitted`

### 8. `final_answer_submitted`

- trigger: learner が本来の一問に最終回答した
- left column display: final answer summary
- right column display: local-vs-integrated comparison summary
- next state: `decision_stored`

### 9. `decision_stored`

- trigger: `coach_decision`, `decision_trace`, outcome が保存された
- left column display: completed case summary
- right column display: stored Decision Trace and intervention result
- next state: 次の case 読み込み、または session continuation

## MVP Demo Scenario

管理業務主任者試験の相続放棄・3ヶ月起算点誤認ケースを使う。

1. learner sees one `question_leg`
2. learner marks it `true`
3. learner writes: 「3ヶ月以内と書いてあるので正しいと思った」
4. `Misconception Agent` reports starting-point confusion
5. `Memory Agent` reports similar mistake repeated
6. `Load Agent` recommends short check instead of long explanation
7. Coach selects:
   - `intervention_type`: `starting_point_check`
   - `intervention_target`: `3-month period starting point`
   - `observation_goal`: `check whether learner can identify when the period begins`
8. Coach asks: 「その3ヶ月は、いつから数えると思いましたか？」
9. learner responds
10. Coach moves to `integrated_retry`

## Interaction Rules

- Agent は learner に直接話さない
- Coach だけが learner-facing message を出す
- Agent Reports は右カラムのみ
- 1回の `selected_intervention` で扱う論点は 1 つ
- UI は Agent の賢さではなく、Coach decision support を見せる

## Mock Data Contract

UI が必要とする最低限の mock data:

- `question`
- `question_leg`
- `learner_belief`
- `reflection_event`
- `agent_report[]`
- `coach_decision`
- `selected_intervention`
- `decision_trace`

### JSON Example

```json
{
  "question": {
    "question_id": "q_2024_12",
    "stem": "相続放棄に関する次の記述のうち、正しいものはどれか。"
  },
  "question_leg": {
    "leg_id": "q_2024_12_leg_3",
    "leg_index": 3,
    "leg_text": "相続放棄は3ヶ月以内にしなければならない。",
    "objective_truth": false
  },
  "learner_belief": {
    "selected_judgment": true,
    "confidence_self_report": 0.72
  },
  "reflection_event": {
    "text": "3ヶ月以内と書いてあるので正しいと思った。"
  },
  "agent_report": [
    {
      "agent_name": "Misconception Agent",
      "finding": "The learner likely confused the starting point of the 3-month period.",
      "risk": "The same deadline misconception may recur.",
      "recommendation": "Ask when the learner thinks the 3-month period begins.",
      "confidence": 0.86,
      "evidence": [
        "Reflection mentions duration only.",
        "No triggering event is referenced."
      ]
    },
    {
      "agent_name": "Memory Agent",
      "finding": "This is a repeated mistake in deadline-based questions.",
      "risk": "The misconception may already be stable.",
      "recommendation": "Reuse a short check-question format before giving explanation.",
      "confidence": 0.78,
      "evidence": [
        "Similar pattern observed in prior cases."
      ]
    },
    {
      "agent_name": "Load Agent",
      "finding": "Today’s cognitive load appears high.",
      "risk": "A long explanation may not stick.",
      "recommendation": "Prefer a short focused check.",
      "confidence": 0.74,
      "evidence": [
        "Recent fatigue signal is elevated."
      ]
    }
  ],
  "coach_decision": {
    "selected_intervention": "starting_point_check",
    "intervention_type": "starting_point_check",
    "intervention_target": "3-month period starting point",
    "observation_goal": "Check whether the learner can identify when the period begins.",
    "decision_reason": "Multiple agent reports align on an observation-first check."
  },
  "selected_intervention": {
    "learner_facing_message": "その3ヶ月は、いつから数えると思いましたか？",
    "next_action": "Wait for learner response, then move to integrated_retry.",
    "expected_signal": "Whether the learner can verbalize the legal starting point."
  },
  "decision_trace": {
    "selected_intervention": "starting_point_check",
    "intervention_type": "starting_point_check",
    "intervention_target": "3-month period starting point",
    "observation_goal": "Check whether the learner can identify when the period begins.",
    "decision_reason": "Short focused observation is preferable to full explanation at this moment."
  }
}
```

## Design Constraints

MVP では以下をやらない。

- login
- full question database
- multi learner management
- Firestore-first design
- company-wide dashboard
- marketing/back office simulation
