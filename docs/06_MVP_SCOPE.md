# MVP Scope

## Scope Principle

MVP では、MentorHQ を「Coach が 1 ケースの次の一手を決めやすくなる system」として成立させることを優先する。

実装対象は、派手な自動化よりも以下に絞る。

- question flow の観測
- agent report の比較
- coach decision の可視化

## In Scope

- 左右 2 カラム UI
- 過去問 1 問
- 脚ごとの ○× 判断
- 短い理由入力
- Agent Reports
- Coach Decision
- Final integrated question
- Decision trace
- Local JSON memory or simple storage

## Out of Scope

- 完全な問題 DB
- ログイン
- 課金
- 本格 Firestore
- OpenMetadata
- 会社全体の経営シミュレーション
- Marketing Agent
- Back Office Agent
- 汎用資格対応

## MVP User Experience

MVP で見せるべき体験は以下。

1. 学習者が脚単位で判断する
2. Coach 側に agent reports が出る
3. Coach が 1 つの intervention を選ぶ
4. 本来の一問へ戻して統合理解を確認する
5. その判断理由が trace として残る

## Why These Limits Matter

最初から大きく作ると、MentorHQ の核心がぼやける。

特に避けるべきこと:

- 永続化基盤を先に重くすること
- agent の種類を増やしすぎること
- company simulation を主役にすること

## MVP Success Criteria

- Coach-centered であることが一目でわかる
- Agent が learner ではなく Coach を支援している
- 脚レベル観測から final integrated question へ戻る流れが見える
- decision trace により「なぜその介入か」が追える

## Demo Narrative

ハッカソン demo では、以下の 1 ケースに集中する。

- 管理業務主任者試験の過去問 1 問
- 起算点誤認または条件見落としが見える脚
- Memory / Misconception / Load を中心に意思決定
- Coach が explanation ではなく check question を選ぶ場面
