import Icon from './common/Icon';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const ACTIONS = [
  {
    to: '/create-session', icon: <Icon name="play" />, color: '#34d399', title: 'Launch a quiz',
    text: 'Pick a quiz and put it on the big screen. Students join from their phones with a code.', cta: 'Start a session'
  },
  {
    to: '/quizzes', icon: <Icon name="book" />, color: '#818cf8', title: 'Quizzes & questions',
    text: 'Create quizzes, add rounds and questions by hand or let AI plan a whole quiz for you.', cta: 'Manage quizzes'
  },
  {
    to: '/music-settings', icon: <Icon name="music" />, color: '#f472b6', title: 'Music & sound',
    text: 'Upload background tracks for questions, answers and the results screens.', cta: 'Manage music'
  }
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function HostDashboard() {
  const { user, token, logout } = useAuth();
  const [quizzes, setQuizzes] = useState(null);

  useEffect(() => {
    fetch('/api/quizzes', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setQuizzes(Array.isArray(d) ? d : []))
      .catch(() => setQuizzes([]));
  }, [token]);

  const name = user?.name || user?.email?.split('@')[0] || 'there';
  const first = name.split(' ')[0];
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const totalQuestions = (quizzes || []).reduce((s, q) => s + (q._count?.questions || 0), 0);
  const recent = (quizzes || []).slice(0, 4);

  return (
    <div className="ds-page">
      <header className="ds-topbar">
        <span className="ds-brand-icon"><Icon name="sparkles" /></span>
        <div className="ds-topbar-title">
          <small>Quiz host</small>
          <h1>Dashboard</h1>
        </div>
        <div className="ds-topbar-actions">
          <div className="ds-row ds-hide-sm" style={{ gap: 10 }}>
            <span className="ds-avatar">{initials}</span>
            <div style={{ display: 'grid', lineHeight: 1.25 }}>
              <strong style={{ fontSize: 13.5 }}>{name}</strong>
              <span className="ds-muted" style={{ fontSize: 12 }}>{user?.email}</span>
            </div>
          </div>
          <button type="button" onClick={logout} className="ds-btn ds-btn-ghost ds-btn-sm"><Icon name="logout" /> Log out</button>
        </div>
      </header>

      <section className="ds-hero">
        <div className="ds-kicker">{greeting()}</div>
        <h1>Hi {first}, ready to <span className="ds-grad-text">run a quiz?</span></h1>
        <p>Build quizzes in minutes with AI, launch them on the big screen and let students play from their phones.</p>
        <div className="ds-stats">
          <div className="ds-stat"><b>{quizzes ? quizzes.length : '–'}</b><small>Quizzes</small></div>
          <div className="ds-stat"><b>{quizzes ? totalQuestions : '–'}</b><small>Questions</small></div>
          <div className="ds-row" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            <Link to="/quizzes" className="ds-btn">＋ New quiz</Link>
            <Link to="/create-session" className="ds-btn ds-btn-primary"><Icon name="play" /> Launch a quiz</Link>
          </div>
        </div>
      </section>

      <div className="ds-grid cols-3">
        {ACTIONS.map((a) => (
          <Link key={a.to} to={a.to} className="ds-card ds-action-card" style={{ '--c': a.color }}>
            <span className="ds-tile lg">{a.icon}</span>
            <div>
              <h3>{a.title}</h3>
              <p>{a.text}</p>
            </div>
            <span className="ds-arrow">{a.cta} <span>→</span></span>
          </Link>
        ))}
      </div>

      <div className="ds-section-title">
        <h2>Recent quizzes</h2>
        <span>{quizzes?.length ? `${quizzes.length} total` : ''}</span>
        <Link to="/quizzes" className="ds-link">View all →</Link>
      </div>

      {quizzes === null && (
        <div className="ds-grid">{[0, 1, 2].map((k) => <div key={k} className="ds-skeleton" style={{ height: 92 }} />)}</div>
      )}
      {quizzes?.length === 0 && (
        <div className="ds-empty">
          <span className="ds-tile lg grad"><Icon name="sparkles" /></span>
          <h3>No quizzes yet</h3>
          <p>Create your first quiz — describe it in one sentence and let AI build the rounds.</p>
          <Link to="/quizzes" className="ds-btn ds-btn-primary">Create a quiz</Link>
        </div>
      )}
      {recent.length > 0 && (
        <div className="ds-grid">
          {recent.map((q, i) => (
            <Link key={q.id} to={`/quizzes/${q.id}`} className="ds-card" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <span className="ds-tile" style={{ '--c': ['#818cf8', '#f472b6', '#34d399', '#fbbf24'][i % 4] }}>{q.title.trim()[0]?.toUpperCase() || '?'}</span>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ fontSize: 15.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{q.title}</h3>
                <p>{q._count?.questions || 0} questions</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default HostDashboard;
