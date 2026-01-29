import React from 'react';
import ResultsTable from './ResultsTable';
import './FinalResultsDisplay.css';

const FinalResultsDisplay = ({ analytics, sessionCode }) => {
  const { detailedResults, totalStudents, averageScore } = analytics;
  const winners = detailedResults.slice(0, 3);

  return (
    <div className="final-results-display fade-in">
      <div className="results-overlay">
        <header className="results-header">
          <h1>🏆 Quiz Completed!</h1>
          <div className="stat-pills">
            <span className="stat-pill">👥 {totalStudents} Participants</span>
            <span className="stat-pill">📈 Avg: {averageScore}</span>
            <span className="stat-pill">🔑 {sessionCode}</span>
          </div>
        </header>

        <main className="results-content">
          <section className="podium-section">
             {/* Small podium summary for top 3 */}
             <div className="podium">
                {winners[1] && (
                  <div className="podium-place second">
                    <div className="avatar">🥈</div>
                    <div className="podium-name">{winners[1].name}</div>
                    <div className="podium-score">{winners[1].totalScore}</div>
                    <div className="bar"></div>
                  </div>
                )}
                {winners[0] && (
                  <div className="podium-place first">
                    <div className="avatar">🥇</div>
                    <div className="podium-name">{winners[0].name}</div>
                    <div className="podium-score">{winners[0].totalScore}</div>
                    <div className="bar"></div>
                  </div>
                )}
                {winners[2] && (
                  <div className="podium-place third">
                    <div className="avatar">🥉</div>
                    <div className="podium-name">{winners[2].name}</div>
                    <div className="podium-score">{winners[2].totalScore}</div>
                    <div className="bar"></div>
                  </div>
                )}
             </div>
          </section>

          <section className="table-section">
            <h2>Detailed Scorecard</h2>
            <ResultsTable results={detailedResults} />
          </section>
        </main>
        
        <footer className="results-footer">
           <p>Thank you for playing!</p>
        </footer>
      </div>
    </div>
  );
};

export default FinalResultsDisplay;
