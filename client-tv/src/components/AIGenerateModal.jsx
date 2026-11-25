import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import AIQuizPlanner, { QUESTION_TYPES as TYPES, TYPE_INFO, QuestionItem } from './AIQuizPlanner';
import './AIGenerate.css';

const DIFFICULTIES = ['easy', 'medium', 'hard'];

/** Quick mode: N questions of one type on one topic. */
function QuickGenerate({ quizId, provider, authHeader, onSaved, onClose }) {
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [type, setType] = useState('MULTIPLE_CHOICE');
  const [difficulty, setDifficulty] = useState('medium');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState([]); // [{ ...question, _include }]

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

  const toggle = (i) => setDrafts((d) => d.map((q, idx) => (idx === i ? { ...q, _include: !q._include } : q)));
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

  return (
    <>
      <div className="ai-body">
        <div className="ai-quick-grid">
          <div>
            <label className="ai-label" htmlFor="ai-topic">Topic</label>
            <input id="ai-topic" type="text" value={topic} autoFocus
              placeholder="e.g. Photosynthesis, World War II, Fractions"
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }} />
          </div>
          <div>
            <label className="ai-label">How many</label>
            <input type="number" min="1" max="20" value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <div>
            <label className="ai-label">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="ai-label">Difficulty</label>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
            </select>
          </div>
        </div>

        {(generating || drafts.length > 0) && (
          <section className={`ai-review-round t-${type}`}>
            <div className="ai-review-head">
              <span className="ai-type-icon">{TYPE_INFO[type]?.icon}</span>
              <div className="ai-review-title">
                <small>{TYPE_INFO[type]?.label} · {difficulty}</small>
                <strong>{topic || 'Questions'}</strong>
              </div>
              <div className="ai-review-status">
                {generating ? <><span className="ai-spinner dim" /> Writing questions…</> : <span>{selected.length} of {drafts.length} selected</span>}
              </div>
            </div>
            {generating && <div className="ai-skeleton">{Array.from({ length: Math.min(Number(count) || 3, 4) }, (_, k) => <div key={k} />)}</div>}
            {!generating && (
              <div className="ai-q-list">
                {drafts.map((q, i) => <QuestionItem key={i} q={q} index={i} onToggle={() => toggle(i)} />)}
              </div>
            )}
          </section>
        )}

        {error && <div className="ai-error">⚠️ {error}</div>}
      </div>

      <div className="ai-footer">
        <button type="button" className="ai-btn ai-btn-ghost" onClick={onClose}>Cancel</button>
        <span className="ai-footer-info">Default time and points; edit them after saving.</span>
        {drafts.length > 0 && (
          <button type="button" className="ai-btn" onClick={handleGenerate} disabled={generating || saving}>↻ Regenerate</button>
        )}
        {drafts.length > 0 ? (
          <button type="button" className="ai-btn ai-btn-primary" disabled={saving || selected.length === 0} onClick={handleSave}>
            {saving ? 'Saving…' : `Save ${selected.length} questions`}
          </button>
        ) : (
          <button type="button" className="ai-btn ai-btn-primary" onClick={handleGenerate} disabled={generating || !topic.trim()}>
            {generating ? 'Generating…' : '✨ Generate'}
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Generate quiz content with an AI provider (Gemini/Groq/…).
 *  - Plan whole quiz: one prompt -> rounds, types, timing, points -> questions.
 *  - Quick questions: N questions of one type on one topic.
 * Nothing is saved until the teacher confirms.
 */
export default function AIGenerateModal({ quizId, startRound = 1, onClose, onSaved }) {
  const { token } = useAuth();
  const authHeader = { Authorization: `Bearer ${token}` };

  const [mode, setMode] = useState('plan');
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState('');
  const [loadingProviders, setLoadingProviders] = useState(true);

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

  const noProviders = !loadingProviders && providers.length === 0;
  const shared = { quizId, provider, authHeader, onSaved, onClose };

  return (
    <div className="modal-overlay">
      <div className="ai-modal" role="dialog" aria-modal="true" aria-label="Generate with AI">
        <div className="ai-header">
          <div className="ai-brand">
            <span className="ai-brand-icon">✨</span>
            <div>
              <h2 className="ai-title">Generate with AI</h2>
              <p className="ai-subtitle">Describe a quiz — get rounds and questions in seconds</p>
            </div>
          </div>
          {!noProviders && (
            <div className="ai-segment" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'plan'} className={mode === 'plan' ? 'active' : ''}
                onClick={() => setMode('plan')}>🧠 Plan whole quiz</button>
              <button type="button" role="tab" aria-selected={mode === 'quick'} className={mode === 'quick' ? 'active' : ''}
                onClick={() => setMode('quick')}>⚡ Quick questions</button>
            </div>
          )}
          <span className="ai-header-spacer" />
          {providers.length > 0 && (
            <label className="ai-provider" title="AI provider">
              <span className="ai-dot" />
              <span className="ai-provider-label">AI</span>
              {providers.length > 1 ? (
                <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                  {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              ) : <span style={{ paddingRight: 10, color: 'var(--ai-text)' }}>{providers[0].label}</span>}
            </label>
          )}
          <button type="button" className="ai-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {loadingProviders && <div className="ai-body"><div className="ai-round-msg"><span className="ai-spinner" /> Loading…</div></div>}

        {noProviders && (
          <>
            <div className="ai-body ai-empty">
              No AI provider is configured. Set <code>GROQ_API_KEY</code> or <code>GEMINI_API_KEY</code> on the
              server and restart to enable AI generation.
            </div>
            <div className="ai-footer"><span className="ai-footer-info" /><button type="button" className="ai-btn" onClick={onClose}>Close</button></div>
          </>
        )}

        {/* Both stay mounted so switching tabs never loses work in progress. */}
        {!loadingProviders && !noProviders && (
          <>
            <div style={{ display: mode === 'plan' ? 'contents' : 'none' }}>
              <AIQuizPlanner {...shared} startRound={startRound} />
            </div>
            <div style={{ display: mode === 'quick' ? 'contents' : 'none' }}>
              <QuickGenerate {...shared} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
