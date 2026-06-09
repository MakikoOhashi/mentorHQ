# Agent Catalog

## Shared Design Rule

すべての Agent は学習者へ直接教えず、Coach が判断しやすくなる `agent_report` を返す。

共通出力の軸:

- finding
- risk
- recommendation
- confidence
- evidence

## Memory Agent

### Input

- answer history
- prior misconceptions
- intervention history

### Output

- repeated pattern
- similar past cases
- effective past intervention

### Responsibility

- 再発している誤解を検出する
- 類似ケースで効いた介入を思い出させる
- 単発ミスか継続パターンかを区別する

## Misconception Agent

### Input

- selected answer
- learner_belief
- reflection
- objective truth of each choice

### Output

- misunderstanding type
- focus phrase
- suspected root cause
- recommendation

### Responsibility

- 誤答そのものではなく誤解の構造を推定する
- 起算点誤認、条件見落とし、例外見落としなどの型に落とす
- いきなり説明する代わりに、何を確認すると誤解を観測できるかを提案する

## Milestone Agent

### Input

- exam date
- current progress
- weak topics
- current phase

### Output

- progress risk
- priority topic
- whether to continue / review / slow down

### Responsibility

- 試験日までの残時間と進捗のズレを把握する
- 今は新規前進か、復習か、減速かを提案する
- 学習者の局所ミスを全体計画の文脈に載せる

## Health Agent

### Input

- fatigue signal
- missed days
- learner self-report
- recent load

### Output

- overload risk
- suggested load adjustment

### Responsibility

- 認知疲労や継続リスクを検知する
- 説明不足ではなく疲労由来の performance drop を見抜く
- 今日は押すべきか、守るべきかを Coach に知らせる

## Load Agent

### Input

- today’s available time
- recent accuracy
- fatigue
- milestone pressure

### Output

- recommended load
- reduce / keep / increase

### Responsibility

- 今日の適正負荷を提案する
- 誤解修正と量のバランスを取る
- milestone pressure が高くても overload を回避する

## Coach

### Input

- learner message
- agent reports
- current question state

### Output

- selected_intervention
- next_action
- decision_trace

### Responsibility

- 複数 Agent の提案を統合する
- 今回扱う論点を 1 つ選ぶ
- learner-facing intervention を決定する
- 選ばなかった recommendation も `decision_trace` に残す

## Example Output Shape

```json
{
  "agent_name": "Misconception Agent",
  "finding": "The learner likely misread the starting point of the 3-month period.",
  "risk": "If not corrected, the same error may recur across deadline questions.",
  "recommendation": "Ask the learner when they think the 3-month period begins.",
  "confidence": 0.84,
  "evidence": [
    "Reflection mentions 'within 3 months' without referencing the triggering event.",
    "Objective truth requires identifying the correct starting point."
  ]
}
```
