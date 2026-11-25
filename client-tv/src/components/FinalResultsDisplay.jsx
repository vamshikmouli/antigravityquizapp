import React, { useEffect } from 'react';
import ResultsTable from './ResultsTable';

const FinalResultsDisplay = ({ analytics, sessionCode, audioManager, onClose }) => {
  useEffect(() => {
    if (audioManager) {
      audioManager.play('FINAL_RESULTS');
    }
  }, [audioManager]);

  const { detailedResults, totalStudents, averageScore } = analytics;
  const winners = detailedResults.slice(0, 3);

  const place = (w, cls, medal) => w && (
    <div className={`gm-podium-place ${cls}`}>
      <div className="gm-podium-avatar">{w.name?.charAt(0).toUpperCase()}<span>{medal}</span></div>
      <div className="gm-podium-name">{w.name}</div>
      <div className="gm-podium-score">{w.totalScore} pts</div>
      <div className="gm-podium-step">{cls === 'first' ? 1 : cls === 'second' ? 2 : 3}</div>
    </div>
  );

  return (
    <div className="gm-final">
      <div className="gm-confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
      <header className="gm-final-head">
        <div className="ds-kicker">Quiz complete</div>
        <h1>And the winners <span className="ds-grad-text">are…</span></h1>
        <div className="ds-row" style={{ justifyContent: 'center' }}>
          <span className="ds-chip">👥 {totalStudents} players</span>
          <span className="ds-chip">📈 Average {averageScore}</span>
          <span className="ds-chip">🔑 {sessionCode}</span>
        </div>
      </header>

      <section className="gm-podium">
        {place(winners[1], 'second', '🥈')}
        {place(winners[0], 'first', '🥇')}
        {place(winners[2], 'third', '🥉')}
      </section>

      <section className="gm-scorecard">
        <h2>Scorecard</h2>
        <ResultsTable results={detailedResults} />
      </section>

      <footer className="gm-final-foot">
        <span className="ds-muted">Thanks for playing! 🎉</span>
        <button onClick={onClose} className="ds-btn ds-btn-primary">Back to dashboard</button>
      </footer>
    </div>
  );
};

export default FinalResultsDisplay;
