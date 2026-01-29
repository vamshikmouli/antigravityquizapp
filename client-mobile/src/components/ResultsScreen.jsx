import { useState, useEffect } from 'react'
import './ResultsScreen.css'

function ResultsScreen({ socket, participantData }) {
  const [analytics, setAnalytics] = useState(null)
  const [myStats, setMyStats] = useState(null)
  
  useEffect(() => {
    if (!socket) return
    
    socket.on('analytics-ready', (data) => {
      setAnalytics(data.analytics)
      
      // Find my stats
      const myData = data.analytics.topPerformers.find(p => p.name === participantData.name)
      if (myData) {
        setMyStats(myData)
      }
    })
    
    return () => {
      socket.off('analytics-ready')
    }
  }, [socket, participantData])
  
  if (!analytics || !myStats) {
    return (
      <div className="results-screen">
        <div className="loading-results">
          <div className="spinner"></div>
          <p>Calculating results...</p>
        </div>
      </div>
    )
  }
  
  const getRankEmoji = (rank) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return '🎯'
  }
  
  const getRankMessage = (rank) => {
    if (rank === 1) return 'Amazing! You\'re #1!'
    if (rank === 2) return 'Great job! Second place!'
    if (rank === 3) return 'Well done! Third place!'
    if (rank <= 5) return 'Good effort! Top 5!'
    return 'Thanks for playing!'
  }
  
  return (
    <div className="results-screen fade-in">
      <div className="results-header">
        <h1>Quiz Complete!</h1>
      </div>
      
      <div className="my-results card-glass">
        <div className="rank-display">
          <div className="rank-emoji">{getRankEmoji(myStats.rank)}</div>
          <div className="rank-number">#{myStats.rank}</div>
          <div className="rank-message">{getRankMessage(myStats.rank)}</div>
        </div>
        
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{myStats.score}</div>
            <div className="stat-label">Total Score</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{myStats.buzzerWins}</div>
            <div className="stat-label">Buzzer Wins</div>
          </div>
        </div>
      </div>
      
      <div className="leaderboard-section">
        <h2>Top Performers</h2>
        <div className="leaderboard">
          {analytics.topPerformers.slice(0, 10).map((performer, index) => (
            <div 
              key={index}
              className={`leaderboard-item ${performer.name === participantData.name ? 'highlight' : ''}`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="rank-badge">
                {index < 3 ? getRankEmoji(index + 1) : `#${index + 1}`}
              </div>
              <div className="performer-name">
                {performer.name}
                {performer.name === participantData.name && <span className="you-tag">You</span>}
              </div>
              <div className="performer-score">{performer.score} pts</div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="overall-stats">
        <h3>Quiz Statistics</h3>
        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-icon">👥</div>
            <div className="stat-number">{analytics.totalStudents}</div>
            <div className="stat-text">Students</div>
          </div>
          <div className="stat-box">
            <div className="stat-icon">📊</div>
            <div className="stat-number">{Math.round(analytics.averageScore)}</div>
            <div className="stat-text">Avg Score</div>
          </div>
        </div>
      </div>
      
      <div className="results-footer">
        <p>Great job participating!</p>
      </div>
    </div>
  )
}

export default ResultsScreen
