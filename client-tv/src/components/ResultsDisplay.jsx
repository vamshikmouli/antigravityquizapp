import { useState, useEffect } from 'react'
import './ResultsDisplay.css'

function ResultsDisplay({ socket, sessionData }) {
  const [analytics, setAnalytics] = useState(null)
  
  useEffect(() => {
    if (!socket) return
    
    socket.on('analytics-ready', (data) => {
      setAnalytics(data.analytics)
    })
    
    return () => {
      socket.off('analytics-ready')
    }
  }, [socket])
  
  if (!analytics) {
    return (
      <div className="results-display-tv">
        <div className="loading-analytics">
          <div className="spinner"></div>
          <h2>Calculating results...</h2>
        </div>
      </div>
    )
  }
  
  const topThree = analytics.topPerformers.slice(0, 3)
  const restOfTop = analytics.topPerformers.slice(3, 10)
  
  return (
    <div className="results-display-tv fade-in">
      <div className="results-header-tv">
        <h1>🎉 Quiz Complete! 🎉</h1>
        <div className="session-stats">
          <div className="stat-box-tv">
            <div className="stat-icon-tv">👥</div>
            <div className="stat-value-tv">{analytics.totalStudents}</div>
            <div className="stat-label-tv">Students</div>
          </div>
          <div className="stat-box-tv">
            <div className="stat-icon-tv">📊</div>
            <div className="stat-value-tv">{Math.round(analytics.averageScore)}</div>
            <div className="stat-label-tv">Avg Score</div>
          </div>
        </div>
      </div>
      
      {/* Podium */}
      <div className="podium">
        {topThree.length >= 2 && (
          <div className="podium-place second slide-in-left">
            <div className="medal">🥈</div>
            <div className="place-name">{topThree[1].name}</div>
            <div className="place-score">{topThree[1].score} pts</div>
            <div className="podium-stand second-stand">2</div>
          </div>
        )}
        
        {topThree.length >= 1 && (
          <div className="podium-place first fade-in">
            <div className="crown">👑</div>
            <div className="medal">🥇</div>
            <div className="place-name">{topThree[0].name}</div>
            <div className="place-score">{topThree[0].score} pts</div>
            <div className="podium-stand first-stand">1</div>
          </div>
        )}
        
        {topThree.length >= 3 && (
          <div className="podium-place third slide-in-right">
            <div className="medal">🥉</div>
            <div className="place-name">{topThree[2].name}</div>
            <div className="place-score">{topThree[2].score} pts</div>
            <div className="podium-stand third-stand">3</div>
          </div>
        )}
      </div>
      
      {/* Rest of Top 10 */}
      {restOfTop.length > 0 && (
        <div className="rest-of-top">
          <h3>Top 10</h3>
          <div className="top-list">
            {restOfTop.map((performer, index) => (
              <div
                key={index}
                className="top-item"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="top-rank">#{performer.rank}</div>
                <div className="top-name">{performer.name}</div>
                <div className="top-score">{performer.score} pts</div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Buzzer Stats */}
      {analytics.buzzerStats && analytics.buzzerStats.totalBuzzerQuestions > 0 && (
        <div className="buzzer-stats-tv">
          <h3>⚡ Buzzer Statistics</h3>
          <div className="buzzer-stats-grid">
            <div className="buzzer-stat">
              <div className="buzzer-stat-label">Fastest Buzz</div>
              <div className="buzzer-stat-value">{analytics.buzzerStats.fastestBuzz}ms</div>
            </div>
            <div className="buzzer-stat">
              <div className="buzzer-stat-label">Avg Buzz Time</div>
              <div className="buzzer-stat-value">{analytics.buzzerStats.averageBuzzTime}ms</div>
            </div>
            <div className="buzzer-stat">
              <div className="buzzer-stat-label">Buzzer Accuracy</div>
              <div className="buzzer-stat-value">{analytics.buzzerStats.buzzerAccuracy}%</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ResultsDisplay
