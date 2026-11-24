import { useState } from 'react';

export const QUESTION_TYPES = [
  { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
  { value: 'TRUE_FALSE', label: 'True / False' },
  { value: 'BUZZER', label: 'Buzzer (options)' },
  { value: 'ORAL_BUZZER', label: 'Oral Buzzer' },
  { value: 'SHORT_ANSWER', label: 'Short Answer' },
  { value: 'ORAL_OPEN', label: 'Oral Open' }
];
const TYPE_LABEL = Object.fromEntries(QUESTION_TYPES.map((t) => [t.value, t.label]));
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const MAX_TOTAL = 60;

const EXAMPLES = [
  {
    title: 'Science · class 8 · 3 rounds',
    text: 'Science quiz for class 8 with 3 rounds: 5 MCQs on physics (20 s, 10 points), a buzzer round on chemistry with 4 questions (3 s reading time, +20 / −10), and 6 true/false on biology.'
  },
  {
    title: 'General knowledge · college',
    text: 'General knowledge quiz for college students, 4 rounds, 5 questions each, mixed types, hardest round last with negative marking.'
  },
  {
    title: 'Maths · grade 5 · no negatives',
    text: 'Fun maths quiz for grade 5: rapid-fire buzzer on times tables, then short-answer word problems, 1 minute each, no negative marking.'
  }
];

const TIPS = [
  ['🔢', 'How many rounds and questions'],
  ['🧩', 'Question type per round (MCQ, true/false, buzzer, oral, short answer)'],
  ['⏱', 'Time limit and reading time'],
  ['🏆', 'Points, and minus points for wrong answers'],
  ['🎓', 'Class / audience and difficulty']
];

const STEPS = ['Describe', 'Review plan', 'Review questions'];

function Stepper({ step }) {
  const idx = { prompt: 0, plan: 1, review: 2 }[step];
  return (
    <div className="ai-stepper">
      {STEPS.map((label, i) => (
        <div key={label} className={`ai-step ${i === idx ? 'active' : i < idx ? 'done' : ''}`}>
          <span className="ai-step-num">{i < idx ? '✓' : i + 1}</span>
          <span className="ai-step-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

function Num({ label, value, onChange, min = 0, max, className }) {
  return (
    <div className={className}>
      <span className="ai-cell-label">{label}</span>
      <input type="number" min={min} max={max} value={value} aria-label={label}
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
 * Renders the modal's stepper, scrollable body and footer.
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
      body: JSON.stringify(body)
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
      const data = await post('/api/ai/plan', { prompt, provider });
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
        provider,
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
  const setAll = (i, on) =>
    setRoundState((s) => ({ ...s, [i]: { ...s[i], questions: s[i].questions.map((q) => ({ ...q, _include: on })) } }));

  const allQuestions = plan ? plan.rounds.flatMap((_, i) => roundState[i]?.questions || []) : [];
  const selected = allQuestions.filter((q) => q._include);

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
  const maxScore = plan ? plan.rounds.reduce((s, r) => s + (Number(r.count) || 0) * (Number(r.points) || 0), 0) : 0;
  const finished = plan ? plan.rounds.filter((_, i) => ['done', 'error'].includes(roundState[i]?.status)).length : 0;

  return (
    <>
      <Stepper step={step} />

      <div className="ai-body">
        {/* ---------------- 1. Describe ---------------- */}
        {step === 'prompt' && (
          <div className="ai-describe">
            <div>
              <label className="ai-label" htmlFor="ai-prompt">Describe your quiz in your own words</label>
              <textarea
                id="ai-prompt"
                value={prompt}
                maxLength={4000}
                autoFocus
                placeholder={'e.g. Science quiz for class 8 with 3 rounds. Round 1: 5 MCQs on physics, 20 seconds, 10 points…\n\nAnything you leave out, the AI decides.'}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) understand(); }}
              />
              <div className="ai-count">{prompt.length} / 4000 · Ctrl+Enter to plan</div>
            </div>
            <div className="ai-side">
              <h4>You can mention</h4>
              <ul className="ai-tips">
                {TIPS.map(([icon, t]) => <li key={t}><span>{icon}</span>{t}</li>)}
              </ul>
              <h4>Start from an example</h4>
              {EXAMPLES.map((ex) => (
                <button key={ex.title} type="button" className="ai-example" onClick={() => setPrompt(ex.text)}>
                  <strong>{ex.title}</strong>
                  <span className="ai-muted">{ex.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---------------- 2. Review plan ---------------- */}
        {step === 'plan' && plan && (
          <>
            <div className="ai-summary">
              <div className="ai-summary-main">
                <h3>{plan.title}</h3>
                <div className="ai-chips">
                  <span className="ai-chip accent">{plan.rounds.length} round{plan.rounds.length === 1 ? '' : 's'}</span>
                  <span className="ai-chip accent">{total} questions</span>
                  <span className="ai-chip">Max score {maxScore}</span>
                  {plan.audience && <span className="ai-chip">{plan.audience}</span>}
                </div>
                {plan.assumptions?.length > 0 && (
                  <details className="ai-details">
                    <summary>What the AI decided for you ({plan.assumptions.length})</summary>
                    <ul>{plan.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
                  </details>
                )}
                {plan.warnings?.map((w) => <div key={w} className="ai-warn">⚠️ {w}</div>)}
              </div>
            </div>

            <div className="ai-rounds">
              <div className="ai-round-row ai-round-head">
                <span>#</span><span>Round &amp; topic</span><span>Type</span><span>Difficulty</span>
                <span>Qs</span><span>Time s</span><span>Read s</span><span>Points</span><span>Minus</span><span />
              </div>
              {plan.rounds.map((r, i) => (
                <div key={i} className="ai-round-row">
                  <span className="ai-round-num">{Number(firstRound) + i}</span>
                  <div className="ai-round-name">
                    <input type="text" value={r.name} aria-label="Round name" placeholder="Round name"
                      onChange={(e) => updateRound(i, { name: e.target.value })} />
                    <input type="text" value={r.topic} aria-label="Topic" placeholder="Topic"
                      onChange={(e) => updateRound(i, { topic: e.target.value })} />
                  </div>
                  <div className="ai-cell-type">
                    <span className="ai-cell-label">Type</span>
                    <select value={r.type} aria-label="Type" onChange={(e) => updateRound(i, { type: e.target.value })}>
                      {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div className="ai-cell-diff">
                    <span className="ai-cell-label">Difficulty</span>
                    <select value={r.difficulty} aria-label="Difficulty" onChange={(e) => updateRound(i, { difficulty: e.target.value })}>
                      {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <Num label="Questions" min={1} max={20} value={r.count} onChange={(v) => updateRound(i, { count: v })} />
                  <Num label="Time (s)" min={5} max={600} value={r.timeLimit} onChange={(v) => updateRound(i, { timeLimit: v })} />
                  <Num label="Reading (s)" min={0} max={60} value={r.readingTime} onChange={(v) => updateRound(i, { readingTime: v })} />
                  <Num label="Points" value={r.points} onChange={(v) => updateRound(i, { points: v })} />
                  <Num label="Minus" value={r.negativePoints} onChange={(v) => updateRound(i, { negativePoints: v })} />
                  <button type="button" className="ai-icon-btn" title="Remove round" aria-label="Remove round"
                    disabled={plan.rounds.length <= 1} onClick={() => removeRound(i)}>✕</button>
                </div>
              ))}
            </div>

            <div className="ai-plan-tools">
              <button type="button" className="ai-btn ai-btn-sm" onClick={addRound} disabled={plan.rounds.length >= 10}>＋ Add round</button>
              <label className="ai-inline-field">
                Number rounds from
                <input type="number" min={1} value={firstRound}
                  onChange={(e) => setFirstRound(Math.max(1, Number(e.target.value) || 1))} />
              </label>
              {total > MAX_TOTAL && <span className="ai-warn">Max {MAX_TOTAL} questions per generation.</span>}
            </div>
          </>
        )}

        {/* ---------------- 3. Review questions ---------------- */}
        {step === 'review' && plan && (
          <>
            {busy && (
              <div className="ai-progress" aria-label="Generating">
                <div style={{ width: `${Math.max(6, (finished / plan.rounds.length) * 100)}%` }} />
              </div>
            )}
            {plan.rounds.map((r, i) => {
              const st = roundState[i] || { status: 'pending' };
              const qs = st.questions || [];
              const on = qs.filter((q) => q._include).length;
              return (
                <section key={i} className="ai-review-round">
                  <div className="ai-review-head">
                    <span className="ai-round-num">{Number(firstRound) + i}</span>
                    <strong>{r.name}</strong>
                    <span className="ai-chip accent">{TYPE_LABEL[r.type] || r.type}</span>
                    <span className="ai-chip">⏱ {r.timeLimit}s</span>
                    {Number(r.readingTime) > 0 && <span className="ai-chip">📖 {r.readingTime}s</span>}
                    <span className="ai-chip good">+{r.points}</span>
                    {Number(r.negativePoints) > 0 && <span className="ai-chip bad">−{r.negativePoints}</span>}
                    <span className="ai-chip">{r.difficulty}</span>
                    <div className="ai-review-status">
                      {st.status === 'done' && (
                        <>
                          <span className="ai-muted">{on}/{qs.length} selected</span>
                          <button type="button" className="ai-btn ai-btn-sm" onClick={() => setAll(i, on !== qs.length)}>
                            {on === qs.length ? 'Clear' : 'Select all'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {st.status === 'pending' && <div className="ai-round-msg ai-muted">Waiting…</div>}
                  {st.status === 'working' && <div className="ai-round-msg"><span className="ai-spinner" /> Writing {r.count} questions…</div>}
                  {st.status === 'error' && (
                    <div className="ai-round-msg">
                      <span style={{ color: 'var(--ai-bad)' }}>❌ {st.error}</span>
                      <button type="button" className="ai-btn ai-btn-sm" disabled={busy} onClick={() => retryRound(i)}>Retry</button>
                    </div>
                  )}
                  {st.status === 'done' && qs.length < Number(r.count) && (
                    <div className="ai-round-msg ai-muted">The AI returned {qs.length} of {r.count} usable questions.</div>
                  )}
                  {qs.map((q, qi) => (
                    <label key={qi} className={`ai-q ${q._include ? '' : 'off'}`}>
                      <input type="checkbox" checked={q._include} onChange={() => toggle(i, qi)} />
                      <span className="ai-q-no">{qi + 1}.</span>
                      <div>
                        <div className="ai-q-text">{q.text}</div>
                        <div className="ai-q-opts">
                          {q.options?.length > 0
                            ? q.options.map((o) => (
                                <span key={o} className={o === q.correctAnswer ? 'correct' : ''}>
                                  {o === q.correctAnswer ? '✓ ' : ''}{o}
                                </span>
                              ))
                            : <span className="correct">Answer: {q.correctAnswer}</span>}
                        </div>
                      </div>
                    </label>
                  ))}
                </section>
              );
            })}
          </>
        )}

        {error && <div className="ai-error">{error}</div>}
      </div>

      {/* ---------------- footer (always visible) ---------------- */}
      <div className="ai-footer">
        {step === 'prompt' && (
          <>
            <button type="button" className="ai-btn" onClick={onClose}>Cancel</button>
            <span className="ai-footer-info">The AI reads your request and proposes rounds you can edit.</span>
            <button type="button" className="ai-btn ai-btn-primary" onClick={understand} disabled={busy || !prompt.trim()}>
              {busy ? <><span className="ai-spinner" /> Reading your request…</> : '🧠 Plan my quiz'}
            </button>
          </>
        )}
        {step === 'plan' && plan && (
          <>
            <button type="button" className="ai-btn" onClick={() => setStep('prompt')}>←<span className="ai-hide-sm"> Edit request</span></button>
            <span className="ai-footer-info">{plan.rounds.length} rounds · {total} questions · nothing is saved yet</span>
            <button type="button" className="ai-btn ai-btn-primary" onClick={generateAll}
              disabled={busy || !plan.rounds.length || total < 1 || total > MAX_TOTAL}>
              ✨ Generate {total} questions
            </button>
          </>
        )}
        {step === 'review' && (
          <>
            <button type="button" className="ai-btn" disabled={busy} onClick={() => setStep('plan')}>←<span className="ai-hide-sm"> Back to plan</span></button>
            <span className="ai-footer-info">
              {busy && finished < plan.rounds.length
                ? `Generating round ${finished + 1} of ${plan.rounds.length}…`
                : `${selected.length} of ${allQuestions.length} questions selected · saved in round order`}
            </span>
            <button type="button" className="ai-btn ai-btn-primary" disabled={busy || selected.length === 0} onClick={save}>
              {busy && finished === plan.rounds.length ? 'Saving…' : `Save ${selected.length} questions`}
            </button>
          </>
        )}
      </div>
    </>
  );
}
