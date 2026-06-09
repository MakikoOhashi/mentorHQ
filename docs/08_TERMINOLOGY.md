# Terminology

## Purpose

この文書は MentorHQ の設計書で使う正式用語を固定し、README・設計書・今後の UI / TypeScript / データモデルで共通に参照できる辞書として使う。

対象:

- `README.md`
- `docs/00_VISION.md`
- `docs/01_AGENT_ARCHITECTURE.md`
- `docs/02_AGENT_CATALOG.md`
- `docs/03_COACH_DECISION_FLOW.md`
- `docs/04_QUESTION_FLOW.md`
- `docs/05_DATA_MODEL.md`
- `docs/06_MVP_SCOPE.md`
- `docs/07_IMPLEMENTATION_PLAN.md`

---

## Terminology Audit

### High-priority Terms

| Term | Found In | Meaning | Similar Terms | Canonical Candidate |
| --- | --- | --- | --- | --- |
| Coach | `README.md`, `docs/00_VISION.md`, `docs/01_AGENT_ARCHITECTURE.md`, `docs/02_AGENT_CATALOG.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/04_QUESTION_FLOW.md`, `docs/06_MVP_SCOPE.md` | 学習者への最終対応と意思決定を担う主体 | final coach judgment, coach action | `coach` |
| Agent | 全体 | Coach を支援する分析主体 | analytical assistant, specialized AI agents | `agent` |
| agent report / Agent report / Agent Reports / reports | `README.md`, `docs/00_VISION.md`, `docs/01_AGENT_ARCHITECTURE.md`, `docs/02_AGENT_CATALOG.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/04_QUESTION_FLOW.md`, `docs/06_MVP_SCOPE.md`, `docs/07_IMPLEMENTATION_PLAN.md` | Agent が Coach に返す分析結果 | report, reports, decision material | `agent_report` |
| agent deliberation / Agent Deliberation | `docs/01_AGENT_ARCHITECTURE.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/09_UI_BLUEPRINT.md` | Agent 同士が観測結果を共有し、仮説・信頼度・推奨介入を更新するプロセス | agent discussion, deliberation stream | `agent_deliberation` |
| recommendation | `docs/01_AGENT_ARCHITECTURE.md`, `docs/02_AGENT_CATALOG.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/05_DATA_MODEL.md` | Agent が提案する次の一手 | recommended check question, recommended_next_action | `recommendation` |
| coach decision / Coach Decision | `README.md`, `docs/05_DATA_MODEL.md`, `docs/06_MVP_SCOPE.md`, `docs/07_IMPLEMENTATION_PLAN.md` | Coach が最終的に採用する判断 | final coach judgment, final intervention, coach action | `coach_decision` |
| decision trace / Decision trace | `README.md`, `docs/01_AGENT_ARCHITECTURE.md`, `docs/02_AGENT_CATALOG.md`, `docs/05_DATA_MODEL.md`, `docs/06_MVP_SCOPE.md`, `docs/07_IMPLEMENTATION_PLAN.md` | Coach の判断根拠の記録 | trace, final coach decision trace | `decision_trace` |
| intervention | `README.md`, `docs/00_VISION.md`, `docs/02_AGENT_CATALOG.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/05_DATA_MODEL.md`, `docs/06_MVP_SCOPE.md` | Coach が学習者へ行う介入全般 | final intervention, learner-facing intervention, intervention result | `intervention` |
| intervention_type | `README.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/04_QUESTION_FLOW.md`, `docs/05_DATA_MODEL.md`, `docs/06_MVP_SCOPE.md` | 介入カテゴリ | intervention strategy | `intervention_type` |
| selected_intervention | `docs/03_COACH_DECISION_FLOW.md`, `docs/05_DATA_MODEL.md` | 今回 Coach が採用した具体介入 | selected intervention, final intervention | `selected_intervention` |
| intervention_target | `docs/04_QUESTION_FLOW.md`, `docs/05_DATA_MODEL.md` | 介入で確認したい焦点 | focus phrase, current_focus | `intervention_target` |
| observation_goal | `docs/03_COACH_DECISION_FLOW.md`, `docs/05_DATA_MODEL.md` | その介入で何を観測したいか | purpose, why this intervention | `observation_goal` |
| learner belief / belief | `README.md`, `docs/02_AGENT_CATALOG.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/04_QUESTION_FLOW.md` | 学習者がその時点で真だと思っている内容 | selected_judgment, learner judgment | `learner_belief` |
| objective truth | `README.md`, `docs/02_AGENT_CATALOG.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/04_QUESTION_FLOW.md`, `docs/05_DATA_MODEL.md` | システム側が保持する客観的正誤 | correct answer, actual correctness | `objective_truth` |
| question flow / Question Flow | `README.md`, `docs/04_QUESTION_FLOW.md`, `docs/06_MVP_SCOPE.md`, `docs/07_IMPLEMENTATION_PLAN.md` | 問題提示から観測・再介入までの流れ | teaching flow, product flow | `question_flow` |
| strategy | `README.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/04_QUESTION_FLOW.md`, `docs/06_MVP_SCOPE.md` | 介入や観測の進め方 | intervention strategy, default strategy, observation strategy | `intervention_type` |
| action | `docs/02_AGENT_CATALOG.md`, `docs/05_DATA_MODEL.md`, `docs/07_IMPLEMENTATION_PLAN.md` | 次に取る具体動作 | next question action, recommended_next_action, coach action | `next_action` |

### Supporting Terms

| Term | Found In | Meaning | Similar Terms | Canonical Candidate |
| --- | --- | --- | --- | --- |
| finding | `README.md`, `docs/01_AGENT_ARCHITECTURE.md`, `docs/02_AGENT_CATALOG.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/05_DATA_MODEL.md` | Agent が観測・推定した主要所見 | misconception hypothesis | `finding` |
| risk | `README.md`, `docs/01_AGENT_ARCHITECTURE.md`, `docs/02_AGENT_CATALOG.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/05_DATA_MODEL.md` | 見逃しや負荷などの注意点 | progress risk, overload risk | `risk` |
| evidence | `README.md`, `docs/01_AGENT_ARCHITECTURE.md`, `docs/02_AGENT_CATALOG.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/05_DATA_MODEL.md` | 推定根拠 | supporting facts | `evidence` |
| confidence | `README.md`, `docs/01_AGENT_ARCHITECTURE.md`, `docs/02_AGENT_CATALOG.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/04_QUESTION_FLOW.md`, `docs/05_DATA_MODEL.md` | 推定や自己申告の確からしさ | confidence_self_report, leg-level confidence | `confidence` |
| rationale | `docs/04_QUESTION_FLOW.md`, `docs/05_DATA_MODEL.md` | 推定や比較の理由説明 | reason, comparison rationale | `rationale` |
| reflection input / reflection text / short reason | `README.md`, `docs/02_AGENT_CATALOG.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/04_QUESTION_FLOW.md`, `docs/05_DATA_MODEL.md`, `docs/06_MVP_SCOPE.md` | 学習者の短い言語化入力 | reflection, learner wording | `reflection` |
| current context / current question state / current session context | `README.md`, `docs/02_AGENT_CATALOG.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/04_QUESTION_FLOW.md` | 判断に使う現在の状況要約 | shared facts, derived state | `current_context` |
| focused check / check question / short check-question format | `docs/03_COACH_DECISION_FLOW.md`, `docs/04_QUESTION_FLOW.md`, `docs/06_MVP_SCOPE.md` | 1 つの焦点に絞った確認 | starting_point_check | `selected_intervention` |
| integrated retry / final integrated question | `README.md`, `docs/03_COACH_DECISION_FLOW.md`, `docs/04_QUESTION_FLOW.md`, `docs/06_MVP_SCOPE.md` | 局所観測後に本来の一問へ戻す再回答 | integrated question performance, final answer | `integrated_retry` |

---

## Canonical Terminology

### Core Entities

| Canonical Term | Japanese Definition | Usage Rule |
| --- | --- | --- |
| `coach` | 学習者への最終応答と介入選択を行う主体 | UI・設計書ともに `Coach` 表記を使う |
| `learner` | 学習対象者 | UI では `Learner`、データモデルでは `learner` |
| `agent` | Coach を支援する専門分析主体 | 個別名は `Memory Agent` など固有名詞扱い |
| `agent_report` | Agent が返す分析結果 1 件 | `report` 単独表現は避ける |
| `agent_deliberation` | Agent 間で観測を共有し、仮説や recommendation を更新するプロセス | UI 演出ではなく設計概念として使う |
| `coach_decision` | Coach が最終的に採用した判断 | `final coach judgment` より優先 |
| `decision_trace` | Coach がその判断に至った経緯の記録 | `trace` 単独表現は避ける |

### Intervention Vocabulary

| Canonical Term | Japanese Definition | Usage Rule |
| --- | --- | --- |
| `intervention` | Coach が学習者に行う介入全般 | 総称として使う |
| `intervention_type` | 介入カテゴリ | `leg_breakdown` などの種別名に使う |
| `selected_intervention` | Coach が今回実行する具体介入 | `intervention_type` と同値にせず、採用結果として扱う |
| `intervention_target` | 介入対象の焦点 | 起算点、条件、主語などを入れる |
| `observation_goal` | その介入で観測したい目的 | `purpose` より優先して使う |
| `next_action` | 次に行う具体動作 | `coach action` / `next question action` を統一する |

### Learning State Vocabulary

| Canonical Term | Japanese Definition | Usage Rule |
| --- | --- | --- |
| `learner_belief` | 学習者が真だと思っている内容 | `belief` 単独より優先 |
| `objective_truth` | システム側が保持する客観的な正誤 | 正解状態の正式語 |
| `reflection` | 学習者の短い理由・言語化 | `short reason` / `reflection text` を統一 |
| `current_context` | Coach が判断に使う現時点の状況 | current question state などの統一先 |
| `finding` | Agent の主要所見 | 仮説・観測結果の第一要素 |
| `recommendation` | Agent の提案 | Agent 出力では正式語として維持 |

### Canonical Intervention Types

| Canonical Term | Japanese Definition |
| --- | --- |
| `leg_breakdown` | 脚・選択肢ごとに belief を観測する介入 |
| `contrast_check` | 類似条件や選択肢の差分を比較させる介入 |
| `starting_point_check` | 起算点や単一条件を言語化させる介入 |
| `integrated_retry` | 本来の一問へ戻して再回答させる介入 |

### Recommended Concept Relationships

- `intervention_type` = 介入カテゴリ
- `selected_intervention` = Coach が今回採用した具体介入
- `intervention_target` = 介入対象
- `observation_goal` = 観測目的
- `agent_report` = Agent が返す分析結果
- `agent_deliberation` = Agent 間の情報共有と仮説更新プロセス
- `coach_decision` = Coach が最終的に採用した判断
- `learner_belief` = 学習者が真だと思っている内容
- `objective_truth` = システム側が保持する正解状態
- `decision_trace` = Coach がその判断に至った経緯

---

## Naming Rules

### Data Model

データモデルでは `snake_case` を使う。

例:

- `learner_belief`
- `coach_decision`
- `intervention_type`
- `selected_intervention`
- `observation_goal`

### TypeScript

TypeScript では `camelCase` を使う。

例:

- `learnerBelief`
- `coachDecision`
- `interventionType`
- `selectedIntervention`
- `observationGoal`

### UI Labels

UI 表示では Human-readable labels を使う。

例:

- `Learner Belief`
- `Coach Decision`
- `Intervention Type`
- `Observation Goal`
- `Decision Trace`

### Naming Policy

- 設計概念はまず `snake_case` の canonical name を決める
- TypeScript はその機械変換として `camelCase` にする
- UI は意味が伝わる英語ラベルを使い、内部キー名をそのまま見せない
- 同一概念に対して `strategy`, `flow`, `action`, `judgment` などの別名を混在させない

---

## Ambiguous Terms

| Ambiguous Term | Problem | Recommendation | Action |
| --- | --- | --- | --- |
| `intervention` | 総称と具体介入の両方で使われている | 総称だけに使い、具体値は `selected_intervention` に寄せる | KEEP |
| `strategy` | `intervention strategy`, `default strategy`, `observation strategy` と意味が広い | 種別名としては `intervention_type`、目的説明では `observation_goal` を使う | RENAME |
| `flow` | `question flow`, `decision flow`, `product flow` が混在 | 文書構造名だけに限定し、データ項目には使わない | KEEP |
| `action` | `next question action`, `coach action`, `recommended_next_action` が混在 | `next_action` に統一 | RENAME |
| `decision` | 判断結果、判断過程、UI セクション名の複数意味 | 結果は `coach_decision`、過程は `decision_trace` に分ける | KEEP |
| `report` | 汎用語で、Agent 以外のレポートにも見える | `agent_report` に統一 | RENAME |
| `recommendation` | Agent 提案と Coach 採用案が曖昧になる | Agent 提案専用語として使い、Coach 側は `selected_intervention` を使う | KEEP |
| `belief` | 単独だと何についての belief か不明瞭 | `learner_belief` に統一 | RENAME |
| `truth` | 真偽一般にも読める | `objective_truth` に統一 | RENAME |
| `reason` | learner の理由、decision reason、comparison rationale が混線する | 学習者入力は `reflection`、判断根拠は `decision_reason`、推定理由は `rationale` に分ける | RENAME |
| `judgment` | learner の回答、Coach の判断、UI セクション名のいずれにも読める | learner 側は `selected_judgment`、Coach 側は `coach_decision` に分離 | RENAME |
| `final intervention` | `selected_intervention` と重複 | `selected_intervention` に統一 | REMOVE |
| `final coach judgment` | `coach_decision` と重複 | `coach_decision` に統一 | REMOVE |
| `coach action` | `next_action` / `selected_intervention` と重複 | 文脈に応じて `selected_intervention` または `next_action` に分解 | REMOVE |

---

## Recommended Replacements

| Replace From | Replace To |
| --- | --- |
| `Agent report`, `Agent Reports`, `report`, `reports` | `agent_report` |
| `final coach judgment` | `coach_decision` |
| `final intervention` | `selected_intervention` |
| `intervention strategy`, `default strategy`, `observation strategy` | `intervention_type` |
| `belief` | `learner_belief` |
| `truth` | `objective_truth` |
| `short reason`, `reflection text`, `learner wording` | `reflection` |
| `coach action`, `next question action`, `recommended_next_action` | `next_action` |
| `purpose` | `observation_goal` |
| `trace` | `decision_trace` |

---

## Adoption Notes

- 今後の README / docs 更新では、概念名を追加する前にこの文書の canonical term と重複確認を行う
- データモデルに載る概念は、まずこの文書に canonical term を追加してから schema に反映する
- UI 文言は自然言語でよいが、内部状態名はこの文書の canonical term に合わせる
