# LESSONS_LEARNED

## 0. 前提

この整理は、以下2リポジトリの思想・UI・データモデル・運用設計を MentorHQ 向けに再編集したものです。

- `/Users/makiko/Documents/Documents - makiko’s MacBook Air/dev/coaching-company-next`
- `/Users/makiko/Documents/Documents - makiko’s MacBook Air/dev/CoachingMetadata`

MentorHQ の前提は、**学習者を直接指導するAI** ではなく、**コーチの意思決定を支援するマルチエージェントシステム** です。
したがって、「学習者との対話UX」そのものより、**判断責務の分解・状態要約・リスク検知・推奨アクション生成** に価値があるものを優先して継承します。

---

## 1. 残すべき思想

### 1-1. 学習理論

残すべき要素:

- **一度に1つの判断対象へ絞る**
  - `CoachingMetadata` の「one choice at a time」は、認知負荷を下げつつ理解のズレを観測しやすい。
  - MentorHQ では、学習者UIにそのまま持ち込むより、**コーチがどの粒度で確認させるべきかを提案するルール**として継承すると良い。
- **正解数ではなく理解形成を最適化する**
  - `coaching-company-next` の daily quota 設計は、「最大量」ではなく「最小有効負荷」を重視している。
  - MentorHQ でも、次アクション提案は「どれだけやらせるか」ではなく、**理解を前進させる最小単位**で出すべき。
- **全体問題に戻す再統合**
  - 部分理解→全体再構成の流れは、単なる解説より転移性が高い。
  - MentorHQ では、コーチへの提案として「局所確認のあとにどの全体課題へ戻すか」を出せる。

### 1-2. コーチング理論

残すべき要素:

- **学習者に計画負担を持たせない**
  - 「今日何をやるべきか」をシステム側が決める思想は強い。
  - MentorHQ では、学習者向けではなく**コーチ向けの意思決定支援**として置き換えるべき。
- **通常判断と上位判断を分ける**
  - Coach / CEO / Human の境界は、そのまま MentorHQ の multi-agent 設計の核になる。
- **例外時だけ上位判断へ上げる**
  - すべてを重いレビューに回さず、通常対応は現場で閉じる発想は運用性が高い。

### 1-3. 認知エラー分析

残すべき要素:

- **誤答を1種類に潰さない**
  - `misunderstanding / memory gap / reading error / comparison weakness / false confidence` という切り分けは非常に有用。
- **選択肢の真偽と学習者信念を分離する**
  - `shared/choice-review-logic.js` の
    - objective truth
    - learner belief
    - answer correctness
    の分離は、誤答分析の質を大きく上げる。
- **仮説 → 追加確認 → 介入**
  - いきなり説明せず、仮説検証を挟む流れは、MentorHQ の Agent 分離に向いている。

### 1-4. 誤答分析

残すべき要素:

- **誤答の理由を短い反省入力で取得する**
  - 長文内省ではなく、短い reflection で十分なシグナルが取れる。
- **focusPhrase / misunderstandingType のような中間表現**
  - これは MentorHQ で特に重要。
  - 学習者UIに露出しなくても、コーチ支援用の記憶・要約・再発防止に使える。

### 1-5. 問題分解

残すべき要素:

- **セッションを段階に分ける設計**
  - 開始 → 導入 → 問題 → 振り返り → 要約
  - MentorHQ では UI フローより、**コーチ判断の状態機械**として再利用できる。
- **責務単位で判定ルールを切る設計**
  - session opening, quota, review, escalation, intervention を分けている点が良い。

### 1-6. 学習履歴活用

残すべき要素:

- **共有できる事実層と、プロダクト固有状態層を分ける**
  - answer history / study logs は共有。
  - roadmap / current milestone / today action はプロダクト固有。
  - この分離は MentorHQ でもそのまま重要。
- **最近の履歴だけでなく再発パターンを見る**
  - repeated stuck, subject drift, unstable comprehension などの観点は Agent 向き。

### 1-7. フィードバック設計

残すべき要素:

- **1回の誤答に対して介入は1種類に絞る**
  - 説明過多を避け、実行可能性が上がる。
- **短く具体的な次アクションへ落とす**
  - 「ここを確認」「この論点でもう1問」「負荷を下げる」など、行動に直結している。
- **人間があとから見て理由を追える構造**
  - OpenMetadata 自体は不要でも、Explainability の思想は残すべき。

---

## 2. 捨てるべき思想

### 2-1. 学習者フロント中心の発想

捨てる理由:

- MentorHQ は学習者向け主役UIではなく、**コーチ支援基盤**だから。
- `CoachingMetadata` の session UX は学習者支援としては良いが、MentorHQ の中心責務ではない。

### 2-2. OpenMetadata 前提の設計

捨てる理由:

- 信頼性・可視化のための実験としては良いが、MentorHQ の MVP には重い。
- metadata platform を中心に据えると、コーチの判断支援より基盤説明に重心が寄る。

### 2-3. 会社オペレーションをそのまま表に出す UI

捨てる理由:

- `Company Control Room` は demo としては面白いが、実務利用ではノイズが多い。
- MentorHQ で必要なのは、会社全体の演出ではなく、**ケース単位の判断支援**。

### 2-4. multi-role を過剰に増やす発想

捨てる理由:

- Marketing / Back Office / broad company simulation は、MVP をぼかす。
- ハッカソン向きでも、MentorHQ の立ち上げ初期では責務を絞るべき。

### 2-5. LINE 的進捗をそのまま高次コーチング状態へ流し込む発想

捨てる理由:

- `Basic 16/25` のような進捗ラベルは、コーチ意思決定には粗すぎる。
- 学習履歴の事実としては使えるが、**現在の支援状態**とは別物。

### 2-6. 学習者に判断を返しすぎる設計

捨てる理由:

- 「何を復習するか」「どの論点を見るか」を毎回学習者に委ねると、コーチング価値が下がる。
- MentorHQ ではなおさら、**コーチが迷わないための提案**が重要。

### 2-7. UI を複雑化するデバッグ露出

捨てる理由:

- `source_type`, `source_year`, intermediate labels などを前面に出すと認知負荷が高い。
- これらは内部観測値として保持し、必要時のみコーチ画面で見せるべき。

---

## 3. 再利用可能な UI

### 3-1. 問題回答画面

再利用方針:

- **そのまま流用はしない**
- ただし、以下の UI パターンは再利用価値が高い
  - 1画面1目的
  - 短い選択肢ボタン
  - 反省入力を1つだけ置く
  - 次へ進む導線を強くする

評価:

- MentorHQ では、学習者画面よりも**コーチに提示する「確認テンプレート」**として転用するのがよい。

### 3-2. チャット UI

再利用方針:

- reflection thread のような**短い往復UI**は有効。
- ただし自由会話チャットではなく、
  - 仮説確認
  - 誤解確認
  - 次の一手確認
  など、**構造化された短往復**に寄せるべき。

### 3-3. 学習履歴 UI

再利用方針:

- 現行 repo に強い完成形は少ない。
- ただし、表示すべき内容の方向性は明確。
  - recent accuracy
  - repeated weak topics
  - recent interventions
  - risk trend

評価:

- MentorHQ では、時系列ログ一覧よりも**判断に効く要約ビュー**が必要。

### 3-4. ダッシュボード

再利用方針:

- `Company Control Room` の見た目は参考程度。
- 再利用すべきなのは見た目よりも、
  - current risk
  - keep / adjust / escalate
  - decision transmission
  という情報構造。

評価:

- MentorHQ では、全体運営ダッシュボードより**ケース単位の decision panel**に落とすべき。

### 3-5. 管理画面

再利用方針:

- 明示的な完成形は薄い。
- しかし、会社側 view を持つ思想自体は再利用価値がある。

評価:

- MentorHQ の管理画面は、以下に限定すると良い。
  - 要注意ケース一覧
  - エージェント提案の比較
  - 最終採用理由
  - 人間介入ログ

### 3-6. 保存したスクリーンショット

保存先:

- `/Users/makiko/Documents/Documents - makiko’s MacBook Air/dev/mentorHQ/research_screenshots/start.png`
- `/Users/makiko/Documents/Documents - makiko’s MacBook Air/dev/mentorHQ/research_screenshots/company-view.png`
- `/Users/makiko/Documents/Documents - makiko’s MacBook Air/dev/mentorHQ/research_screenshots/question.png`
- `/Users/makiko/Documents/Documents - makiko’s MacBook Air/dev/mentorHQ/research_screenshots/intervention.png`

補足:

- `start.png` はモバイル起動導線の確認用。
- `company-view.png` は company-side dashboard 演出の確認用。
- `question.png` / `intervention.png` はローカル状態依存のため、厳密にはセッション途中画面の完全再現ではないが、画面密度とUIトーン確認には使える。

---

## 4. 再利用可能なデータモデル

### 4-1. 学習履歴

再利用価値: 高い

継承すべき形:

- shared fact layer として保持
- 例:
  - study event
  - subject
  - topic
  - studied_at / occurred_at
  - duration
  - score / correctness
  - source product

MentorHQ 判断:

- **そのまま重要**。
- ただし MentorHQ では、「履歴保存」より**履歴から何を要約するか**を重視する。

### 4-2. 回答履歴

再利用価値: 高い

継承すべき形:

- `question_exposures`
- selected answer
- correctness
- shown_at / answered_at
- exposure purpose

MentorHQ 判断:

- 回答履歴は必須。
- ただし、MentorHQ では `final_answer_correctness` に加え、
  - learner belief
  - branch-level confusion
  - hesitation / unknown
  を持つとさらに強い。

### 4-3. 誤答分析

再利用価値: 非常に高い

継承すべき形:

- `weak_topics`
- `weak_patterns`
- `suspected_root_cause`
- `misunderstandingType`
- `focusPhrase`
- intervention classification

MentorHQ 判断:

- ここは MentorHQ の核。
- 特に、**単なる wrong log ではなく「なぜそう判断したか」の中間表現**を残すべき。

### 4-4. Metadata

再利用価値: 中

継承すべき形:

- OpenMetadata そのものではなく、以下の軽量版
  - decision trace
  - signal set used
  - selected agent recommendation
  - final adopted action
  - rationale summary

MentorHQ 判断:

- platform dependency は不要。
- ただし、**説明可能な判断ログ**は必ず残すべき。

### 4-5. ユーザー状態

再利用価値: 非常に高い

継承すべき形:

- `learner_state`
- `company_coaching_state_v2`
- current subject
- current phase
- coaching milestone
- risk level / reason
- pass probability
- next action today

MentorHQ 判断:

- これは強く再利用できる。
- ただし MentorHQ では `next_action_today` を学習者向け文面ではなく、
  - coach recommendation
  - intervention candidate
  - escalation candidate
  のように**意思決定オブジェクト化**すると良い。

### 4-6. 推奨する MentorHQ 用データ層

#### A. Shared Facts

- learner
- study_events
- answer_events
- question_exposures
- session_events

#### B. Derived State

- learner_state_summary
- current_risk_state
- current_focus_state
- misconception_summary
- intervention_history_summary

#### C. Decision Layer

- agent_recommendations
- final_coach_recommendation
- escalation_decisions
- human_override_log

#### D. Memory Layer

- repeated_stuck_patterns
- effective_interventions
- coach_notes
- case_patterns

---

## 5. Agent 候補抽出

### 5-1. そのまま候補になるもの

- **Memory Agent**
  - 学習履歴・介入履歴・再発パターンを要約
- **Misconception Agent**
  - 誤答理由の仮説生成
  - misunderstanding type / focus phrase 抽出
- **Milestone Agent**
  - current phase / next milestone / re-entry point を提案
- **Health Agent**
  - risk level / burnout / instability / drift を監視
- **Load Agent**
  - その日の適正負荷を提案
- **Intervention Agent**
  - 用語確認 / 論点確認 / 誤概念修正 / 追加演習 のどれを出すか決定
- **Escalation Agent**
  - 通常対応で閉じるか、上位判断へ上げるか決める
- **Review Agent**
  - 日次 / 週次のケースレビューを要約

### 5-2. MentorHQ で特に相性が良いもの

- **Coach Briefing Agent**
  - コーチに渡す「今日の注意点3つ」を生成
- **Case Summary Agent**
  - セッション履歴を、次の担当者が読める1段落へ要約
- **Decision Trace Agent**
  - 「なぜその提案になったか」を説明可能にする
- **Human Handoff Agent**
  - 人間へ上げる際の要点整理を行う

### 5-3. 後回しにすべきもの

- Marketing Agent
- Broad company operations simulation
- Full org health dashboard agent

理由:

- MentorHQ 初期価値は、会社演出ではなく**コーチ支援精度**だから。

---

## 6. MentorHQ で新規に必要なもの

### 6-1. ケース中心の意思決定UI

必要な理由:

- 現行資産は learner session か demo dashboard に寄っている。
- MentorHQ には、**1ケースに対し複数 agent 提案を比較し、採用判断できる UI** が必要。

### 6-2. Agent proposal schema

必要な理由:

- 各 Agent の出力形式を揃えないと、比較も統合も難しい。

最低限必要な項目:

- agent_name
- recommendation_type
- confidence
- evidence
- rationale
- recommended_next_action
- escalation_flag

### 6-3. 決定ログの explainability 層

必要な理由:

- OpenMetadata を使わなくても、後から「なぜそうなったか」を追えないと運用改善が進まない。

### 6-4. 人間介入の最小運用設計

必要な理由:

- CEO / Human 境界思想はあるが、MentorHQ では**誰が、どの条件で、どう戻すか**をもう少し明文化する必要がある。

### 6-5. coach-side memory editing

必要な理由:

- 自動抽出だけでなく、人間コーチが
  - この誤解は重要
  - この介入は効いた
  - 次回ここから入る
  と書ける欄が必要。

---

## 7. 推奨 MVP

### 7-1. MVP の中心価値

MentorHQ の MVP は、

**1人のコーチが、1人の学習者ケースについて、迷わず次の一手を決められること**

に置くべきです。

### 7-2. MVP に入れるもの

- learner case summary
- recent study / answer history
- current risk / current focus / milestone summary
- 3〜4 Agent の提案
  - Memory
  - Misconception
  - Load
  - Escalation
- final recommended next action
- rationale trace
- human override log

### 7-3. MVP に入れないもの

- learner-facing full coaching app
- enterprise metadata platform integration
- company-wide decorative dashboard
- marketing / back office simulation
- full autonomous org role-play

### 7-4. MVP の1画面イメージ

1ケースに対して以下だけ見えれば十分です。

- 今の状態
- なぜ注意が必要か
- どの誤解が濃厚か
- 今日の推奨介入
- 負荷調整すべきか
- エスカレーションすべきか
- 最終判断と理由

### 7-5. 実装順の推奨

1. shared facts の整理
2. learner state summary の定義
3. agent recommendation schema の定義
4. 3 Agent だけで提案生成
5. coach decision panel を作る
6. human override と decision trace を足す

---

## 8. 結論

最も価値が高い継承対象は、UI の見た目そのものではなく、以下です。

- **理解重視のコーチング思想**
- **誤答を分解して捉える認知モデル**
- **共有事実層と固有状態層を分けるデータ境界**
- **通常判断 / 上位判断 / 人間判断の責務分解**
- **短く実行可能な次アクション提案**

逆に捨てるべきなのは、以下です。

- 学習者フロントを中心にした設計
- OpenMetadata 前提
- 会社演出を強く見せるダッシュボード
- 役割を増やしすぎる demo 的構成

MentorHQ は、過去資産をそのまま統合するより、

**「コーチが迷わないための判断OS」**

として再設計するのが最も筋が良いです。
