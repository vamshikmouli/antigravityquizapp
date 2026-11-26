import { Fragment, useState } from 'react';

import { QUESTION_TYPES as ALL_TYPES, TYPE_INFO } from '../lib/questionTypes';
// AI writes ordinary question types; clue questions are written by hand.
const QUESTION_TYPES = ALL_TYPES.filter((t) => t.value !== 'CLUE');
export { QUESTION_TYPES, TYPE_INFO };
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const MAX_TOTAL = 60;
const LETTERS = 'ABCDEFGH';

const EXAMPLES = [
  {
    icon: '🔬',
    title: 'Science · class 8 · 3 rounds',
    text: 'Science quiz for class 8 with 3 rounds: 5 MCQs on physics (20 s, 10 points), a buzzer round on chemistry with 4 questions (3 s reading time, +20 / −10), and 6 true/false on biology.'
  },
  {
    icon: '🌍',
    title: 'General knowledge · college',
    text: 'General knowledge quiz for college students, 4 rounds, 5 questions each, mixed types, hardest round last with negative marking.'
  },
  {
    icon: '➗',
    title: 'Maths · grade 5 · no negatives',
    text: 'Fun maths quiz for grade 5: rapid-fire buzzer on times tables, then short-answer word problems, 1 minute each, no negative marking.'
  },
  {
    icon: '🏏',
    title: 'Sports trivia · rapid fire',
    text: 'Sports trivia night: 2 rounds. Round 1 is 8 multiple choice on cricket and football, 15 seconds each. Round 2 is an oral buzzer round, 6 hard questions, +50 and −25.'
  }
];

const HINTS = ['🔢 Rounds', '🧩 Types', '⏱ Timing', '🏆 Points', '➖ Negative marks'];
const STEPS = ['Describe', 'Review plan', 'Review questions'];

function Stepper({ step }) {
  const idx = { prompt: 0, plan: 1, review: 2 }[step];
  return (
    <div className="ai-stepper">
      {STEPS.map((label, i) => (
        <Fragment key={label}>
          {i > 0 && <span className={`ai-step-line ${i <= idx ? 'done' : ''}`} />}
          <div className={`ai-step ${i === idx ? 'active' : i < idx ? 'done' : ''}`}>
            <span className="ai-step-num">{i < idx ? '✓' : i + 1}</span>
            <span className="ai-step-label">{label}</span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}

function NumField({ label, value, onChange, min = 0, max, unit, variant = '' }) {
  return (
    <label className="ai-field n">
      <span>{label}</span>
      <div className={`ai-num ${variant} ${unit ? '' : 'plain'}`}>
        <input type="number" min={min} max={max} value={value} aria-label={label}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
        {unit && <em>{unit}</em>}
      </div>
    </label>
  );
}

/** One generated question as a selectable card (shared with quick mode). */
export function QuestionItem({ q, index, onToggle }) {
  return (
    <label className={`ai-q ${q._include ? '' : 'off'}`}>
      <input type="checkbox" checked={q._include} onChange={onToggle} />
      <div>
        <div className="ai-q-text"><span className="n">{index + 1}.</span>{q.text}</div>
        <div className="ai-q-opts">
          {q.options?.length > 0
            ? q.options.map((o, oi) => (
                <span key={o} className={`ai-opt o${oi % 4} ${o === q.correctAnswer ? 'correct' : ''}`}>
                  <i>{LETTERS[oi] || oi + 1}</i>{o}{o === q.correctAnswer ? ' ✓' : ''}
                </span>
              ))
            : <span className="ai-answer">✓ {q.correctAnswer}</span>}
        </div>
      </div>
    </label>
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
  // One AI request returns at most 20 questions, so bigger rounds (up to 30)
  // are fetched in batches. Each batch is told which question numbers it
  // covers, so an ordered round (e.g. subject blocks) keeps its order.
  const BATCH = 15
  const generateRound = async (i, avoid) => {
    const r = plan.rounds[i];
    const total = Math.max(1, Number(r.count) || 5);
    setRoundState((s) => ({ ...s, [i]: { status: 'working' } }));
    try {
      const questions = [];
      const seen = [...avoid];
      for (let start = 0; start < total; start += BATCH) {
        const n = Math.min(BATCH, total - start);
        const part = total > BATCH ? `; write questions ${start + 1}–${start + n} of the ${total} in this round, continuing the order the round asks for` : '';
        const data = await post('/api/questions/generate', {
          provider,
          topic: r.topic || plan.topic,
          count: n,
          type: r.type,
          difficulty: r.difficulty,
          context: `Quiz "${plan.title}"${plan.audience ? ` for ${plan.audience}` : ''}, round "${r.name}"${part}`,
          avoid: seen.slice(-40),
          settings: {
            round: Number(firstRound) + i,
            timeLimit: Number(r.timeLimit),
            readingTime: Number(r.readingTime),
            points: Number(r.points),
            negativePoints: Number(r.negativePoints)
          }
        });
        const batch = (data.questions || []).map((q) => ({ ...q, _include: true }));
        questions.push(...batch);
        seen.push(...batch.map((q) => q.text));
        if (total > BATCH) setRoundState((s) => ({ ...s, [i]: { status: 'working', questions: [...questions] } }));
      }
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

  const rounds = plan?.rounds || [];
  const total = rounds.reduce((s, r) => s + (Number(r.count) || 0), 0);
  const maxScore = rounds.reduce((s, r) => s + (Number(r.count) || 0) * (Number(r.points) || 0), 0);
  const minutes = Math.max(1, Math.round(rounds.reduce((s, r) =>
    s + (Number(r.count) || 0) * ((Number(r.timeLimit) || 0) + (Number(r.readingTime) || 0) + 8), 0) / 60));
  const finished = rounds.filter((_, i) => ['done', 'error'].includes(roundState[i]?.status)).length;
  const generating = busy && step === 'review' && finished < rounds.length;

  return (
    <>
      <Stepper step={step} />

      <div className="ai-body" key={step}>
        {/* ---------------- 1. Describe ---------------- */}
        {step === 'prompt' && (
          <div className="ai-describe">
            <div>
              <h3 className="ai-hero-title">What quiz shall we <span>create today?</span></h3>
              <p className="ai-hero-sub">Describe it in plain words. Anything you leave out, the AI decides — and you can change everything before it’s saved.</p>
              <div className="ai-prompt-box">
                <textarea
                  id="ai-prompt"
                  aria-label="Describe your quiz"
                  value={prompt}
                  maxLength={4000}
                  autoFocus
                  placeholder={'e.g. Science quiz for class 8 with 3 rounds.\nRound 1: 5 MCQs on physics, 20 seconds, 10 points.\nRound 2: buzzer on chemistry, 3 s reading time, +20 / −10…'}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) understand(); }}
                />
                <div className="ai-prompt-bar">
                  {HINTS.map((h) => <span key={h} className="ai-chip">{h}</span>)}
                  <span className="ai-prompt-count">
                    {prompt.length}/4000 · <span className="ai-kbd">Ctrl</span>+<span className="ai-kbd">Enter</span>
                  </span>
                </div>
              </div>
            </div>
            <div>
              <div className="ai-side-title">💡 Need inspiration? Start from one of these</div>
              {EXAMPLES.map((ex) => (
                <button key={ex.title} type="button" className="ai-example" onClick={() => setPrompt(ex.text)}>
                  <span className="ai-example-icon">{ex.icon}</span>
                  <div>
                    <strong>{ex.title}</strong>
                    <span>{ex.text}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---------------- 2. Review plan ---------------- */}
        {step === 'plan' && plan && (
          <>
            <div className="ai-hero">
              <div className="ai-hero-main">
                <div className="ai-hero-kicker">Your quiz plan</div>
                <h3>{plan.title}</h3>
                {plan.audience && <div className="ai-muted">For {plan.audience}</div>}
                {plan.assumptions?.length > 0 && (
                  <details className="ai-details">
                    <summary>What the AI decided for you ({plan.assumptions.length})</summary>
                    <ul>{plan.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
                  </details>
                )}
                {plan.warnings?.map((w) => <div key={w} className="ai-warn">⚠️ {w}</div>)}
              </div>
              <div className="ai-stats">
                <div className="ai-stat-box"><b>{rounds.length}</b><small>Rounds</small></div>
                <div className="ai-stat-box"><b>{total}</b><small>Questions</small></div>
                <div className="ai-stat-box"><b>{maxScore}</b><small>Max score</small></div>
                <div className="ai-stat-box"><b>~{minutes}</b><small>Minutes</small></div>
              </div>
            </div>

            {rounds.map((r, i) => {
              const info = TYPE_INFO[r.type] || TYPE_INFO.MULTIPLE_CHOICE;
              return (
                <div key={i} className={`ai-round-card t-${r.type}`}>
                  <span className="ai-type-icon">{info.icon}</span>
                  <div className="ai-round-name">
                    <span className="ai-round-kicker">Round {Number(firstRound) + i}</span>
                    <input type="text" className="name" value={r.name} aria-label="Round name" placeholder="Round name"
                      onChange={(e) => updateRound(i, { name: e.target.value })} />
                    <input type="text" className="topic" value={r.topic} aria-label="Topic" placeholder="Topic"
                      onChange={(e) => updateRound(i, { topic: e.target.value })} />
                  </div>
                  <label className="ai-field ai-cell-type">
                    <span>Type</span>
                    <select value={r.type} onChange={(e) => updateRound(i, { type: e.target.value })}>
                      {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
                    </select>
                  </label>
                  <label className="ai-field ai-cell-diff">
                    <span>Difficulty</span>
                    <select value={r.difficulty} onChange={(e) => updateRound(i, { difficulty: e.target.value })}>
                      {DIFFICULTIES.map((d) => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
                    </select>
                  </label>
                  <NumField label="Qs" min={1} max={30} value={r.count} onChange={(v) => updateRound(i, { count: v })} />
                  <NumField label="Time" unit="s" min={5} max={600} value={r.timeLimit} onChange={(v) => updateRound(i, { timeLimit: v })} />
                  <NumField label="Reading" unit="s" min={0} max={60} value={r.readingTime} onChange={(v) => updateRound(i, { readingTime: v })} />
                  <NumField label="Points" variant="plus" value={r.points} onChange={(v) => updateRound(i, { points: v })} />
                  <NumField label="Minus" variant="minus" value={r.negativePoints} onChange={(v) => updateRound(i, { negativePoints: v })} />
                  <button type="button" className="ai-icon-btn" title="Remove round" aria-label="Remove round"
                    disabled={rounds.length <= 1} onClick={() => removeRound(i)}>✕</button>
                </div>
              );
            })}

            <div className="ai-plan-tools">
              <button type="button" className="ai-add-round" onClick={addRound} disabled={rounds.length >= 10}>＋ Add another round</button>
              <label className="ai-inline-field">
                Number rounds from
                <input type="number" min={1} value={firstRound}
                  onChange={(e) => setFirstRound(Math.max(1, Number(e.target.value) || 1))} />
              </label>
            </div>
            {total > MAX_TOTAL && <div className="ai-warn">⚠️ Max {MAX_TOTAL} questions per generation — reduce some rounds.</div>}
          </>
        )}

        {/* ---------------- 3. Review questions ---------------- */}
        {step === 'review' && plan && (
          <>
            {generating && (
              <div className="ai-progress" aria-label="Generating">
                <div style={{ width: `${Math.max(8, (finished / rounds.length) * 100)}%` }} />
              </div>
            )}
            {rounds.map((r, i) => {
              const info = TYPE_INFO[r.type] || TYPE_INFO.MULTIPLE_CHOICE;
              const st = roundState[i] || { status: 'pending' };
              const qs = st.questions || [];
              const on = qs.filter((q) => q._include).length;
              return (
                <section key={i} className={`ai-review-round t-${r.type}`}>
                  <div className="ai-review-head">
                    <span className="ai-type-icon">{info.icon}</span>
                    <div className="ai-review-title">
                      <small>Round {Number(firstRound) + i} · {info.label}</small>
                      <strong>{r.name}</strong>
                    </div>
                    <div className="ai-review-chips">
                      <span className="ai-chip">⏱ {r.timeLimit}s</span>
                      {Number(r.readingTime) > 0 && <span className="ai-chip">📖 {r.readingTime}s</span>}
                      <span className="ai-chip good">+{r.points}</span>
                      {Number(r.negativePoints) > 0 && <span className="ai-chip bad">−{r.negativePoints}</span>}
                      <span className="ai-chip">{r.difficulty}</span>
                    </div>
                    <div className="ai-review-status">
                      {st.status === 'pending' && 'Queued'}
                      {st.status === 'working' && <><span className="ai-spinner dim" /> Writing questions…</>}
                      {st.status === 'done' && (
                        <>
                          <span>{on} of {qs.length} selected</span>
                          <button type="button" className="ai-btn ai-btn-sm" onClick={() => setAll(i, on !== qs.length)}>
                            {on === qs.length ? 'Clear' : 'Select all'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {(st.status === 'working' || st.status === 'pending') && (
                    <div className="ai-skeleton">
                      {Array.from({ length: Math.min(Number(r.count) || 3, st.status === 'pending' ? 2 : 4) }, (_, k) => <div key={k} />)}
                    </div>
                  )}
                  {st.status === 'error' && (
                    <div className="ai-round-msg">
                      <span style={{ color: 'var(--ai-bad)' }}>⚠️ {st.error}</span>
                      <button type="button" className="ai-btn ai-btn-sm" disabled={busy} onClick={() => retryRound(i)}>↻ Retry</button>
                    </div>
                  )}
                  {st.status === 'done' && qs.length < Number(r.count) && (
                    <div className="ai-round-msg ai-muted">The AI returned {qs.length} of {r.count} usable questions.</div>
                  )}
                  {qs.length > 0 && (
                    <div className="ai-q-list">
                      {qs.map((q, qi) => <QuestionItem key={qi} q={q} index={qi} onToggle={() => toggle(i, qi)} />)}
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}

        {error && <div className="ai-error">⚠️ {error}</div>}
      </div>

      {/* ---------------- footer (always visible) ---------------- */}
      <div className="ai-footer">
        {step === 'prompt' && (
          <>
            <button type="button" className="ai-btn ai-btn-ghost" onClick={onClose}>Cancel</button>
            <span className="ai-footer-info">The AI proposes rounds — <strong>you review before anything is saved.</strong></span>
            <button type="button" className="ai-btn ai-btn-primary" onClick={understand} disabled={busy || !prompt.trim()}>
              {busy ? <><span className="ai-spinner" /> Reading your request…</> : <>✨ Plan my quiz</>}
            </button>
          </>
        )}
        {step === 'plan' && plan && (
          <>
            <button type="button" className="ai-btn" onClick={() => setStep('prompt')}>←<span className="ai-hide-sm"> Edit request</span></button>
            <span className="ai-footer-info"><strong>{rounds.length} rounds · {total} questions</strong> · nothing is saved yet</span>
            <button type="button" className="ai-btn ai-btn-primary" onClick={generateAll}
              disabled={busy || !rounds.length || total < 1 || total > MAX_TOTAL}>
              ✨ Generate {total} questions
            </button>
          </>
        )}
        {step === 'review' && (
          <>
            <button type="button" className="ai-btn" disabled={busy} onClick={() => setStep('plan')}>←<span className="ai-hide-sm"> Back to plan</span></button>
            <span className="ai-footer-info">
              {generating
                ? <>Generating round <strong>{finished + 1} of {rounds.length}</strong>…</>
                : <><strong>{selected.length} of {allQuestions.length}</strong> selected · saved in round order</>}
            </span>
            <button type="button" className="ai-btn ai-btn-primary" disabled={busy || selected.length === 0} onClick={save}>
              {busy && !generating ? <><span className="ai-spinner" /> Saving…</> : `Save ${selected.length} questions`}
            </button>
          </>
        )}
      </div>
    </>
  );
}
