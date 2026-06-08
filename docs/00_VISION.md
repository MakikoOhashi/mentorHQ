# MentorHQ Vision

## One-line Definition

MentorHQ is a coach-centered multi-agent system where specialized AI agents support a single coach’s decisions before the coach responds to the learner.

MentorHQ は、学習者に直接教える AI Tutor ではなく、コーチの意思決定を支えるための Coach Decision OS です。

## Core Positioning

- MentorHQ の支援対象は学習者ではなく Coach
- 中心責務は「教えること」ではなく「判断を支えること」
- Agent は直接介入せず、観察・分析・推薦を行う
- 最後に学習者へ介入するのは常に Coach
- 価値の中心は explanation generation ではなく decision support

## What MentorHQ Is Not

- AI Tutor ではない
- 学習者と自由会話する multi-agent chat ではない
- 正解と解説を自動返却するだけの問題アプリではない
- 会社全体のオペレーション演出を主目的にした dashboard ではない

## Coach-centered Operating Model

MentorHQ では、各 Agent は learner-facing ではなく coach-facing に設計する。

- Learner は回答・理由・反応を提示する
- Coach はケースを受け取り、何を確認し、どう介入するか決める
- Agent は判断材料として report を返す
- Coach は複数 report を比較し、1つの介入方針にまとめる

## Agent Principles

各 Agent の責務は以下に限定する。

- observe
- analyze
- summarize
- recommend

各 Agent がやらないこと:

- 学習者への直接説明
- 最終判断の確定
- 学習者への感情的フィードバック生成の主導

## Why This Matters

多くの学習プロダクトは「正誤」と「解説」で終わるが、MentorHQ はその手前の意思決定に焦点を当てる。

- なぜその選択をしたのか
- どの条件を誤読したのか
- 同じ誤解が再発しているのか
- 今は説明より再考質問が適切か
- 今日は進めるべきか、負荷を下げるべきか

こうした判断を Coach が一貫して行える状態を作る。

## Hackathon Theme

ハッカソン向けの題材は管理業務主任者試験とする。

理由:

- 四択問題との相性がよい
- 選択肢単位の誤解観測がしやすい
- 条件・例外・起算点など misconception を観測しやすい
- demo で Coach intervention の価値が伝わりやすい
