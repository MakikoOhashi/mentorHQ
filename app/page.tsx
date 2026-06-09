type AgentReport = {
  agentName: string;
  finding: string;
  risk: string;
  recommendation: string;
  confidence: number;
  evidence: string[];
};

const workspace = {
  exam: "管理業務主任者試験",
  theme: "相続放棄 / 3ヶ月起算点誤認",
  questionTitle: "相続放棄の起算点を見抜けるか",
  questionStem:
    "次の記述のうち、民法上の相続放棄に関するものとして正しいか判断してください。",
  currentLeg:
    "相続放棄は、相続の開始があった時から3箇月以内にしなければならない。",
  learnerBelief: "正しいと思った",
  reflection: "3ヶ月以内と書いてあるので正しいと思った。",
  coachDecision: {
    interventionType: "starting_point_check",
    selectedIntervention: "その3ヶ月は、いつから数えると思いましたか？",
    interventionTarget: "3-month period starting point",
    observationGoal:
      "学習者が説明前に起算点を言語化できるか確認する",
    decisionReason:
      "Misconception Agent と Memory Agent が同じ起算点誤認を示し、Load Agent が短い確認質問を推奨したため",
    selectedPriority: "説明より先に、起算点の誤認を短く観測する",
    whyNow: "高負荷セッションのため、長い解説より1問の確認質問を優先する",
    rejectedRecommendations: ["全文解説を先に出す", "追加問題へすぐ進む"],
    decisionTrace:
      "Coach chose starting_point_check instead of explanation because the system needs to observe the learner's belief before revealing the rule."
  },
  agentReports: [
    {
      agentName: "Misconception Agent",
      finding: "起算点誤認の可能性",
      risk: "期間だけに反応し、起算点を確認していない",
      recommendation: "その3ヶ月をいつから数えると思ったか確認する",
      confidence: 0.86,
      evidence: [
        "reflection が「3ヶ月以内」にのみ言及している",
        "起算点に関する記述がない"
      ]
    },
    {
      agentName: "Memory Agent",
      finding: "同種ミスの再発傾向",
      risk: "法的期間の読み方に弱点がある",
      recommendation: "短い確認質問で起算点を言語化させる",
      confidence: 0.78,
      evidence: ["prior_cases: 2026-05-30", "prior_cases: 2026-06-03"]
    },
    {
      agentName: "Load Agent",
      finding: "短い確認が有効",
      risk: "長い解説は処理負荷を上げる",
      recommendation: "解説ではなく1問だけ確認質問にする",
      confidence: 0.72,
      evidence: ["recent_accuracy: unstable", "session_load: high"]
    }
  ] satisfies AgentReport[]
};

export default function Home() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">MentorHQ MVP Demo</p>
          <h1>Mentor Workspace</h1>
          <p className="hero-copy">
            Agent が何を検出し、Coach がどの介入を選んだかを
            10秒で追える意思決定デモです。
          </p>
        </div>
        <div className="hero-meta">
          <span>{workspace.exam}</span>
          <span>{workspace.theme}</span>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="column">
          <div className="column-header">
            <p className="eyebrow">ケース概要</p>
            <h2>学習者の状況</h2>
          </div>

          <article className="panel compact">
            <div className="panel-heading">
              <span className="panel-kicker">問題</span>
              <h3>{workspace.questionTitle}</h3>
            </div>
            <p className="body-copy">{workspace.questionStem}</p>
            <p className="leg-statement">{workspace.currentLeg}</p>
          </article>

          <article className="panel compact">
            <div className="compact-stack">
              <div>
                <span className="summary-label">現在の回答</span>
                <p className="value-text">{workspace.learnerBelief}</p>
              </div>
              <div>
                <span className="summary-label">learner reasoning</span>
                <div className="reflection-box">{workspace.reflection}</div>
              </div>
            </div>
          </article>
        </div>

        <div className="column">
          <div className="column-header">
            <p className="eyebrow">意思決定</p>
            <h2>コーチ判断</h2>
          </div>

          <article className="panel spotlight compact">
            <div className="panel-heading">
              <span className="panel-kicker">コーチ判断</span>
              <h3>次の一手</h3>
            </div>
            <div className="decision-core">
              <div className="decision-summary">
                <span className="summary-label">選択した介入</span>
                <blockquote>{workspace.coachDecision.selectedIntervention}</blockquote>
              </div>
              <div className="decision-meta">
                <div className="summary-card">
                  <span className="summary-label">介入タイプ</span>
                  <strong>{workspace.coachDecision.interventionType}</strong>
                </div>
                <div className="summary-card">
                  <span className="summary-label">観測対象</span>
                  <strong>{workspace.coachDecision.interventionTarget}</strong>
                </div>
                <div className="summary-card wide">
                  <span className="summary-label">観測目的</span>
                  <strong>{workspace.coachDecision.observationGoal}</strong>
                </div>
              </div>
            </div>
          </article>

          <article className="panel compact">
            <div className="panel-heading">
              <span className="panel-kicker">なぜこの介入か</span>
              <h3>判断理由</h3>
            </div>
            <div className="thinking-grid single-row">
              <div className="thinking-card">
                <span className="summary-label">優先したこと</span>
                <p>{workspace.coachDecision.selectedPriority}</p>
              </div>
              <div className="thinking-card">
                <span className="summary-label">なぜ今か</span>
                <p>{workspace.coachDecision.whyNow}</p>
              </div>
              <div className="thinking-card">
                <span className="summary-label">見送った案</span>
                <ul className="evidence-list">
                  {workspace.coachDecision.rejectedRecommendations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </article>

          <article className="panel compact">
            <div className="panel-heading">
              <span className="panel-kicker">Agent分析</span>
              <h3>要点だけ表示</h3>
            </div>
            <div className="report-list compact-reports">
              {workspace.agentReports.map((report) => (
                <section className="agent-card compact-agent-card" key={report.agentName}>
                  <div className="agent-topline">
                    <h4>{report.agentName}</h4>
                    <span>{Math.round(report.confidence * 100)}%</span>
                  </div>
                  <p className="agent-summary">{report.finding}</p>
                  <p className="agent-recommendation">{report.recommendation}</p>
                  <details className="agent-details">
                    <summary>詳細を見る</summary>
                    <div className="detail-list">
                      <div>
                        <dt>Risk</dt>
                        <dd>{report.risk}</dd>
                      </div>
                      <div>
                        <dt>Evidence</dt>
                        <dd>
                          <ul className="evidence-list">
                            {report.evidence.map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    </div>
                  </details>
                </section>
              ))}
            </div>
          </article>

          <article className="panel compact">
            <div className="panel-heading">
              <span className="panel-kicker">判断ログ</span>
              <h3>最終判断の記録</h3>
            </div>
            <div className="trace-log">
              <p className="trace-badge">decision_reason</p>
              <p>{workspace.coachDecision.decisionReason}</p>
              <p className="trace-badge">decision_trace</p>
              <p>{workspace.coachDecision.decisionTrace}</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
