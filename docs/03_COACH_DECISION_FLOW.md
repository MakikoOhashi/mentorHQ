# Coach Decision Flow

## Decision Flow

MentorHQ では、1 つの choice / leg に対して以下の順序で意思決定する。

1. Learner answers one choice/leg
2. Coach receives answer
3. Agents analyze the case
4. Agent reports are generated
5. Coach compares reports
6. Coach selects one intervention
7. Coach responds to learner
8. Decision is stored
9. Final integrated question is shown when ready

## Operational Principles

- Agent 同士が直接生徒に話さない
- Coach は複数 Agent の提案を統合する
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
- reflection text
- current session context

を受け取る。

### 3. Agents analyze the case

- Misconception Agent が誤解仮説を立てる
- Memory Agent が再発性を確認する
- Load / Health / Milestone Agent が負荷と優先度を補足する

### 4. Agent reports are generated

各 report は以下を含む。

- finding
- risk
- recommendation
- confidence
- evidence

### 5. Coach compares reports

Coach は次を見比べる。

- 何がもっとも本質的な誤解か
- 今日は深掘りすべきか
- 今回は correction より observation が先か

### 6. Coach selects one intervention

選択肢の例:

- check question
- contrast question
- ask-for-starting-point
- ask-for-condition
- defer-and-review-later

### 7. Coach responds to learner

Coach は explanation-first ではなく rethinking-first を基本にする。

### 8. Decision is stored

保存対象:

- selected intervention
- reason
- supporting reports
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

### Load Agent

- finding: 今日の負荷は高め
- recommendation: 長い解説ではなく短い確認質問を優先

### Coach Decision

解説せず、まず「その 3 ヶ月はいつから数えると思ったか」を聞く。

## Anti-patterns to Avoid

- Agent が直接 learner-facing explanation を返す
- 1 回の誤答で複数の誤解を同時修正しようとする
- objective truth を先に見せて観測機会を失う
- 毎回長い explanation を返して trace だけ残らない
