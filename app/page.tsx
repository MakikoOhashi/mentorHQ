type AgentReport = {
  agentName: string;
  label: string;
  icon: string;
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
      "起算点の誤認が見えており、しかも今は長い説明より短い確認質問のほうが学習者の考えを観測しやすいため",
    selectedPriority: "説明より先に、起算点の誤認を短く観測する",
    whyNow: "高負荷セッションのため、長い解説より1問の確認質問を優先する",
    rejectedRecommendations: ["全文解説を先に出す", "追加問題へすぐ進む"],
    decisionTrace:
      "Coach chose starting_point_check instead of explanation because the system needs to observe the learner's belief before revealing the rule."
  },
  agentReports: [
    {
      agentName: "Misconception Agent",
      label: "誤解",
      icon: "🧠",
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
      label: "履歴",
      icon: "🔁",
      finding: "同種ミスが再発",
      risk: "法的期間の読み方に弱点がある",
      recommendation: "短い確認質問で起算点を言語化させる",
      confidence: 0.78,
      evidence: ["prior_cases: 2026-05-30", "prior_cases: 2026-06-03"]
    },
    {
      agentName: "Load Agent",
      label: "負荷",
      icon: "⚖️",
      finding: "短い確認が適切",
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
          <h1>Coach Workspace</h1>
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

          <article className="panel compact problem-panel">
            <div className="panel-heading tight">
              <span className="panel-kicker">問題</span>
              <h3>{workspace.questionTitle}</h3>
            </div>
            <p className="body-copy compact-copy">{workspace.questionStem}</p>
            <p className="leg-statement">{workspace.currentLeg}</p>
          </article>

          <article className="panel compact answer-panel">
            <div className="compact-stack">
              <div>
                <span className="summary-label">学習者の回答</span>
                <p className="value-text">{workspace.learnerBelief}</p>
              </div>
              <div>
                <span className="summary-label">理由</span>
                <div className="reflection-box">{workspace.reflection}</div>
              </div>
            </div>
          </article>
        </div>

        <div className="column">
          <div className="column-header">
            <p className="eyebrow">観察と介入</p>
            <h2>コーチが次の一手を決める</h2>
          </div>

          <article className="panel compact">
            <div className="panel-heading tight">
              <span className="panel-kicker">What We Noticed</span>
              <h3>学習者について見えてきたこと</h3>
            </div>
            <div className="report-list compact-reports">
              {workspace.agentReports.map((report) => (
                <section className="agent-card signal-card" key={report.agentName}>
                  <div className="signal-head">
                    <span className="signal-icon">{report.icon}</span>
                    <div className="signal-meta">
                      <span className="signal-label">{report.label}</span>
                      <span className="signal-agent">{report.agentName}</span>
                    </div>
                  </div>
                  <p className="signal-finding">{report.finding}</p>
                  <p className="signal-score">{Math.round(report.confidence * 100)}%</p>
                  <details className="agent-details">
                    <summary>詳細を見る</summary>
                    <div className="detail-list">
                      <div>
                        <dt>見立て</dt>
                        <dd>{report.risk}</dd>
                      </div>
                      <div>
                        <dt>推奨</dt>
                        <dd>{report.recommendation}</dd>
                      </div>
                      <div>
                        <dt>根拠</dt>
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

          <article className="panel spotlight decision-panel">
            <div className="decision-hero">
              <div>
                <span className="panel-kicker">Coach Decision</span>
                <h3>✅ まずは起算点の捉え方を確かめる</h3>
              </div>
              <p className="decision-summary">{workspace.coachDecision.selectedPriority}</p>
              <div className="reason-inline">
                <span className="summary-label">なぜこの判断か</span>
                <p>{workspace.coachDecision.decisionReason}</p>
              </div>
              <details className="mini-details">
                <summary>補足を見る</summary>
                <div className="detail-list">
                  <div>
                    <dt>なぜ今か</dt>
                    <dd>{workspace.coachDecision.whyNow}</dd>
                  </div>
                  <div>
                    <dt>観測目的</dt>
                    <dd>{workspace.coachDecision.observationGoal}</dd>
                  </div>
                  <div>
                    <dt>見送った案</dt>
                    <dd>
                      <ul className="evidence-list">
                        {workspace.coachDecision.rejectedRecommendations.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                  <div>
                    <dt>判断ログ</dt>
                    <dd>{workspace.coachDecision.decisionTrace}</dd>
                  </div>
                </div>
              </details>
            </div>
          </article>

          <article className="panel next-question-panel">
            <div className="panel-heading tight">
              <span className="panel-kicker">Next Question</span>
              <h3>次の問い</h3>
            </div>
            <blockquote className="next-question-copy">
              {workspace.coachDecision.selectedIntervention}
            </blockquote>
          </article>
        </div>
      </section>
    </main>
  );
}
