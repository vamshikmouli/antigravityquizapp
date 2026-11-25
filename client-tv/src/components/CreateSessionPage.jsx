import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

function CreateSessionPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuizId, setSelectedQuizId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(true);
  const [musicVolume, setMusicVolume] = useState(50);
  const [launching, setLaunching] = useState(false);
  
  useEffect(() => {
    const fetchQuizzes = async () => {
      try {
        const res = await fetch('/api/quizzes', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const list = Array.isArray(data) ? data : [];
        setQuizzes(list);
        const firstReady = list.find((q) => q._count?.questions > 0) || list[0];
        if (firstReady) setSelectedQuizId(firstReady.id);
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
    setLaunching(true);

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
    } finally {
      setLaunching(false);
    }
  };

  const selectedQuiz = quizzes.find((q) => q.id === selectedQuizId);
  const selectedCount = selectedQuiz?._count?.questions || 0;
  const COLORS = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#38bdf8', '#c084fc'];

  return (
    <div className="ds-page">
      <header className="ds-topbar">
        <Link to="/dashboard" className="ds-back" aria-label="Back">←</Link>
        <div className="ds-topbar-title">
          <small>New session</small>
          <h1>Launch a quiz</h1>
        </div>
      </header>

      <div className="cs-steps">
        <span className="ds-chip accent">1 · Pick a quiz</span>
        <span className="ds-muted">→</span>
        <span className="ds-chip">2 · Settings</span>
        <span className="ds-muted">→</span>
        <span className="ds-chip">3 · Launch & share the code</span>
      </div>

      <div className="ds-section-title" style={{ marginTop: 6 }}>
        <h2>Which quiz?</h2>
        <span>It will open on this screen; students join with a code.</span>
      </div>

      {loading && <div className="ds-grid">{[0, 1, 2].map((k) => <div key={k} className="ds-skeleton" style={{ height: 120 }} />)}</div>}

      {!loading && quizzes.length === 0 && (
        <div className="ds-empty">
          <span className="ds-tile lg grad">📚</span>
          <h3>No quizzes yet</h3>
          <p>Create a quiz first — AI can plan the rounds and questions for you.</p>
          <Link to="/quizzes" className="ds-btn ds-btn-primary">Create a quiz</Link>
        </div>
      )}

      <div className="ds-grid">
        {quizzes.map((quiz, i) => {
          const n = quiz._count?.questions || 0;
          const active = selectedQuizId === quiz.id;
          return (
            <button type="button" key={quiz.id} onClick={() => setSelectedQuizId(quiz.id)}
              className={`ds-card cs-quiz ${active ? 'active' : ''} ${n === 0 ? 'empty' : ''}`} style={{ '--c': COLORS[i % COLORS.length] }}>
              <span className="ds-tile" style={{ fontWeight: 800 }}>{quiz.title.trim()[0]?.toUpperCase() || '?'}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3>{quiz.title}</h3>
                <p>{n ? `${n} question${n === 1 ? '' : 's'}` : 'No questions yet'}</p>
              </div>
              <span className="cs-radio">{active ? '✓' : ''}</span>
            </button>
          );
        })}
      </div>

      {quizzes.length > 0 && (
        <>
          <div className="ds-section-title"><h2>Settings</h2></div>
          <div className="ds-card" style={{ maxWidth: 560, display: 'grid', gap: 16 }}>
            <div className="ds-row" style={{ flexWrap: 'nowrap' }}>
              <span className="ds-tile" style={{ '--c': '#f472b6' }}>🎵</span>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: 15 }}>Background music</h3>
                <p>Plays on this screen only. <Link to="/music-settings" className="ds-link">Manage tracks</Link></p>
              </div>
              <label className="ds-switch" aria-label="Background music">
                <input type="checkbox" checked={musicEnabled} onChange={(e) => setMusicEnabled(e.target.checked)} />
                <span />
              </label>
            </div>
            {musicEnabled && (
              <div>
                <div className="ds-row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="ds-label">Volume</span>
                  <strong style={{ color: 'var(--ds-accent-text)' }}>{musicVolume}%</strong>
                </div>
                <input className="ds-range" type="range" min="0" max="100" value={musicVolume}
                  onChange={(e) => setMusicVolume(parseInt(e.target.value, 10))} />
              </div>
            )}
          </div>
        </>
      )}

      {selectedQuiz && (
        <div className="ds-actionbar">
          <span className="ds-tile grad" style={{ width: 40, height: 40, fontSize: 18 }}>🚀</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedQuiz.title}</strong>
            <span className="ds-muted" style={{ fontSize: 13 }}>
              {selectedCount ? `${selectedCount} questions · music ${musicEnabled ? 'on' : 'off'}` : 'Add questions to this quiz before launching'}
            </span>
          </div>
          <button type="button" onClick={handleStartSession} className="ds-btn ds-btn-success ds-btn-lg"
            disabled={!selectedQuizId || selectedCount === 0 || launching}>
            {launching ? <><span className="ds-spinner" /> Launching…</> : 'Launch quiz →'}
          </button>
        </div>
      )}
    </div>
  );
}

export default CreateSessionPage;
