import { useState } from 'react';

export const QUESTION_TYPES = [
  { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
  { value: 'TRUE_FALSE', label: 'True / False' },
  { value: 'BUZZER', label: 'Buzzer (with options)' },
  { value: 'ORAL_BUZZER', label: 'Oral Buzzer' },
  { value: 'SHORT_ANSWER', label: 'Short Answer' },
  { value: 'ORAL_OPEN', label: 'Oral Open' }
];
const TYPE_LABEL = Object.fromEntries(QUESTION_TYPES.map((t) => [t.value, t.label]));
const DIFFICULTIES = ['easy', 'medium', 'hard'];

const EXAMPLES = [
  'Science quiz for class 8 with 3 rounds: 5 MCQs on physics (20 s, 10 points), a buzzer round on chemistry with 4 questions (3 s reading time, +20 / −10), and 6 true/false on biology.',
  'General knowledge quiz for college students, 4 rounds, 5 questions each, mixed types, hardest round last with negative marking.',
  'Fun maths quiz for grade 5: rapid-fire buzzer on times tables, then short-answer word problems, 1 minute each, no negative marking.'
];

const card = { border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '12px 14px', marginBottom: '10px' };
const muted = { color: 'var(--text-muted)', fontSize: '13px' };
const chip = { display: 'inline-block', fontSize: '12px', padding: '2px 8px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', marginRight: '6px', marginTop: '4px' };

function NumField({ label, value, onChange, min = 0, max, suffix }) {
  return (
    <div className="form-group" style={{ flex: '1 1 90px', marginBottom: 0 }}>
      <label style={{ fontSize: '12px' }}>{label}{suffix ? ` (${suffix})` : ''}</label>
      <input type="number" min={min} max={max} value={value}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
    </div>
  );
}

/**
 * Whole-quiz generation from ONE free-text prompt:
 *   1. prompt  -> POST /api/ai/plan  (AI understands rounds/types/time/points)
 *   2. plan    -> teacher reviews/edits every round's settings
 *   3. generate each round via POST /api/questions/generate (plan settings applied)
 *   4. review drafts -> save selected via the normal import flow.
 */
export default function AIQuizPlanner({ quizId, startRound = 1, provider, authHeader, onSaved, onClose }) {
  const [step, setStep] = useState('prompt'); // prompt | plan | review
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState(null);
  const [firstRound, setFirstRound] = useState(startRound);
  const [roundState, setRoundState] = useState({}); // idx -> { status, error, questions }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const post = async (url, body) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ ...body, provider })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };

  // ---- 1. understand the prompt -------------------------------------------
  const understand = async () => {
    setError('');
    if (!prompt.trim()) { setError('Describe the quiz you want.'); return; }
    setBusy(true);
    try {
      const data = await post('/api/ai/plan', { prompt });
      setPlan(data.plan);
      setRoundState({});
      setStep('plan');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- 2. edit the plan ---------------------------------------------------
  const updateRound = (i, patch) =>
    setPlan((p) => ({ ...p, rounds: p.rounds.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  const removeRound = (i) => setPlan((p) => ({ ...p, rounds: p.rounds.filter((_, idx) => idx !== i) }));
  const addRound = () =>
    setPlan((p) => ({
      ...p,
      rounds: [...p.rounds, {
        name: `Round ${p.rounds.length + 1}`, topic: p.topic || '', type: 'MULTIPLE_CHOICE', count: 5,
        difficulty: 'medium', timeLimit: 30, readingTime: 0, points: 100, negativePoints: 0
      }]
    }));

  // ---- 3. generate every round (sequentially: kind to free-tier rate limits)
  const generateRound = async (i, avoid) => {
    const r = plan.rounds[i];
    setRoundState((s) => ({ ...s, [i]: { status: 'working' } }));
    try {
      const data = await post('/api/questions/generate', {
        topic: r.topic || plan.topic,
        count: Number(r.count) || 5,
        type: r.type,
        difficulty: r.difficulty,
        context: `Quiz "${plan.title}"${plan.audience ? ` for ${plan.audience}` : ''}, round "${r.name}"`,
        avoid,
        settings: {
          round: Number(firstRound) + i,
          timeLimit: Number(r.timeLimit),
          readingTime: Number(r.readingTime),
          points: Number(r.points),
          negativePoints: Number(r.negativePoints)
        }
      });
      const questions = (data.questions || []).map((q) => ({ ...q, _include: true }));
      setRoundState((s) => ({ ...s, [i]: { status: 'done', questions } }));
      return questions;
    } catch (err) {
      setRoundState((s) => ({ ...s, [i]: { status: 'error', error: err.message } }));
      return [];
    }
  };

  const generateAll = async () => {
    setError('');
    setBusy(true);
    setStep('review');
    setRoundState({});
    const avoid = [];
    for (let i = 0; i < plan.rounds.length; i++) {
      const qs = await generateRound(i, avoid.slice(-40));
      avoid.push(...qs.map((q) => q.text));
    }
    setBusy(false);
  };

  const retryRound = async (i) => {
    setBusy(true);
    const avoid = Object.values(roundState).flatMap((s) => (s.questions || []).map((q) => q.text));
    await generateRound(i, avoid.slice(-40));
    setBusy(false);
  };

  // ---- 4. review + save ---------------------------------------------------
  const toggle = (i, qi) =>
    setRoundState((s) => ({
      ...s,
      [i]: { ...s[i], questions: s[i].questions.map((q, idx) => (idx === qi ? { ...q, _include: !q._include } : q)) }
    }));

  const selected = plan
    ? plan.rounds.flatMap((_, i) => (roundState[i]?.questions || []).filter((q) => q._include))
    : [];

  const save = async () => {
    if (!selected.length) return;
    setBusy(true);
    setError('');
    try {
      const questions = selected.map(({ _include, ...q }) => ({ ...q, quizId }));
      await post('/api/questions/import-json', { questions });
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const total = plan ? plan.rounds.reduce((s, r) => s + (Number(r.count) || 0), 0) : 0;

  return (
    <>
      {step === 'prompt' && (
        <>
          <div className="form-group">
            <label>Describe your quiz</label>
            <textarea
              rows={6}
              value={prompt}
              maxLength={4000}
              placeholder="How many rounds, what each round is about, question types, time limits, reading time, points, negative marking… Anything you leave out, the AI decides."
              onChange={(e) => setPrompt(e.target.value)}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <div style={muted}>Try an example:</div>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setPrompt(ex)}
                style={{ ...chip, border: 'none', cursor: 'pointer', textAlign: 'left', color: 'inherit', padding: '6px 10px', borderRadius: '10px', display: 'block', marginTop: '6px' }}>
                {ex}
              </button>
            ))}
          </div>
          <button className="primary-btn" onClick={understand} disabled={busy}>
            {busy ? 'Reading your request…' : '🧠 Plan my quiz'}
          </button>
        </>
      )}

      {step === 'plan' && plan && (
        <>
          <div style={{ ...card, background: 'rgba(124,92,255,0.08)' }}>
            <div style={{ fontWeight: 700, fontSize: '18px' }}>{plan.title}</div>
            <div style={muted}>
              {plan.rounds.length} round{plan.rounds.length === 1 ? '' : 's'} · {total} questions
              {plan.audience ? ` · ${plan.audience}` : ''}
            </div>
            {plan.assumptions?.length > 0 && (
              <div style={{ ...muted, marginTop: '8px' }}>
                <strong>The AI decided:</strong>
                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                  {plan.assumptions.map((a) => <li key={a}>{a}</li>)}
                </ul>
              </div>
            )}
            {plan.warnings?.length > 0 && (
              <div style={{ marginTop: '8px', fontSize: '13px', color: '#fbbf24' }}>
                {plan.warnings.map((w) => <div key={w}>⚠️ {w}</div>)}
              </div>
            )}
          </div>

          <p style={muted}>Check each round and change anything before generating.</p>

          {plan.rounds.map((r, i) => (
            <div key={i} style={card}>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ whiteSpace: 'nowrap' }}>Round {Number(firstRound) + i}</strong>
                <input type="text" value={r.name} onChange={(e) => updateRound(i, { name: e.target.value })}
                  style={{ flex: 1 }} aria-label="Round name" />
                {plan.rounds.length > 1 && (
                  <button type="button" className="cancel-btn" onClick={() => removeRound(i)} title="Remove round"
                    style={{ padding: '4px 10px' }}>✕</button>
                )}
              </div>
              <div className="form-group" style={{ marginBottom: '8px' }}>
                <label style={{ fontSize: '12px' }}>Topic</label>
                <input type="text" value={r.topic} onChange={(e) => updateRound(i, { topic: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: '2 1 160px', marginBottom: 0 }}>
                  <label style={{ fontSize: '12px' }}>Type</label>
                  <select value={r.type} onChange={(e) => updateRound(i, { type: e.target.value })}>
                    {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ flex: '1 1 100px', marginBottom: 0 }}>
                  <label style={{ fontSize: '12px' }}>Difficulty</label>
                  <select value={r.difficulty} onChange={(e) => updateRound(i, { difficulty: e.target.value })}>
                    {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <NumField label="Questions" min={1} max={20} value={r.count} onChange={(v) => updateRound(i, { count: v })} />
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
                <NumField label="Time limit" suffix="s" min={5} max={600} value={r.timeLimit} onChange={(v) => updateRound(i, { timeLimit: v })} />
                <NumField label="Reading" suffix="s" min={0} max={60} value={r.readingTime} onChange={(v) => updateRound(i, { readingTime: v })} />
                <NumField label="Points" min={0} value={r.points} onChange={(v) => updateRound(i, { points: v })} />
                <NumField label="Negative" min={0} value={r.negativePoints} onChange={(v) => updateRound(i, { negativePoints: v })} />
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <button type="button" className="cancel-btn" onClick={addRound} disabled={plan.rounds.length >= 10}>＋ Add round</button>
            <button type="button" className="cancel-btn" onClick={() => setStep('prompt')}>← Change request</button>
            <div className="form-group" style={{ flex: '0 0 130px', marginBottom: 0 }}>
              <label style={{ fontSize: '12px' }}>First round no.</label>
              <input type="number" min={1} value={firstRound} onChange={(e) => setFirstRound(Math.max(1, Number(e.target.value) || 1))} />
            </div>
          </div>

          <button className="primary-btn" style={{ marginTop: '14px' }} onClick={generateAll}
            disabled={busy || !plan.rounds.length || total < 1 || total > 60}>
            ✨ Generate {total} questions
          </button>
          {total > 60 && <div style={{ ...muted, color: '#fbbf24' }}>Max 60 questions per generation.</div>}
        </>
      )}

      {step === 'review' && plan && (
        <>
          {plan.rounds.map((r, i) => {
            const st = roundState[i] || { status: 'pending' };
            return (
              <div key={i} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'baseline' }}>
                  <strong>Round {Number(firstRound) + i}: {r.name}</strong>
                  <span style={muted}>
                    {st.status === 'pending' && 'Waiting…'}
                    {st.status === 'working' && 'Generating…'}
                    {st.status === 'done' && `${st.questions.length}/${r.count} ready`}
                    {st.status === 'error' && '❌ Failed'}
                  </span>
                </div>
                <div>
                  <span style={chip}>{TYPE_LABEL[r.type] || r.type}</span>
                  <span style={chip}>⏱ {r.timeLimit}s</span>
                  {Number(r.readingTime) > 0 && <span style={chip}>📖 {r.readingTime}s reading</span>}
                  <span style={chip}>+{r.points}</span>
                  <span style={chip}>−{r.negativePoints}</span>
                  <span style={chip}>{r.difficulty}</span>
                </div>
                {st.status === 'error' && (
                  <div style={{ marginTop: '8px', fontSize: '13px' }}>
                    <span style={{ color: '#f87171' }}>{st.error}</span>{' '}
                    <button type="button" className="cancel-btn" disabled={busy} onClick={() => retryRound(i)} style={{ padding: '2px 10px' }}>Retry</button>
                  </div>
                )}
                {(st.questions || []).map((q, qi) => (
                  <label key={qi} style={{ display: 'flex', gap: '10px', padding: '8px 4px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '8px', cursor: 'pointer', opacity: q._include ? 1 : 0.5 }}>
                    <input type="checkbox" checked={q._include} onChange={() => toggle(i, qi)} style={{ marginTop: '4px' }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{q.text}</div>
                      {q.options?.length > 0 ? (
                        <div style={{ ...muted, marginTop: '4px' }}>
                          {q.options.map((o) => (
                            <span key={o} style={{ marginRight: '10px', color: o === q.correctAnswer ? '#4ade80' : undefined }}>
                              {o === q.correctAnswer ? '✓ ' : ''}{o}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: '13px', color: '#4ade80', marginTop: '4px' }}>Answer: {q.correctAnswer}</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            );
          })}
          <button type="button" className="cancel-btn" disabled={busy} onClick={() => setStep('plan')}>← Back to plan</button>
        </>
      )}

      {error && <div className="error-message" style={{ marginTop: '12px' }}>{error}</div>}

      {step === 'review' && (
        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="save-btn" disabled={busy || selected.length === 0} onClick={save}>
            {busy ? 'Working…' : `Save ${selected.length} questions`}
          </button>
        </div>
      )}
    </>
  );
}
