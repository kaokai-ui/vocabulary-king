import StageHeader from "../shared/StageHeader";

export default function StatsScreen({ text, stats, quizHistory, locale, onHome }) {
  return (
    <main className="stage-shell">
      <StageHeader text={text} title={text.stats} subtitle={text.statsExplanation} onHome={onHome} />
      <section className="stats-grid">
        <div className="metric-card metric-card--large">
          <span>{text.studiedWords}</span>
          <strong>{stats.studiedCount}</strong>
        </div>
        <div className="metric-card metric-card--large">
          <span>{text.masteredWords}</span>
          <strong>{stats.masteredCount}</strong>
        </div>
        <div className="metric-card metric-card--large">
          <span>{text.unknownWords}</span>
          <strong>{stats.unknownCount}</strong>
        </div>
        <div className="metric-card metric-card--large">
          <span>{text.progress}</span>
          <strong>{stats.progressRate}%</strong>
        </div>
      </section>

      <section className="history-panel">
        <p className="empty-state mastery-rule">{text.masteryRule}</p>
        <h2>{text.quizHistory}</h2>
        {quizHistory.length === 0 ? (
          <p className="empty-state">{text.noQuizHistory}</p>
        ) : (
          quizHistory.map((record) => (
            <div key={`${record.playedAt}-${record.questionCount}`} className="history-row">
              <span>{new Date(record.playedAt).toLocaleString(locale)}</span>
              <strong>{record.accuracy}%</strong>
              <span>
                {record.correctCount}/{record.questionCount}
              </span>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
