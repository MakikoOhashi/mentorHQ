type DiscussionMessage = {
  agentName: string;
  role: string;
  icon: string;
  tone: "primary" | "support" | "consensus";
  message: string;
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
  discussionSummary:
    "AIチームが学習者の状態を持ち寄り、最短で誤解の根を確かめる介入をすり合わせています。",
  discussion: [
    {
      agentName: "Misconception Agent",
      role: "誤解の仮説",
      icon: "🧠",
      tone: "primary",
      message:
        "起算点を誤認している可能性があります。学習者は『3ヶ月以内』には反応していますが、いつから数えるかには触れていません。"
    },
    {
      agentName: "Memory Agent",
      role: "過去パターン",
      icon: "🔁",
      tone: "support",
      message:
        "過去にも似た読み違いがありました。前回は起算点だけを短く確認したあと、自力で理解を修正できています。"
    },
    {
      agentName: "Load Agent",
      role: "認知負荷",
      icon: "⚖️",
      tone: "support",
      message:
        "今回は論点を増やさない方がよさそうです。長い解説ではなく、起算点だけを尋ねる一問に絞ることを推奨します。"
    },
    {
      agentName: "Misconception Agent",
      role: "合意形成",
      icon: "🧠",
      tone: "consensus",
      message:
        "了解です。第一候補は『3ヶ月をいつから数えると思ったか』の確認でいきましょう。誤解の根本を最短で観測できます。"
    }
  ] satisfies DiscussionMessage[],
  coachDecision: {
    title: "起算点確認を採用",
    selectedIntervention: "その3ヶ月は、いつから数えると思いましたか？",
    observationGoal: "学習者が説明前に起算点を言語化できるか確認する",
    decisionReason:
      "誤解の根本原因を最短で検証でき、しかも高負荷の場面でも学習者の思考を崩さず観測できるため",
    selectedPriority: "説明より先に、起算点の誤認を短く観測する",
    whyNow: "いまは理解を増やすより、まず認識のズレを一点で確かめる段階です。"
  }
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
            <p className="eyebrow">AI Team Deliberation</p>
            <h2>複数Agentが議論し、Coachが介入を決める</h2>
          </div>

          <article className="panel discussion-panel">
            <div className="panel-heading tight discussion-heading">
              <div>
                <span className="panel-kicker">Agent Discussion</span>
                <h3>AIスタッフ会議の実況</h3>
              </div>
              <span className="live-pill">Live Deliberation</span>
            </div>
            <p className="body-copy compact-copy">{workspace.discussionSummary}</p>

            <div className="discussion-timeline">
              {workspace.discussion.map((entry, index) => (
                <section className={`discussion-row tone-${entry.tone}`} key={`${entry.agentName}-${index}`}>
                  <div className="discussion-avatar" aria-hidden="true">
                    {entry.icon}
                  </div>
                  <div className="discussion-bubble">
                    <div className="discussion-meta">
                      <span className="discussion-agent">{entry.agentName}</span>
                      <span className="discussion-role">{entry.role}</span>
                    </div>
                    <p>{entry.message}</p>
                  </div>
                </section>
              ))}
            </div>
          </article>

          <article className="panel spotlight decision-panel">
            <div className="decision-hero">
              <div>
                <span className="panel-kicker">Coach Decision</span>
                <h3>{workspace.coachDecision.title}</h3>
              </div>
              <p className="decision-summary">{workspace.coachDecision.selectedPriority}</p>
              <div className="reason-inline">
                <span className="summary-label">理由</span>
                <p>{workspace.coachDecision.decisionReason}</p>
              </div>
              <div className="decision-grid">
                <div className="decision-note">
                  <span className="summary-label">観測目的</span>
                  <p>{workspace.coachDecision.observationGoal}</p>
                </div>
                <div className="decision-note">
                  <span className="summary-label">なぜ今か</span>
                  <p>{workspace.coachDecision.whyNow}</p>
                </div>
              </div>
            </div>
          </article>

          <article className="panel next-question-panel">
            <div className="panel-heading tight">
              <span className="panel-kicker">Next Question</span>
              <h3>次の問い</h3>
            </div>
            <blockquote className="next-question-copy">
              「{workspace.coachDecision.selectedIntervention}」
            </blockquote>
          </article>
        </div>
      </section>
    </main>
  );
}
