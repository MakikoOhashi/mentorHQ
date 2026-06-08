# Implementation Plan

## Guiding Rule

最初から Firestore や Elastic を入れない。
まず Agent 設計と意思決定フローを完成させる。

## Phase 0

- docs 完成
- README 更新

目的:

- product definition を揃える
- demo 前に判断構造を言語化する

## Phase 1

- 静的デモデータで左右 2 カラム UI
- Agent reports を mock で表示

目的:

- Coach-centered UI を見える形にする
- まず orchestrated experience を固定する

## Phase 2

- Gemini API で Misconception Agent を実装
- Memory Agent は local JSON から検索

目的:

- 誤解分析の核を先に成立させる
- 永続化は軽量なまま価値検証する

## Phase 3

- Coach Decision を Gemini またはルール + Gemini で実装
- decision trace を保存

目的:

- Agent report から coach action へつながる流れを閉じる
- explainability を最低限成立させる

## Phase 4

- Cloud Run 対応
- demo video 用シナリオ固定

目的:

- ハッカソン提出に向けた安定動作
- デモ再現性の確保

## Phase 5

- 余力があれば Firestore または Elastic へ差し替え

目的:

- 検索性・蓄積性の向上
- MVP 以後の拡張準備

## Recommended Build Order

1. Question flow を固定する
2. Shared facts schema を定義する
3. Agent report schema を定義する
4. Mock reports で Coach UI を作る
5. Misconception Agent を接続する
6. Memory lookup を接続する
7. Coach decision trace を保存する
8. Cloud Run 向けにまとめる

## Technical Notes

- 最初は local JSON または simple storage で十分
- full problem database は不要
- agent 数は MVP で増やしすぎない
- UI より先に decision boundaries を固める

## Hackathon Alignment

- Target: DevOps x AI Agent Hackathon
- Deployment plan: Google Cloud Run
- LLM plan: Gemini API
- Demo emphasis: coach decision support over autonomous tutoring
