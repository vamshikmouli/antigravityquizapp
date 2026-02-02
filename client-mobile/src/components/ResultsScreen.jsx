import { useState, useEffect } from 'react'
import './ResultsScreen.css'

function ResultsScreen({ socket, participantData }) {
  const [analytics, setAnalytics] = useState(null)
  const [myStats, setMyStats] = useState(null)
  
  useEffect(() => {
    if (!socket) return
    
    // Check if analytics are already available (e.g. on refresh after quiz ended)
    socket.emit('get-analytics', {}, (response) => {
      if (response && response.analytics) {
        handleAnalytics(response.analytics);
      }
    });

    const handleAnalytics = (data) => {
      console.log('[Results] Analytics received', data);
      setAnalytics(data)
      
      // Find my stats – try multiple ways to match
      let myData = data.detailedResults?.find(p => p.id === participantData.id);
      
      if (!myData) {
        myData = data.topPerformers?.find(p => p.name === participantData.name);
      }

      if (myData) {
        setMyStats(myData)
      } else {
        console.warn('[Results] Personal stats not found in analytics');
        // Fallback to basic data if available
        setMyStats({
          name: participantData.name,
          score: participantData.score || 0,
          rank: '?',
          buzzerWins: 0
        });
      }
    }

    socket.on('analytics-ready', (data) => {
      handleAnalytics(data.analytics);
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
          <p>Calculating final results...</p>
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
    if (rank === 1) return 'Incredible! You\'re the Champion! 🏆'
    if (rank === 2) return 'So close! Amazing 🥈 rank!'
    if (rank === 3) return 'Fantastic! You made the podium! 🥉'
    if (rank <= 5) return 'Great job! You\'re among the elite!'
    if (rank <= 10) return 'Well played! Top 10 finish!'
    return 'Good effort! Thanks for playing!'
  }
  
  return (
    <div className="results-screen fade-in">
      <div className="results-header">
        <h1>Quiz Complete!</h1>
        <p className="subtitle">Here's how you performed</p>
      </div>
      
      <div className="my-results card-glass">
        <div className="rank-display">
          <div className="rank-emoji">{getRankEmoji(myStats.rank)}</div>
          <div className="rank-number">#{myStats.rank}</div>
          <div className="rank-message">{getRankMessage(myStats.rank)}</div>
        </div>
        
        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-value">{myStats.score || myStats.totalScore}</div>
            <div className="stat-label">Total Score</div>
          </div>
          <div className="stat-item">
            <div className="stat-value">{myStats.buzzerWins}</div>
            <div className="stat-label">Buzzer Wins</div>
          </div>
        </div>
      </div>
      
      <div className="leaderboard-section">
        <h2>Global Leaderboard</h2>
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
                {performer.name === participantData.name && <span className="you-tag"> (You)</span>}
              </div>
              <div className="performer-score">{performer.score} pts</div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="overall-stats">
        <h3>Summary</h3>
        <div className="stats-row">
          <div className="stat-box card-glass">
            <div className="stat-icon">👥</div>
            <div className="stat-number">{analytics.totalStudents}</div>
            <div className="stat-text">Students</div>
          </div>
          <div className="stat-box card-glass">
            <div className="stat-icon">📊</div>
            <div className="stat-number">{Math.round(analytics.averageScore)}</div>
            <div className="stat-text">Avg Score</div>
          </div>
        </div>
      </div>
      
      <div className="results-footer">
        <button 
          onClick={() => {
            localStorage.removeItem('quiz-session');
            window.location.href = '/play';
          }} 
          className="play-again-btn"
        >
          Join Another Quiz
        </button>
      </div>
    </div>
  )
}

export default ResultsScreen
