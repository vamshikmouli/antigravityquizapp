import React from 'react';
import './ResultsTable.css';

const ResultsTable = ({ results }) => {
  if (!results || results.length === 0) return null;

  // Extract all unique rounds from the results
  const allRounds = new Set();
  results.forEach(p => {
    Object.keys(p.roundScores).forEach(r => allRounds.add(Number(r)));
  });
  const sortedRounds = Array.from(allRounds).sort((a, b) => a - b);

  return (
    <div className="results-table-container fade-in">
      <table className="results-table">
        <thead>
          <tr>
            <th className="rank-col">#</th>
            <th className="name-col">Participant</th>
            {sortedRounds.map(round => (
              <th key={round} className="round-col">R{round}</th>
            ))}
            <th className="total-col">Total</th>
          </tr>
        </thead>
        <tbody>
          {results.map((p, index) => (
            <tr key={p.id} className={index < 3 ? `top-row rank-${index + 1}` : ''}>
              <td className="rank-cell">
                {p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : p.rank}
              </td>
              <td className="name-cell">{p.name}</td>
              {sortedRounds.map(round => (
                <td key={round} className="score-cell">
                  {p.roundScores[round] || 0}
                </td>
              ))}
              <td className="total-cell">{p.totalScore}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ResultsTable;
