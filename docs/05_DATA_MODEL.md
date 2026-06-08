# MVP Data Model

## Design Principle

MentorHQ の MVP では、共有事実・派生状態・Agent 出力・Coach 決定・記憶層を分離する。

この分離により、

- 生データを再利用しやすい
- Agent の推定を差し替えやすい
- Coach の判断理由を追跡しやすい

状態を作る。

## Shared Facts

最初に保存するのは観測事実。

- learner
- question
- question_leg
- answer_event
- reflection_event
- session_event

### Example Fields

- learner.id
- question.id
- question_leg.leg_index
- answer_event.selected_judgment
- answer_event.answered_at
- reflection_event.text
- session_event.phase

## Derived State

Shared Facts から要約される現在状態。

- learner_state_summary
- misconception_summary
- current_focus
- risk_state
- load_state
- milestone_state

### Purpose

- 現在の注意点を一目でわかるようにする
- Agent が都度フルログを読まなくてもよい状態を作る

## Agent Layer

各 Agent が返す推定と推薦。

- agent_report
- agent_recommendation
- confidence
- evidence
- rationale
- recommended_next_action

### Report Minimum Schema

- agent_name
- finding
- risk
- recommendation
- confidence
- evidence
- rationale

## Decision Layer

Coach の最終判断を保持する。

- coach_decision
- selected_intervention
- intervention_type
- intervention_target
- observation_goal
- decision_reason
- rejected_recommendations
- decision_trace

### Purpose

- なぜその介入を採用したかを残す
- あとから intervention quality を見直せるようにする

## Memory Layer

長期的な再発・有効介入・ケースメモを残す。

- repeated_patterns
- effective_interventions
- prior_cases
- coach_notes

## Suggested Entity Summary

### `learner`

- learner_id
- display_name
- target_exam
- exam_date

### `question`

- question_id
- exam_name
- year
- source_type
- stem

### `question_leg`

- question_id
- leg_id
- leg_index
- leg_text
- objective_truth

### `answer_event`

- answer_event_id
- learner_id
- question_id
- leg_id
- selected_judgment
- confidence_self_report
- answered_at

### `reflection_event`

- reflection_event_id
- answer_event_id
- text
- created_at

### `agent_report`

- report_id
- session_id
- question_id
- leg_id
- agent_name
- finding
- risk
- recommendation
- confidence
- evidence
- rationale

### `coach_decision`

- decision_id
- session_id
- selected_intervention
- intervention_type
- intervention_target
- observation_goal
- decision_reason
- rejected_recommendations
- decision_trace
- created_at

## JSON Example

```json
{
  "shared_facts": {
    "learner": {
      "learner_id": "learner_01",
      "target_exam": "property-manager"
    },
    "question": {
      "question_id": "q_2024_12",
      "year": 2024,
      "stem": "相続放棄に関する次の記述..."
    },
    "question_leg": {
      "leg_id": "q_2024_12_leg_3",
      "leg_index": 3,
      "leg_text": "相続放棄は3ヶ月以内にしなければならない。",
      "objective_truth": false
    },
    "answer_event": {
      "selected_judgment": true,
      "answered_at": "2026-06-08T09:30:00+09:00"
    },
    "reflection_event": {
      "text": "3ヶ月以内と書いてあるので正しいと思った。"
    }
  },
  "derived_state": {
    "misconception_summary": {
      "type": "starting-point-confusion",
      "focus_phrase": "within 3 months"
    },
    "risk_state": {
      "repeat_risk": "high"
    },
    "load_state": {
      "today_load": "high"
    }
  },
  "agent_layer": [
    {
      "agent_name": "Misconception Agent",
      "finding": "Likely confusion about the starting point of the 3-month period.",
      "intervention_type": "starting_point_check",
      "recommendation": "Ask when the learner thinks the 3-month period begins.",
      "confidence": 0.86,
      "evidence": [
        "Reflection references duration only.",
        "No triggering event is mentioned."
      ],
      "rationale": "The learner appears to anchor on the number but not the legal condition."
    },
    {
      "agent_name": "Memory Agent",
      "finding": "Third similar mistake in deadline-based questions.",
      "intervention_type": "starting_point_check",
      "recommendation": "Use the same short check-question format that worked last week.",
      "confidence": 0.78,
      "evidence": [
        "prior_cases: 2026-05-30, 2026-06-03"
      ],
      "rationale": "Repeated pattern suggests stable misconception, not a one-off slip."
    }
  ],
  "decision_layer": {
    "selected_intervention": "starting_point_check",
    "intervention_type": "starting_point_check",
    "intervention_target": "3-month period starting point",
    "observation_goal": "Check whether the learner can identify when the period begins before receiving explanation.",
    "decision_reason": "High-confidence misconception hypothesis plus repeated pattern.",
    "rejected_recommendations": [
      "give full explanation now"
    ],
    "decision_trace": "Coach chose observation-first intervention before revealing the rule."
  },
  "memory_layer": {
    "repeated_patterns": [
      "starting-point-confusion"
    ],
    "effective_interventions": [
      "ask learner to verbalize counting origin"
    ],
    "coach_notes": "Short re-check questions work better than full explanations when fatigue is high."
  }
}
```

## Focused Decision Example

```json
{
  "intervention_type": "starting_point_check",
  "intervention_target": "3-month period starting point",
  "observation_goal": "Check whether the learner can identify when the period begins before receiving explanation."
}
```
