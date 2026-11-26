import Icon from './common/Icon';
import { useState } from 'react';

const FORMATS = [
  { value: 'DIRECTED', label: 'Directed', hint: 'Each question goes to one group in turn; can pass on a wrong answer' },
  { value: 'ALL', label: 'Everyone answers', hint: 'All groups answer every question on their phones' },
  { value: 'BUZZER', label: 'Buzzer', hint: 'Any group buzzes in; host marks the answer' },
  { value: 'CLUE', label: 'Clue round', hint: 'Clues revealed one by one; buzz in; fewer clues = more points' }
];

/** The 5-round group format: general, visual, rapid fire, buzzer, clue. */
const PRESET = [
  { round: 1, name: 'General', format: 'DIRECTED', passOnWrong: true, passPercent: 50, eliminate: 0 },
  { round: 2, name: 'Visual', format: 'DIRECTED', passOnWrong: true, passPercent: 50, eliminate: 1 },
  { round: 3, name: 'Rapid fire', format: 'DIRECTED', passOnWrong: false, passPercent: 50, eliminate: 1 },
  { round: 4, name: 'Buzzer', format: 'BUZZER', passOnWrong: false, passPercent: 50, eliminate: 0 },
  { round: 5, name: 'Clue', format: 'CLUE', passOnWrong: false, passPercent: 50, eliminate: 0 }
];

function inferFormat(types) {
  if (types.length && types.every((t) => t === 'CLUE')) return 'CLUE';
  if (types.length && types.every((t) => t === 'BUZZER' || t === 'ORAL_BUZZER')) return 'BUZZER';
  return 'DIRECTED';
}

/**
 * Competition (group) setup for a quiz: classic vs groups, and per-round
 * format, passing and elimination.
 */
export default function CompetitionSetup({ quiz, questions, token, onClose, onSaved }) {
  const rounds = [...new Set(questions.map((q) => q.round))].sort((a, b) => a - b);
  const saved = Array.isArray(quiz?.roundSettings) ? quiz.roundSettings : [];
  const allRounds = [...new Set([...rounds, ...saved.map((r) => r.round)])].sort((a, b) => a - b);
  const initial = (allRounds.length ? allRounds : [1]).map((round) => {
    const s = saved.find((r) => r.round === round);
    const types = questions.filter((q) => q.round === round).map((q) => q.type);
    return s ? { ...s } : { round, name: `Round ${round}`, format: inferFormat(types), passOnWrong: true, passPercent: 50, passTimeLimit: null, eliminate: 0 };
  });
  const [mode, setMode] = useState(quiz?.mode === 'TEAMS' ? 'TEAMS' : 'CLASSIC');
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (i, patch) => setSettings((s) => s.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const applyPreset = () => setSettings((s) => {
    const byRound = new Map(s.map((r) => [r.round, r]));
    for (const p of PRESET) byRound.set(p.round, { ...byRound.get(p.round), ...p });
    return [...byRound.values()].sort((a, b) => a.round - b.round);
  });

  const save = async () => {
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/quizzes/${quiz.id}/competition`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mode, roundSettings: settings })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      onSaved?.(data);
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const count = (round) => questions.filter((q) => q.round === round).length;
  const totalOut = settings.reduce((s, r) => s + (Number(r.eliminate) || 0), 0);

  return (
    <div className="ds-overlay">
      <div className="ds-modal wide">
        <div className="ds-modal-header">
          <span className="ds-tile grad"><Icon name="trophy" /></span>
          <div>
            <h2>Competition setup</h2>
            <p>How groups play each round, passing and elimination.</p>
          </div>
          <button type="button" className="ds-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="ds-modal-body">
          <div className="cs-modes">
            <button type="button" className={`cs-mode ${mode === 'CLASSIC' ? 'active' : ''}`} onClick={() => setMode('CLASSIC')}>
              <span className="ds-tile" style={{ '--c': '#38bdf8', color: '#38bdf8' }}><Icon name="phone" /></span>
              <div><strong>Classic</strong><span>Every student plays on their own phone and answers every question.</span></div>
            </button>
            <button type="button" className={`cs-mode ${mode === 'TEAMS' ? 'active' : ''}`} onClick={() => setMode('TEAMS')}>
              <span className="ds-tile" style={{ '--c': '#a855f7', color: '#a855f7' }}><Icon name="users" /></span>
              <div><strong>Group competition</strong><span>One phone per group. Directed questions with passes, buzzer and clue rounds, elimination.</span></div>
            </button>
          </div>

          {mode === 'TEAMS' && (
            <>
              <div className="ds-row" style={{ margin: '18px 0 10px' }}>
                <strong>Rounds</strong>
                <span className="ds-muted" style={{ fontSize: 13 }}>{totalOut ? `${totalOut} group${totalOut > 1 ? 's' : ''} eliminated in total` : 'No elimination'}</span>
                <span className="ds-spacer" />
                <button type="button" className="ds-btn ds-btn-sm" onClick={applyPreset} title="General · Visual · Rapid fire · Buzzer · Clue"><Icon name="sparkles" /> Use 5-round group format</button>
              </div>

              <div style={{ display: 'grid', gap: 10 }}>
                {settings.map((r, i) => {
                  const f = FORMATS.find((x) => x.value === r.format) || FORMATS[0];
                  return (
                    <div key={r.round} className="ds-card cs-round">
                      <div className="cs-round-head">
                        <span className="cs-round-n">{r.round}</span>
                        <input className="ds-input cs-round-name" value={r.name} onChange={(e) => update(i, { name: e.target.value })} aria-label="Round name" />
                        <span className={`ds-chip ${count(r.round) ? 'accent' : 'warn'}`}>{count(r.round) ? `${count(r.round)} questions` : 'no questions yet'}</span>
                      </div>
                      <div className="cs-round-grid">
                        <label className="ds-field" style={{ margin: 0 }}>
                          <span className="ds-label">Format</span>
                          <select className="ds-select" value={r.format} onChange={(e) => update(i, { format: e.target.value })}>
                            {FORMATS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                          </select>
                        </label>
                        {r.format === 'DIRECTED' && (
                          <>
                            <label className="ds-field" style={{ margin: 0 }}>
                              <span className="ds-label">Pass on wrong</span>
                              <label className="ds-switch" style={{ marginTop: 6 }}>
                                <input type="checkbox" checked={r.passOnWrong !== false} onChange={(e) => update(i, { passOnWrong: e.target.checked })} /><span />
                              </label>
                            </label>
                            {r.passOnWrong !== false && (
                              <>
                                <label className="ds-field" style={{ margin: 0 }}>
                                  <span className="ds-label">Pass points %</span>
                                  <input className="ds-input" type="number" min="0" max="100" value={r.passPercent ?? 50} onChange={(e) => update(i, { passPercent: Number(e.target.value) })} />
                                </label>
                                <label className="ds-field" style={{ margin: 0 }}>
                                  <span className="ds-label">Pass time (s)</span>
                                  <input className="ds-input" type="number" min="3" placeholder="half" value={r.passTimeLimit ?? ''} onChange={(e) => update(i, { passTimeLimit: e.target.value === '' ? null : Number(e.target.value) })} />
                                </label>
                              </>
                            )}
                          </>
                        )}
                        <label className="ds-field" style={{ margin: 0 }}>
                          <span className="ds-label">Eliminate after</span>
                          <select className="ds-select" value={r.eliminate || 0} onChange={(e) => update(i, { eliminate: Number(e.target.value) })}>
                            <option value={0}>Nobody</option>
                            <option value={1}>1 group</option>
                            <option value={2}>2 groups</option>
                          </select>
                        </label>
                      </div>
                      <div className="ds-hint">{f.hint}</div>
                    </div>
                  );
                })}
              </div>
              <div className="ds-alert info" style={{ marginTop: 14 }}>
                Timing, points and minus points come from each question. Groups join with their group name; directed questions rotate through the groups in join order. Turns and eliminations adapt to how many groups actually join: every group gets the same number of directed questions, and at least 2 groups always stay in. Give the questions of a directed round a subject (keep each subject's questions together) and every group gets one question from every subject.
              </div>
            </>
          )}
          {error && <div className="ds-alert bad" style={{ marginTop: 14 }}><Icon name="alert" /> {error}</div>}
        </div>

        <div className="ds-modal-footer">
          <button type="button" className="ds-btn ds-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="ds-btn ds-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save setup'}</button>
        </div>
      </div>
    </div>
  );
}
