import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const COLORS = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#38bdf8', '#c084fc'];

function QuizList() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [newQuizTitle, setNewQuizTitle] = useState('');
  const [newQuizDesc, setNewQuizDesc] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchQuizzes = async () => {
    try {
      const res = await fetch('/api/quizzes', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setQuizzes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch quizzes error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQuizzes(); }, [token]);

  const handleCreateQuiz = async (e) => {
    e.preventDefault();
    if (!newQuizTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: newQuizTitle.trim(), description: newQuizDesc.trim() || undefined })
      });
      if (res.ok) {
        const quiz = await res.json().catch(() => null);
        setNewQuizTitle('');
        setNewQuizDesc('');
        setShowAddModal(false);
        if (quiz?.id) navigate(`/quizzes/${quiz.id}`);
        else fetchQuizzes();
      }
    } catch (err) {
      console.error('Create quiz error:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteQuiz = async (id, title) => {
    if (!confirm(`Delete "${title}"? All questions inside will be deleted too.`)) return;
    try {
      const res = await fetch(`/api/quizzes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) fetchQuizzes();
    } catch (err) {
      console.error('Delete quiz error:', err);
    }
  };

  const shown = quizzes.filter((q) =>
    !search.trim() || `${q.title} ${q.description || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const totalQuestions = quizzes.reduce((s, q) => s + (q._count?.questions || 0), 0);

  return (
    <div className="ds-page">
      <header className="ds-topbar">
        <Link to="/dashboard" className="ds-back" aria-label="Back">←</Link>
        <div className="ds-topbar-title">
          <small>Question bank</small>
          <h1>My quizzes</h1>
        </div>
        <div className="ds-topbar-actions">
          <button type="button" onClick={() => setShowAddModal(true)} className="ds-btn ds-btn-primary">＋ New quiz</button>
        </div>
      </header>

      {!loading && quizzes.length > 0 && (
        <div className="ds-row" style={{ marginBottom: 18 }}>
          <div className="ds-search" style={{ flex: '1 1 260px', maxWidth: 420 }}>
            <input className="ds-input" type="search" placeholder="Search quizzes…" value={search}
              onChange={(e) => setSearch(e.target.value)} aria-label="Search quizzes" />
          </div>
          <span className="ds-spacer" />
          <span className="ds-chip">{quizzes.length} quizzes</span>
          <span className="ds-chip accent">{totalQuestions} questions</span>
        </div>
      )}

      {loading && (
        <div className="ds-grid">{[0, 1, 2].map((k) => <div key={k} className="ds-skeleton" style={{ height: 190 }} />)}</div>
      )}

      {!loading && quizzes.length === 0 && (
        <div className="ds-empty">
          <span className="ds-tile lg grad">📚</span>
          <h3>Create your first quiz</h3>
          <p>A quiz holds your rounds and questions. Add them by hand, import them, or let AI plan the whole thing.</p>
          <button type="button" onClick={() => setShowAddModal(true)} className="ds-btn ds-btn-primary">＋ New quiz</button>
        </div>
      )}

      {!loading && quizzes.length > 0 && shown.length === 0 && (
        <div className="ds-empty"><h3>No quizzes match “{search}”</h3><button className="ds-link" onClick={() => setSearch('')}>Clear search</button></div>
      )}

      <div className="ds-grid">
        {shown.map((quiz, i) => {
          const n = quiz._count?.questions || 0;
          return (
            <div key={quiz.id} className="ds-card hover" style={{ '--c': COLORS[i % COLORS.length], display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
              <div className="ds-row" style={{ alignItems: 'flex-start' }}>
                <span className="ds-tile lg" style={{ fontWeight: 800, fontSize: 22 }}>{quiz.title.trim()[0]?.toUpperCase() || '?'}</span>
                <span className="ds-spacer" />
                <button type="button" className="ds-icon-btn danger" title="Delete quiz" aria-label={`Delete ${quiz.title}`}
                  onClick={() => handleDeleteQuiz(quiz.id, quiz.title)}>🗑️</button>
              </div>
              <Link to={`/quizzes/${quiz.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <h3 style={{ fontSize: 18 }}>{quiz.title}</h3>
                <p style={{ minHeight: 20 }}>{quiz.description || <span className="ds-muted">No description</span>}</p>
              </Link>
              <div className="ds-row" style={{ marginTop: 'auto' }}>
                <span className={`ds-chip ${n ? 'accent' : ''}`}>{n} question{n === 1 ? '' : 's'}</span>
                <span className="ds-spacer" />
                <Link to={`/quizzes/${quiz.id}`} className="ds-btn ds-btn-sm">Open →</Link>
              </div>
            </div>
          );
        })}
      </div>

      {showAddModal && (
        <div className="ds-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }}>
          <form className="ds-modal" onSubmit={handleCreateQuiz}>
            <div className="ds-modal-header">
              <span className="ds-tile grad">📚</span>
              <div>
                <h2>New quiz</h2>
                <p>You can add questions — or generate them with AI — next.</p>
              </div>
              <button type="button" className="ds-close" onClick={() => setShowAddModal(false)} aria-label="Close">×</button>
            </div>
            <div className="ds-modal-body">
              <label className="ds-field">
                <span className="ds-label">Quiz title</span>
                <input className="ds-input" type="text" value={newQuizTitle} onChange={(e) => setNewQuizTitle(e.target.value)}
                  placeholder="e.g. Science Champions 2026" autoFocus required />
              </label>
              <label className="ds-field" style={{ marginBottom: 0 }}>
                <span className="ds-label">Description <span className="ds-muted">(optional)</span></span>
                <input className="ds-input" type="text" value={newQuizDesc} onChange={(e) => setNewQuizDesc(e.target.value)}
                  placeholder="e.g. Inter-house quiz for class 8" />
              </label>
            </div>
            <div className="ds-modal-footer">
              <button type="button" onClick={() => setShowAddModal(false)} className="ds-btn ds-btn-ghost">Cancel</button>
              <button type="submit" className="ds-btn ds-btn-primary" disabled={creating || !newQuizTitle.trim()}>
                {creating ? 'Creating…' : 'Create quiz'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default QuizList;
