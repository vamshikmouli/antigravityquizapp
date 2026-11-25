import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import QuestionForm from './QuestionForm';
import AIGenerateModal from './AIGenerateModal';
import CompetitionSetup from './CompetitionSetup';
import { useParams, Link } from 'react-router-dom';
import { QUESTION_TYPES, typeInfo, LETTERS } from '../lib/questionTypes';
import Icon from './common/Icon';

function QuestionsPage() {
  const { quizId } = useParams();
  const { token } = useAuth();
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [selectedRound, setSelectedRound] = useState('All');
  const [selectedType, setSelectedType] = useState('All');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Import from Quiz State
  const [showImportModal, setShowImportModal] = useState(false);
  const [availableQuizzes, setAvailableQuizzes] = useState([]);
  const [selectedSourceQuiz, setSelectedSourceQuiz] = useState(null);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [showKebabMenu, setShowKebabMenu] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const kebabRef = useRef(null);

  const fetchQuizData = async () => {
    try {
      setLoading(true);
      // Fetch Quiz details
      const quizRes = await fetch(`/api/quizzes/${quizId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const quizData = await quizRes.json();
      setQuiz(quizData);
      
      // Fetch Questions for this Quiz
      const qRes = await fetch(`/api/questions?quizId=${quizId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const qData = await qRes.json();
      setQuestions(qData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableQuizzes = async () => {
    try {
      setLoadingQuizzes(true);
      const res = await fetch('/api/quizzes', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      // Filter out the current quiz
      setAvailableQuizzes(data.filter(q => q.id !== quizId));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingQuizzes(false);
    }
  };

  useEffect(() => {
    if (quizId && token) {
      fetchQuizData();
    }

    const handleClickOutside = (event) => {
      if (kebabRef.current && !kebabRef.current.contains(event.target)) {
        setShowKebabMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [quizId, token]);

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    
    try {
      await fetch(`/api/questions/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchQuizData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('quizId', quizId);

    try {
      setImporting(true);
      const res = await fetch('/api/questions/import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      const result = await res.json();
      
      if (res.ok) {
        alert(`Successfully imported ${result.count} questions!`);
        fetchQuizData();
      } else {
        alert(`Import failed: ${result.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during import.');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportFromQuiz = async () => {
    if (!selectedSourceQuiz) return;

    if (!confirm(`Import all questions from "${selectedSourceQuiz.title}"?`)) return;

    try {
      setImporting(true);
      const res = await fetch(`/api/quizzes/${quizId}/import-questions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sourceQuizId: selectedSourceQuiz.id })
      });

      const result = await res.json();

      if (res.ok) {
        alert(result.message);
        setShowImportModal(false);
        fetchQuizData();
      } else {
        alert(`Import failed: ${result.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('An error occurred during import.');
    } finally {
      setImporting(false);
    }
  };

  const rounds = [...new Set(questions.map((q) => q.round))].sort((a, b) => a - b);
  const typesPresent = QUESTION_TYPES.filter((t) => questions.some((q) => q.type === t.value));

  const filteredQuestions = questions
    .filter((q) => (selectedRound === 'All' || q.round === selectedRound) && (selectedType === 'All' || q.type === selectedType))
    .sort((a, b) => (a.round - b.round) || (new Date(a.createdAt) - new Date(b.createdAt)));
  const groups = [...new Set(filteredQuestions.map((q) => q.round))].map((r) => ({
    round: r,
    items: filteredQuestions.filter((q) => q.round === r)
  }));
  const totalPoints = questions.reduce((s, q) => s + (q.points || 0), 0);
  const openAdd = () => { setEditingQuestion(null); setShowForm(true); };
  const isTeams = quiz?.mode === 'TEAMS';
  const roundInfo = (r) => (Array.isArray(quiz?.roundSettings) ? quiz.roundSettings.find((x) => x.round === r) : null);
  const FORMAT_LABEL = { DIRECTED: 'Directed', ALL: 'Everyone answers', BUZZER: 'Buzzer', CLUE: 'Clue round' };

  return (
    <div className="ds-page">
      <header className="ds-topbar">
        <Link to="/quizzes" className="ds-back" aria-label="Back"><Icon name="arrow-left" size={18} /></Link>
        <div className="ds-topbar-title">
          <small>Quiz</small>
          <h1>{quiz?.title || 'Loading…'}</h1>
        </div>
        <div className="ds-topbar-actions">
          <button type="button" className={`ds-btn ds-hide-sm ${isTeams ? 'cs-on' : ''}`} onClick={() => setShowSetup(true)} title="Competition setup"><Icon name={isTeams ? 'users' : 'trophy'} /> {isTeams ? 'Groups' : 'Competition'}</button>
          <button type="button" className="ds-btn ds-hide-sm" onClick={openAdd}><Icon name="plus" /> Add question</button>
          <button type="button" className="ds-btn ds-btn-primary" onClick={() => setShowAIModal(true)}><Icon name="sparkles" /> <span className="ds-hide-sm">Generate with </span>AI</button>
          <div className="ds-menu-wrap" ref={kebabRef}>
            <button type="button" className="ds-icon-btn" aria-label="More Actions" title="More actions"
              style={{ border: '1px solid var(--ds-border-2)', width: 42, height: 42 }}
              onClick={() => setShowKebabMenu(!showKebabMenu)}><Icon name="more" size={18} /></button>
            {showKebabMenu && (
              <div className="ds-menu">
                <button type="button" onClick={() => { openAdd(); setShowKebabMenu(false); }}>
                  <span><Icon name="plus" /></span><div>Add question<small>Write one by hand</small></div>
                </button>
                <button type="button" onClick={() => { setShowAIModal(true); setShowKebabMenu(false); }}>
                  <span><Icon name="sparkles" /></span><div>Generate with AI<small>Plan rounds from a prompt</small></div>
                </button>
                <button type="button" onClick={() => { setShowSetup(true); setShowKebabMenu(false); }}>
                  <span><Icon name="trophy" /></span><div>Competition setup<small>Groups, round formats, elimination</small></div>
                </button>
                <button type="button" onClick={() => { fetchAvailableQuizzes(); setShowImportModal(true); setShowKebabMenu(false); }}>
                  <span><Icon name="link" /></span><div>Import from a quiz<small>Copy questions you already have</small></div>
                </button>
                <button type="button" disabled={importing} onClick={() => { fileInputRef.current?.click(); setShowKebabMenu(false); }}>
                  <span><Icon name="upload" /></span><div>{importing ? 'Importing…' : 'Bulk import'}<small>Excel or CSV file</small></div>
                </button>
                <a href="/templates/group_competition_template.xlsx" download onClick={() => setShowKebabMenu(false)}>
                  <span><Icon name="sheet" /></span><div>Group quiz template<small>5 rounds: general, visual, rapid fire, buzzer, clue</small></div>
                </a>
                <a href="/templates/sample_questions.xlsx" download onClick={() => setShowKebabMenu(false)}>
                  <span><Icon name="download" /></span><div>Download template<small>Sample spreadsheet</small></div>
                </a>
              </div>
            )}
          </div>
          <input type="file" ref={fileInputRef} onChange={handleImport} style={{ display: 'none' }} accept=".xlsx,.xls,.csv" />
        </div>
      </header>

      {!loading && questions.length > 0 && (
        <>
          <div className="ds-row" style={{ marginBottom: 12 }}>
            <span className="ds-chip accent">{questions.length} questions</span>
            <span className="ds-chip">{rounds.length} round{rounds.length === 1 ? '' : 's'}</span>
            <span className="ds-chip good">{totalPoints} points</span>
            {isTeams && <button type="button" className="ds-chip accent" style={{ border: 'none', cursor: 'pointer' }} onClick={() => setShowSetup(true)}><Icon name="users" /> Group competition</button>}
            {quiz?.description && <span className="ds-muted" style={{ marginLeft: 6 }}>{quiz.description}</span>}
          </div>
          <div className="ds-row" style={{ marginBottom: 22, gap: 12 }}>
            <div className="ds-tabs" role="tablist" aria-label="Filter by round">
              <button type="button" className={selectedRound === 'All' ? 'active' : ''} onClick={() => setSelectedRound('All')}>All rounds</button>
              {rounds.map((r) => (
                <button type="button" key={r} className={selectedRound === r ? 'active' : ''} onClick={() => setSelectedRound(r)}>Round {r}</button>
              ))}
            </div>
            {typesPresent.length > 1 && (
              <div className="ds-tabs" role="tablist" aria-label="Filter by type">
                <button type="button" className={selectedType === 'All' ? 'active' : ''} onClick={() => setSelectedType('All')}>All types</button>
                {typesPresent.map((t) => (
                  <button type="button" key={t.value} className={selectedType === t.value ? 'active' : ''} onClick={() => setSelectedType(t.value)}><Icon name={t.glyph} /> {t.short}</button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {loading && <div style={{ display: 'grid', gap: 10 }}>{[0, 1, 2, 3].map((k) => <div key={k} className="ds-skeleton" style={{ height: 84 }} />)}</div>}

      {!loading && questions.length === 0 && (
        <div className="ds-empty">
          <span className="ds-tile lg grad"><Icon name="sparkles" /></span>
          <h3>This quiz is empty</h3>
          <p>Describe the quiz you want and AI will plan the rounds and write the questions — or add them yourself.</p>
          <div className="ds-row" style={{ justifyContent: 'center' }}>
            <button type="button" className="ds-btn" onClick={openAdd}><Icon name="plus" /> Add question</button>
            <button type="button" className="ds-btn ds-btn-primary" onClick={() => setShowAIModal(true)}><Icon name="sparkles" /> Generate with AI</button>
          </div>
        </div>
      )}

      {!loading && questions.length > 0 && filteredQuestions.length === 0 && (
        <div className="ds-empty"><h3>No questions match these filters</h3>
          <button type="button" className="ds-link" onClick={() => { setSelectedRound('All'); setSelectedType('All'); }}>Show all</button></div>
      )}

      {groups.map((g) => (
        <section key={g.round} style={{ marginBottom: 22 }}>
          <div className="ds-section-title" style={{ marginTop: 6 }}>
            <h2>Round {g.round}{isTeams && roundInfo(g.round)?.name && roundInfo(g.round).name !== `Round ${g.round}` ? ` · ${roundInfo(g.round).name}` : ''}</h2>
            <span>{g.items.length} question{g.items.length === 1 ? '' : 's'} · {g.items.reduce((s, q) => s + (q.points || 0), 0)} pts</span>
            {isTeams && roundInfo(g.round) && (
              <span className="ds-row" style={{ gap: 6 }}>
                <span className="ds-chip accent">{FORMAT_LABEL[roundInfo(g.round).format] || roundInfo(g.round).format}</span>
                {roundInfo(g.round).format === 'DIRECTED' && <span className="ds-chip">{roundInfo(g.round).passOnWrong === false ? 'no pass' : `pass ${roundInfo(g.round).passPercent ?? 50}%`}</span>}
                {roundInfo(g.round).eliminate > 0 && <span className="ds-chip bad">eliminate {roundInfo(g.round).eliminate}</span>}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {g.items.map((q, i) => {
              const t = typeInfo(q.type);
              return (
                <div key={q.id} className={`ds-card q-row t-${q.type}`}>
                  {q.imageUrl
                    ? <img src={q.imageUrl} alt="" className="q-row-thumb" />
                    : <span className="ds-type-icon" title={t.label}><Icon name={t.glyph} /></span>}
                  <div className="q-row-main">
                    <div className="q-row-meta">
                      <span className="ds-chip type">{t.short}</span>
                      <span className="ds-chip" title="Time limit"><Icon name="clock" /> {q.timeLimit}s</span>
                      {q.readingTime > 0 && <span className="ds-chip" title="Reading time"><Icon name="book" /> {q.readingTime}s</span>}
                      <span className="ds-chip good">+{q.points}</span>
                      {q.negativePoints > 0 && <span className="ds-chip bad">−{q.negativePoints}</span>}
                      {q.category && <span className="ds-muted" style={{ fontSize: 12 }}>{q.category}</span>}
                    </div>
                    <h3 className="q-row-text"><span className="ds-muted">{i + 1}.</span> {q.text}</h3>
                    <div className="q-row-opts">
                      {q.type === 'CLUE' && q.clues?.length > 0
                        ? <>
                            {q.clues.map((c, ci) => <span key={ci} className="ds-chip"><b style={{ color: 'var(--ds-accent-text)' }}>{ci + 1}</b>&nbsp;{c}{q.cluePoints?.[ci] != null && <span className="ds-muted">&nbsp;· {q.cluePoints[ci]}</span>}</span>)}
                            <span className="ds-chip good"><Icon name="check" /> {q.correctAnswer}</span>
                          </>
                        : q.options?.length > 0
                        ? q.options.map((o, oi) => (
                            <span key={oi} className={`ds-opt o${oi % 4} ${o === q.correctAnswer ? 'correct' : ''}`}>
                              <i>{o === q.correctAnswer ? <Icon name="check" strokeWidth={3} /> : LETTERS[oi]}</i>{o}
                            </span>
                          ))
                        : q.correctAnswer && <span className="ds-chip good"><Icon name="check" /> {q.correctAnswer}</span>}
                    </div>
                  </div>
                  <div className="q-row-actions">
                    <button type="button" className="ds-icon-btn" title="Edit" aria-label="Edit question" onClick={() => { setEditingQuestion(q); setShowForm(true); }}><Icon name="pencil" size={16} /></button>
                    <button type="button" className="ds-icon-btn danger" title="Delete" aria-label="Delete question" onClick={() => handleDelete(q.id)}><Icon name="trash" size={16} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {showImportModal && (
        <div className="ds-overlay">
          <div className="ds-modal">
            <div className="ds-modal-header">
              <span className="ds-tile"><Icon name="link" /></span>
              <div>
                <h2>Import from another quiz</h2>
                <p>Copy every question from one of your quizzes into this one.</p>
              </div>
              <button type="button" className="ds-close" aria-label="Close" onClick={() => { setShowImportModal(false); setSelectedSourceQuiz(null); }}>×</button>
            </div>
            <div className="ds-modal-body" style={{ display: 'grid', gap: 10 }}>
              {loadingQuizzes && <div className="ds-skeleton" style={{ height: 64 }} />}
              {!loadingQuizzes && availableQuizzes.length === 0 && <p className="ds-muted" style={{ textAlign: 'center', padding: 30 }}>No other quizzes found.</p>}
              {!loadingQuizzes && availableQuizzes.map((qz) => (
                <button type="button" key={qz.id} onClick={() => setSelectedSourceQuiz(qz)}
                  className="ds-card" style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, font: 'inherit', color: 'inherit',
                    borderColor: selectedSourceQuiz?.id === qz.id ? 'var(--ds-accent)' : undefined,
                    background: selectedSourceQuiz?.id === qz.id ? 'var(--ds-accent-soft)' : undefined }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: 15 }}>{qz.title}</h3>
                    <p>{qz.description || 'No description'}</p>
                  </div>
                  <span className="ds-chip accent">{qz._count?.questions || 0} questions</span>
                </button>
              ))}
            </div>
            <div className="ds-modal-footer">
              <button type="button" className="ds-btn ds-btn-ghost" onClick={() => { setShowImportModal(false); setSelectedSourceQuiz(null); }}>Cancel</button>
              <button type="button" className="ds-btn ds-btn-primary" disabled={!selectedSourceQuiz || importing} onClick={handleImportFromQuiz}>
                {importing ? 'Importing…' : 'Import questions'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <QuestionForm
          onClose={() => setShowForm(false)}
          onSave={fetchQuizData}
          editingQuestion={editingQuestion}
          quizId={quizId}
          defaultRound={selectedRound === 'All' ? (rounds[rounds.length - 1] || 1) : selectedRound}
        />
      )}

      {showSetup && quiz && (
        <CompetitionSetup quiz={quiz} questions={questions} token={token}
          onClose={() => setShowSetup(false)}
          onSaved={(d) => setQuiz((prev) => ({ ...prev, mode: d.mode, roundSettings: d.roundSettings }))} />
      )}

      {showAIModal && (
        <AIGenerateModal
          quizId={quizId}
          startRound={questions.length ? Math.max(...questions.map((q) => Number(q.round) || 1)) + 1 : 1}
          onClose={() => setShowAIModal(false)}
          onSaved={fetchQuizData}
        />
      )}
    </div>
  );
}

export default QuestionsPage;
