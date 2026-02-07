import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import './QuestionManager.css';

function CreateSessionPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuizId, setSelectedQuizId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [musicVolume, setMusicVolume] = useState(50);
  
  useEffect(() => {
    const fetchQuizzes = async () => {
      try {
        const res = await fetch('/api/quizzes', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setQuizzes(data);
        if (data.length > 0) setSelectedQuizId(data[0].id);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchQuizzes();
  }, [token]);

  const handleStartSession = async () => {
    if (!selectedQuizId) return alert('Please select a quiz');

    try {
      const res = await fetch(`/api/sessions/quiz/${selectedQuizId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          settings: {
            musicEnabled,
            musicVolume: musicVolume / 100, // Convert to 0-1 range
            showLiveResults: true
          }
        })
      });

      const session = await res.json();
      if (res.ok) {
        navigate('/lobby-connect', { state: { code: session.code, isHost: true } });
      } else {
        alert(session.error || 'Failed to start session');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to start session');
    }
  };

  const selectedQuiz = quizzes.find(q => q.id === selectedQuizId);

  return (
    <div className="dashboard-container fade-in">
      <header className="dashboard-header">
        <div className="header-info" style={{ display: 'flex', alignItems: 'center' }}>
          <Link to="/dashboard" className="top-left-back-btn">← Back</Link>
          <h1>Launch a Quiz</h1>
        </div>
      </header>

      <div className="session-wizard">
        <div className="wizard-step">
          <h2>Select Quiz Set</h2>
          <p>Choose the quiz you want to launch on the big screen.</p>
          
          <div className="quizzes-selection-grid" style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
            gap: '15px', 
            marginTop: '20px' 
          }}>
            {quizzes.map(quiz => (
              <div 
                key={quiz.id} 
                className={`card-glass quiz-select-card ${selectedQuizId === quiz.id ? 'selected' : ''}`} 
                onClick={() => setSelectedQuizId(quiz.id)}
                style={{
                  padding: '20px',
                  borderRadius: '20px',
                  border: selectedQuizId === quiz.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                  background: selectedQuizId === quiz.id ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  minHeight: '120px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}
              >
                <h3 style={{ fontSize: '1.5rem', marginBottom: '10px' }}>{quiz.title}</h3>
                <p style={{ opacity: 0.7 }}>{quiz._count.questions} Questions</p>
                {selectedQuizId === quiz.id && (
                  <div className="selected-badge" style={{ 
                    marginTop: '15px', 
                    color: 'var(--color-primary)', 
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}>
                    <span>✓</span> Selected
                  </div>
                )}
              </div>
            ))}
          </div>

          {quizzes.length === 0 && !loading && (
            <div className="no-data" style={{ marginTop: '50px' }}>
              <p>You haven't created any quizzes yet.</p>
              <Link to="/quizzes">
                <button className="primary-btn" style={{ marginTop: '20px', background: 'var(--grad-primary)' }}>Create a Quiz First</button>
              </Link>
            </div>
          )}
        </div>

        <div className="wizard-step" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.1rem', marginBottom: '8px', width: '100%', maxWidth: '500px' }}>Session Settings</h2>
          <div className="card-glass" style={{ 
            padding: '12px 18px', 
            borderRadius: '14px', 
            width: '100%',
            maxWidth: '500px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            margin: '0 auto'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.95rem' }}>🎵 Background Music</h3>
                <p style={{ opacity: 0.6, fontSize: '0.8rem', margin: '2px 0 0 0' }}>Play quiz music on this screen</p>
              </div>
              <label className="switch" style={{ 
                position: 'relative', 
                display: 'inline-block', 
                width: '44px', 
                height: '24px' 
              }}>
                <input 
                  type="checkbox" 
                  checked={musicEnabled} 
                  onChange={(e) => setMusicEnabled(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: 'pointer',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: musicEnabled ? 'var(--color-primary)' : '#333',
                  transition: '.3s',
                  borderRadius: '24px'
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '""',
                    height: '18px',
                    width: '18px',
                    left: '3px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    transition: '.3s',
                    borderRadius: '50%',
                    transform: musicEnabled ? 'translateX(20px)' : 'none'
                  }}></span>
                </span>
              </label>
            </div>

            {musicEnabled && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.9rem' }}>
                  <span style={{ opacity: 0.7 }}>Volume</span>
                  <span style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>{musicVolume}%</span>
                </div>
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={musicVolume} 
                  onChange={(e) => setMusicVolume(parseInt(e.target.value))}
                  style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                />
              </div>
            )}
            
            <div style={{ marginTop: '15px', padding: '10px 15px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ margin: 0, opacity: 0.8 }}>💡 Make sure you have uploaded music tracks in the <strong>Music Settings</strong> page.</p>
            </div>
          </div>
        </div>

        <div className="wizard-actions" style={{ 
          marginTop: '60px', 
          padding: '30px', 
          background: 'var(--color-surface)', 
          borderRadius: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div className="status">
            {selectedQuiz ? (
              <div>
                <strong style={{ fontSize: '1.2rem' }}>{selectedQuiz.title}</strong>
                <p style={{ opacity: 0.7 }}>{selectedQuiz._count.questions} questions will be launched</p>
              </div>
            ) : (
              <p>No quiz selected</p>
            )}
          </div>
          <button 
            onClick={handleStartSession} 
            className="launch-btn" 
            disabled={!selectedQuizId || (selectedQuiz?._count.questions === 0)}
            style={{
              padding: '18px 40px',
              fontSize: '1.2rem',
              borderRadius: '16px',
              background: (!selectedQuizId || selectedQuiz?._count.questions === 0) ? '#333' : 'var(--grad-success)',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontWeight: '800',
              boxShadow: '0 10px 20px rgba(0,0,0,0.3)'
            }}
          >
            Launch Quiz 🚀
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateSessionPage;
