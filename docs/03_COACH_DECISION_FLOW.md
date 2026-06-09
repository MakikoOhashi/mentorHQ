# Coach Decision Flow

## Decision Flow

MentorHQ では、Coach が `current_context`、initial agent observations、agent deliberation を見て、その時点で最も有効な `intervention_type` を 1 つ選ぶ。

脚分解は MentorHQ の default `intervention_type` だが、hardcoded product flow ではない。
Coach が複数 Agent の観測と更新過程を見て選択する `intervention_type` の一つとして扱う。

1 つの choice / leg に対しては、以下の順序で意思決定する。

1. Learner answers one choice/leg
2. Coach receives answer
3. Agents generate initial observations
4. Agents deliberate and update hypotheses
5. Coach compares observations and deliberation
6. Coach selects one `selected_intervention`
7. Coach responds to learner
8. Decision is stored
9. Final integrated question is shown when ready

## Operational Principles

- Agent 同士が直接生徒に話さない
- Agent は他 Agent の観測を受けて推定を更新する
- Coach は複数 Agent の提案を統合するが、多数決は採用しない
- 1 回の介入では 1 つの論点だけ扱う
- 説明ではなく再考質問を優先する
- final answer の前に誤解を観測する

## Why One Intervention at a Time

1 回の介入で複数論点を扱うと、何が効いたのかも、どこでつまずいたのかも曖昧になる。

そのため Coach は、

- 今回確認する論点は何か
- その論点を観測する最短の問いは何か
- いま説明すべきか、問い返すべきか

だけをまず決める。

## Expanded Flow Detail

### 1. Learner answers one choice/leg

- true / false / unsure を選ぶ
- 必要なら短い理由を添える

### 2. Coach receives answer

- 回答内容
- hesitation
- reflection
- current_context

を受け取る。

### 3. Agents generate initial observations

- Misconception Agent が誤解仮説を立てる
- Memory Agent が再発性を確認する
- Load / Health / Milestone Agent が負荷と優先度を補足する

### 4. Agents deliberate and update hypotheses

各 Agent は他 Agent の観測結果を受け取り、必要なら以下を更新する。

- finding
- risk
- recommendation
- confidence
- evidence

たとえば、

- Misconception Agent が「起算点誤認」を仮説化する
- Memory Agent が「過去の類似ケースでは条件見落としが多い」と補足する
- Misconception Agent が confidence を下げる
- Load Agent が「一問で切り分け可能」と recommendation を補う

### 5. Coach compares observations and deliberation

各 `agent_report` は以下を含む。

- finding
- risk
- recommendation
- confidence
- evidence

Coach は次を見比べる。

- 何がもっとも本質的な誤解か
- どの Agent が他 Agent の情報で判断を更新したか
- 今日は深掘りすべきか
- 今回は correction より observation が先か

### 6. Coach selects one `selected_intervention`

Coach は observation goal に応じて `intervention_type` を選ぶ。

代表的な選択肢:

- `leg_breakdown`
  - 選択肢・脚ごとに true / false / unsure を確認する
  - learner_belief と objective_truth のズレを観測するために使う
- `contrast_check`
  - 似た選択肢や似た条件を比較させる
  - 比較不足・例外見落としを観測するために使う
- `starting_point_check`
  - 起算点・条件・主語・例外など、1つの焦点だけ確認する
  - 説明せずに本人へ言語化させるために使う
- `integrated_retry`
  - 本来の一問として再回答させる
  - 局所理解が統合問題で維持されるか確認するために使う

### 7. Coach responds to learner

Coach は explanation-first ではなく rethinking-first を基本にする。

### 8. Decision is stored

保存対象:

- selected_intervention
- decision_reason
- supporting agent_reports
- deliberation summary
- rejected recommendations

### 9. Final integrated question is shown when ready

局所理解の確認後、本来の一問へ戻して統合力を確認する。

## Example Case

### Learner

Learner chooses “3 is true because it says within 3 months.”

### Misconception Agent

- finding: 起算点誤認の可能性
- recommendation: 「その 3 ヶ月はいつから数えると思ったか」を確認

### Memory Agent

- finding: 同種ミス 3 回目
- risk: 再発パターン化

### Deliberation Update

- Memory Agent: 「過去の類似ケースでは条件見落としも多い」
- Misconception Agent: 「起算点誤認の確信度を少し下げる」

### Load Agent

- finding: 今日の負荷は高め
- recommendation: 長い解説ではなく短い確認質問を優先

### Coach Decision

`starting_point_check` を選び、解説せず、まず「その 3 ヶ月はいつから数えると思ったか」を聞く。

## Anti-patterns to Avoid

- Agent が直接 learner-facing explanation を返す
- Agent Deliberation を UI 演出用の会話としてだけ扱う
- 1 回の誤答で複数の誤解を同時修正しようとする
- objective truth を先に見せて観測機会を失う
- 毎回長い explanation を返して `decision_trace` だけ残らない
