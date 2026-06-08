# Question Flow

## Design Origin

この出題 UX は `coaching-company-next` の思想を継承する。

ただし目的は簡単化ではなく、学習者の思考過程を観測し、Coach が適切な介入を決められるようにすることにある。

## Primary Flow

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

目的は以下である。

- どの条件で誤解したかを観測する
- unsure と誤信を区別する
- explanation 前に reasoning signal を取る
- 最後に本問へ戻したときの統合力を確認する

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

### 2. Break question into individual choices/legs

- choice を観測可能な単位に分解する

### 3. Ask learner to judge each leg

- true
- false
- unsure

### 4. Ask short reason only when useful

- 長文 essay は不要
- 1〜2 文の reflection で十分

### 5. Store learner belief separately from objective truth

ここが誤解分析の核になる。

- objective truth = 実際の正誤
- learner belief = 学習者の判断

### 6. Run Misconception Agent and Memory Agent

- 誤解タイプの仮説生成
- 類似ケースとの比較

### 7. Coach gives targeted intervention

- 解説ではなく確認質問を優先
- 1 つの論点に絞る

### 8. Repeat for relevant choices

- 全 choices を必ず深掘りする必要はない
- 観測価値が高い脚を優先する

### 9. Show original integrated multiple-choice question

- 局所理解を本問へ戻す

### 10. Ask final answer

- 最後に通常の一問として解かせる

### 11. Compare local vs integrated performance

- 脚では理解できたが統合で崩れる
- 脚では迷ったが最終で回復した

などの差を見る。

### 12. Store outcome

- answer outcome
- misconception hypothesis
- intervention result
- final integrated performance

## Example

```text
Original question
↓
Choice 1 review
↓
Choice 2 review
↓
Choice 3 review with reflection
↓
Coach intervention
↓
Original question again
↓
Final answer
↓
Outcome comparison
```
