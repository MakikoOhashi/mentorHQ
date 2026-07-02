type AgentReport = {
  agentName: string;
  finding: string;
  risk: string;
  recommendation: string;
  signalScore: number;
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
  objectiveTruth: "false",
  learnerBelief: "true",
  reflection:
    "3ヶ月以内と書いてあるので正しいと思った。",
  coachResponse: "その3ヶ月は、いつから数えると思いましたか？",
  integratedRetry: {
    title: "本来の一問として再挑戦",
    description:
      "脚ごとの確認後、最後に元の四択問題へ戻して統合理解を確認する",
    status: "ready after coach response"
  },
  agentReports: [
    {
      agentName: "Misconception Agent",
      finding: "起算点誤認の可能性が高い",
      risk: "期間だけに反応し、起算点を確認していない",
      recommendation: "その3ヶ月をいつから数えると思ったか確認する",
      signalScore: 0.86,
      evidence: [
        "reflection が「3ヶ月以内」にのみ言及している",
        "起算点に関する記述がない"
      ]
    },
    {
      agentName: "Memory Agent",
      finding: "期限・期間問題で同種の誤りが再発している",
      risk: "単発ミスではなく、法的期間の読み方に弱点がある",
      recommendation: "短い確認質問で起算点を言語化させる",
      signalScore: 0.78,
      evidence: ["prior_cases: 2026-05-30", "prior_cases: 2026-06-03"]
    },
    {
      agentName: "Load Agent",
      finding: "今日の負荷はやや高い",
      risk: "長い解説を入れると処理負荷が上がる",
      recommendation: "解説ではなく1問だけ確認質問にする",
      signalScore: 0.72,
      evidence: ["recent_accuracy: unstable", "session_load: high"]
    }
  ] satisfies AgentReport[],
  coachDecision: {
    interventionType: "starting_point_check",
    selectedIntervention: "その3ヶ月は、いつから数えると思いましたか？",
    interventionTarget: "3-month period starting point",
    observationGoal:
      "学習者が説明前に起算点を言語化できるか確認する",
    decisionReason:
      "Misconception Agent と Memory Agent が同じ起算点誤認を示し、Load Agent が短い確認質問を推奨したため",
    rejectedRecommendations: ["今すぐ全文解説する", "追加問題をすぐ出す"],
    decisionTrace:
      "Coach chose starting_point_check instead of explanation because the system needs to observe the learner's belief before revealing the rule."
  }
};

const judgmentOptions = [
  { label: "True", active: true },
  { label: "False", active: false },
  { label: "Unsure", active: false }
];

export default function Home() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Phase 1 Static UI</p>
          <h1>Mentor Workspace</h1>
          <p className="hero-copy">
            Coach が learner の誤信を観測し、Agent report を比較して次の一手を決める
            デモ用ワークスペースです。
          </p>
        </div>
        <div className="hero-meta">
          <span>{workspace.exam}</span>
          <span>{workspace.theme}</span>
          <span>Mock only / No backend</span>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="column">
          <div className="column-header">
            <p className="eyebrow">Left Column</p>
            <h2>Learner / Coach Workspace</h2>
          </div>

          <article className="panel">
            <div className="panel-heading">
              <span className="panel-kicker">Question title</span>
              <h3>{workspace.questionTitle}</h3>
            </div>
            <p className="body-copy">{workspace.questionStem}</p>
            <div className="topic-chip">Current question_leg</div>
            <p className="leg-statement">{workspace.currentLeg}</p>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <span className="panel-kicker">Leg judgment</span>
              <h3>What does the learner currently believe?</h3>
            </div>
            <div className="button-row">
              {judgmentOptions.map((option) => (
                <button
                  key={option.label}
                  className={option.active ? "choice active" : "choice"}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="summary-grid">
              <div className="summary-card">
                <span className="summary-label">learner_belief</span>
                <strong>{workspace.learnerBelief}</strong>
              </div>
              <div className="summary-card">
                <span className="summary-label">objective_truth</span>
                <strong>{workspace.objectiveTruth}</strong>
              </div>
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <span className="panel-kicker">Reflection input</span>
              <h3>Learner reasoning signal</h3>
            </div>
            <div className="reflection-box">{workspace.reflection}</div>
          </article>

          <article className="panel emphasis">
            <div className="panel-heading">
              <span className="panel-kicker">Coach response</span>
              <h3>Selected learner-facing prompt</h3>
            </div>
            <blockquote>{workspace.coachResponse}</blockquote>
            <p className="helper-text">
              説明を先に出さず、起算点を learner 自身に言語化してもらうための短い確認質問。
            </p>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <span className="panel-kicker">Integrated retry</span>
              <h3>{workspace.integratedRetry.title}</h3>
            </div>
            <p className="body-copy">{workspace.integratedRetry.description}</p>
            <div className="status-pill">{workspace.integratedRetry.status}</div>
          </article>
        </div>

        <div className="column">
          <div className="column-header">
            <p className="eyebrow">Right Column</p>
            <h2>Coach Decision Workspace</h2>
          </div>

          <article className="panel">
            <div className="panel-heading">
              <span className="panel-kicker">Agent reports</span>
              <h3>Coach-facing evidence and recommendations</h3>
            </div>
            <div className="report-list">
              {workspace.agentReports.map((report) => (
                <section className="agent-card" key={report.agentName}>
                  <div className="agent-topline">
                    <h4>{report.agentName}</h4>
                    <span>{Math.round(report.signalScore * 100)}%</span>
                  </div>
                  <div className="signal-score-bar">
                    <span style={{ width: `${report.signalScore * 100}%` }} />
                  </div>
                  <dl className="detail-list">
                    <div>
                      <dt>Finding</dt>
                      <dd>{report.finding}</dd>
                    </div>
                    <div>
                      <dt>Risk</dt>
                      <dd>{report.risk}</dd>
                    </div>
                    <div>
                      <dt>Recommendation</dt>
                      <dd>{report.recommendation}</dd>
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
                  </dl>
                </section>
              ))}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <span className="panel-kicker">Coach thinking</span>
              <h3>Why this intervention, why now</h3>
            </div>
            <div className="thinking-grid">
              <div className="thinking-card">
                <span className="summary-label">selected_priority</span>
                <p>起算点誤認を explanation 前に観測する</p>
              </div>
              <div className="thinking-card">
                <span className="summary-label">why_now</span>
                <p>高負荷セッションなので短い確認質問を優先する</p>
              </div>
              <div className="thinking-card">
                <span className="summary-label">rejected_recommendations</span>
                <ul className="evidence-list">
                  {workspace.coachDecision.rejectedRecommendations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </article>

          <article className="panel spotlight">
            <div className="panel-heading">
              <span className="panel-kicker">Selected intervention</span>
              <h3>Coach Decision</h3>
            </div>
            <div className="decision-core">
              <div>
                <span className="summary-label">intervention_type</span>
                <p>{workspace.coachDecision.interventionType}</p>
              </div>
              <div>
                <span className="summary-label">intervention_target</span>
                <p>{workspace.coachDecision.interventionTarget}</p>
              </div>
              <div>
                <span className="summary-label">observation_goal</span>
                <p>{workspace.coachDecision.observationGoal}</p>
              </div>
              <div>
                <span className="summary-label">selected_intervention</span>
                <blockquote>{workspace.coachDecision.selectedIntervention}</blockquote>
              </div>
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <span className="panel-kicker">Decision trace</span>
              <h3>Short log of the final call</h3>
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
