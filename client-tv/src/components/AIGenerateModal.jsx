import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import AIQuizPlanner, { QUESTION_TYPES as TYPES } from './AIQuizPlanner';
const DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * Generate quiz questions with an AI provider (Gemini/Groq/…), review them, and
 * save the selected ones into the current quiz. Questions are NOT saved until
 * the teacher clicks "Save selected".
 */
export default function AIGenerateModal({ quizId, startRound = 1, onClose, onSaved }) {
  const { token } = useAuth();
  const authHeader = { Authorization: `Bearer ${token}` };

  const [mode, setMode] = useState('plan'); // plan (whole quiz from a prompt) | quick
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState('');
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [type, setType] = useState('MULTIPLE_CHOICE');
  const [difficulty, setDifficulty] = useState('medium');

  const [loadingProviders, setLoadingProviders] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState([]); // [{ ...question, _include }]

  useEffect(() => {
    let cancelled = false;
    fetch('/api/ai/providers', { headers: authHeader })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setProviders(data.providers || []);
        setProvider(data.default || (data.providers?.[0]?.id ?? ''));
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadingProviders(false));
    return () => { cancelled = true; };
  }, []);

  const handleGenerate = async () => {
    setError('');
    if (!topic.trim()) { setError('Please enter a topic.'); return; }
    setGenerating(true);
    setDrafts([]);
    try {
      const res = await fetch('/api/questions/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ topic, count: Number(count), type, difficulty, provider })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setDrafts((data.questions || []).map((q) => ({ ...q, _include: true })));
      if (!data.questions || data.questions.length === 0) setError('No questions returned. Try again.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const toggle = (i) =>
    setDrafts((d) => d.map((q, idx) => (idx === i ? { ...q, _include: !q._include } : q)));

  const selected = drafts.filter((q) => q._include);

  const handleSave = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    setError('');
    try {
      const questions = selected.map(({ _include, ...q }) => ({ ...q, quizId }));
      const res = await fetch('/api/questions/import-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ questions })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const noProviders = !loadingProviders && providers.length === 0;

  return (
    <div className="modal-overlay">
      <div className="modal-content question-form-modal">
        <div className="modal-header">
          <h2>✨ Generate with AI</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modern-form">
          {noProviders ? (
            <p style={{ color: 'var(--text-muted)' }}>
              No AI provider is configured. Set <code>GROQ_API_KEY</code> or <code>GEMINI_API_KEY</code>
              {' '}on the server and restart to enable AI generation.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '14px' }}>
                {[['plan', '🧠 Plan whole quiz'], ['quick', '⚡ Quick questions']].map(([m, label]) => (
                  <button key={m} type="button" onClick={() => setMode(m)}
                    className={mode === m ? 'primary-btn' : 'cancel-btn'}
                    style={{ padding: '6px 14px' }}>
                    {label}
                  </button>
                ))}
                {providers.length > 1 && (
                  <div className="form-group" style={{ marginLeft: 'auto', marginBottom: 0, minWidth: '120px' }}>
                    <label style={{ fontSize: '12px' }}>Provider</label>
                    <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                      {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </>
          )}

          {!noProviders && !loadingProviders && mode === 'plan' && (
            <AIQuizPlanner
              quizId={quizId}
              startRound={startRound}
              provider={provider}
              authHeader={authHeader}
              onSaved={onSaved}
              onClose={onClose}
            />
          )}

          {!noProviders && mode === 'quick' && (
            <>
              <div className="form-group">
                <label>Topic</label>
                <input
                  type="text"
                  value={topic}
                  placeholder="e.g. Photosynthesis, World War II, Fractions"
                  onChange={(e) => setTopic(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '1 1 120px' }}>
                  <label>How many</label>
                  <input type="number" min="1" max="20" value={count}
                    onChange={(e) => setCount(e.target.value)} />
                </div>
                <div className="form-group" style={{ flex: '1 1 160px' }}>
                  <label>Type</label>
                  <select value={type} onChange={(e) => setType(e.target.value)}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '1 1 120px' }}>
                  <label>Difficulty</label>
                  <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                    {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <button className="primary-btn" onClick={handleGenerate} disabled={generating}>
                {generating ? 'Generating…' : '✨ Generate'}
              </button>

              {drafts.length > 0 && (
                <div className="ai-drafts" style={{ marginTop: '18px' }}>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '10px' }}>
                    Review and pick the ones to add ({selected.length}/{drafts.length} selected):
                  </p>
                  {drafts.map((q, i) => (
                    <label key={i} className="ai-draft-item"
                      style={{ display: 'flex', gap: '10px', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', marginBottom: '8px', cursor: 'pointer', background: q._include ? 'rgba(124,92,255,0.08)' : 'transparent' }}>
                      <input type="checkbox" checked={q._include} onChange={() => toggle(i)} style={{ marginTop: '4px' }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{q.text}</div>
                        {q.options?.length > 0 && (
                          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {q.options.map((o) => (
                              <span key={o} style={{ marginRight: '10px', color: o === q.correctAnswer ? '#4ade80' : undefined }}>
                                {o === q.correctAnswer ? '✓ ' : ''}{o}
                              </span>
                            ))}
                          </div>
                        )}
                        {(!q.options || q.options.length === 0) && (
                          <div style={{ fontSize: '13px', color: '#4ade80', marginTop: '4px' }}>Answer: {q.correctAnswer}</div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          {mode === 'quick' && error && <div className="error-message" style={{ marginTop: '12px' }}>{error}</div>}

          {(mode === 'quick' || noProviders) && (
            <div className="modal-actions">
              <button className="cancel-btn" onClick={onClose}>Cancel</button>
              {drafts.length > 0 && (
                <button className="save-btn" disabled={saving || selected.length === 0} onClick={handleSave}>
                  {saving ? 'Saving…' : `Save selected (${selected.length})`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
