# Question Flow

## Design Origin

この出題 UX は `coaching-company-next` の思想を継承する。

ただし目的は簡単化ではなく、学習者の思考過程を観測し、Coach が適切な介入を決められるようにすることにある。

MentorHQ の Question Flow は固定手順ではなく、Coach が選ぶ `intervention_type` の集合である。

MVP では `leg_breakdown` を default `intervention_type` として使うが、これは UI 都合ではなく、学習者の `learner_belief` を観測するための Coach decision である。

## Primary Flow

1. Select past exam question
2. Coach selects an intervention_type based on current context
3. Default MVP `intervention_type` is leg_breakdown
4. Ask learner to judge each selected leg as true / false / unsure
5. Ask short reason only when useful
6. Store learner belief separately from objective truth
7. Run relevant Agents
8. Coach selects next `selected_intervention`
9. Repeat only if the next observation is useful
10. Show original integrated multiple-choice question when ready
11. Ask final answer
12. Compare local leg-level understanding with final integrated performance
13. Store outcome

## Key Concepts

### objective truth

各 choice / leg の客観的な正誤。

### learner belief

学習者がその時点で何を正しいと信じていたか。

### final answer correctness

本来の一問に戻した時の最終正答状況。

### local leg-level understanding

脚単位では正しく判断できたか、どこに揺らぎがあるか。

### integrated question performance

複数の脚を統合した本問で最終的にどう解けたか。

## Why Break Questions Into Legs

脚ごとの判断は、問題を簡単にするためではない。

また、常に使うものでもない。

`leg_breakdown` は、Coach が `learner_belief` / `objective_truth` のズレを観測したいときに選ぶ `intervention_type` である。

目的は以下である。

- どの条件で誤解したかを観測する
- unsure と誤信を区別する
- explanation 前に reasoning signal を取る
- 最後に本問へ戻したときの統合力を確認する

## Intervention Types

### leg_breakdown

脚・選択肢ごとの判断を取る。

- observation_goal: learner_belief と objective_truth のズレを見える化する
- when to use: どの脚で誤信・迷い・条件見落としが起きているかを観測したいとき
- stored signal: leg judgment, learner belief, optional short reason, leg-level confidence

### contrast_check

似た条件や選択肢を比較させる。

- observation_goal: 比較不足や例外見落としを観測する
- when to use: 似た選択肢の取り違えや条件差の無視が疑われるとき
- stored signal: contrasted items, comparison rationale, detected confusion pattern

### starting_point_check

起算点・条件・主語・例外など1つの焦点を言語化させる。

- observation_goal: explanation 前に、特定焦点を本人が言語化できるかを観測する
- when to use: 起算点誤認、条件抜け、主語取り違えなど単一焦点の確認が必要なとき
- stored signal: intervention_target, reflection, observation result

### integrated_retry

最後に本来の一問として再回答させる。

- observation_goal: 局所理解が統合問題でも維持されるかを確認する
- when to use: 局所観測や focused check の後に、全体として解けるかを確かめたいとき
- stored signal: final integrated answer, transfer result, local-vs-integrated gap

## Intervention Timing

短い理由入力は常時必須ではない。

以下のときにだけ求める。

- 誤信が強いとき
- unsure の理由が有用そうなとき
- Coach が仮説検証したいとき
- Memory Agent が再発確認に使いたいとき

## Flow Detail

### 1. Select past exam question

- 管理業務主任者試験の過去問から 1 問選ぶ

### 2. Coach selects an intervention_type based on current context

- agent_report
- learner_belief
- prior pattern
- current load

を見て、最初の観測方法を決める。

### 3. Default MVP `intervention_type` is leg_breakdown

- MVP では `leg_breakdown` を最初の観測に使う
- ただし固定 UI ではなく Coach decision として扱う

### 4. Ask learner to judge each selected leg

- true
- false
- unsure

### 5. Ask short reason only when useful

- 長文 essay は不要
- 1〜2 文の reflection で十分

### 6. Store learner belief separately from objective truth

ここが誤解分析の核になる。

- objective_truth = 実際の正誤
- learner_belief = 学習者の判断

### 7. Run relevant Agents

- 誤解タイプの仮説生成
- 類似ケースとの比較
- 必要に応じて負荷や優先度も参照する

### 8. Coach selects next `selected_intervention`

- 解説ではなく確認質問を優先
- 1 つの論点に絞る

### 9. Repeat only if the next observation is useful

- 全 choices を必ず深掘りする必要はない
- 次の観測で新しい signal が得られるときだけ進む

### 10. Show original integrated multiple-choice question when ready

- 局所理解を本問へ戻す

### 11. Ask final answer

- 最後に通常の一問として解かせる

### 12. Compare local vs integrated performance

- 脚では理解できたが統合で崩れる
- 脚では迷ったが最終で回復した

などの差を見る。

### 13. Store outcome

- answer outcome
- misconception hypothesis
- intervention result
- final integrated performance

## Example

```text
Original question
↓
Coach selects leg_breakdown
↓
Leg judgments
↓
Agent reports
↓
Coach selects starting_point_check
↓
Original question again via integrated_retry
↓
Final answer
↓
Outcome comparison
```
