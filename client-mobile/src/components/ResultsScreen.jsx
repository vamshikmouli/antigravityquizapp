import { useState, useEffect } from 'react'

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
      <div className="ph-page ph-center">
        <span className="ds-spinner" style={{ width: 28, height: 28 }} />
        <p className="ds-dim">Calculating final results…</p>
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
  
  const score = myStats.score ?? myStats.totalScore ?? 0

  return (
    <div className="ph-page ph-results">
      <div className="ph-hero">
        <div className="ds-kicker">Quiz complete</div>
        <div className="ph-rank">{getRankEmoji(myStats.rank)}<b>#{myStats.rank}</b></div>
        <h1>{getRankMessage(myStats.rank)}</h1>
      </div>

      <div className="ph-stats">
        <div className="ds-stat"><b>{score}</b><small>Your score</small></div>
        <div className="ds-stat"><b>{myStats.buzzerWins || 0}</b><small>Buzzer wins</small></div>
        <div className="ds-stat"><b>{analytics.totalStudents}</b><small>Players</small></div>
      </div>

      <div className="ph-card">
        <strong style={{ display: 'block', marginBottom: 10, fontSize: 15 }}>Leaderboard</strong>
        <div style={{ display: 'grid', gap: 6 }}>
          {analytics.topPerformers.slice(0, 10).map((performer, index) => {
            const mine = performer.name === participantData.name
            return (
              <div key={index} className={`ph-lb-row ${mine ? 'me' : ''}`} style={{ animationDelay: `${index * 40}ms` }}>
                <span className="ph-lb-rank">{index < 3 ? getRankEmoji(index + 1) : index + 1}</span>
                <span className="ph-lb-name">{performer.name}{mine && <em>you</em>}</span>
                <span className="ph-lb-score">{performer.score}</span>
              </div>
            )
          })}
        </div>
      </div>

      <button type="button" className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block ph-big-btn"
        onClick={() => { localStorage.removeItem('quiz-session'); window.location.href = '/'; }}>
        Join another quiz
      </button>
    </div>
  )
}

export default ResultsScreen
