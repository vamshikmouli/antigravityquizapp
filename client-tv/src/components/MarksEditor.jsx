import { useEffect, useState, useCallback } from 'react'
import Icon from './common/Icon'

/**
 * Host-only "Fix marks": pick a question that has been played, then set each
 * group's result and points. The server updates the answer, the group's total,
 * the leaderboard and (between rounds) the round summary.
 */
export default function MarksEditor({ socket, questionId, onClose }) {
  const [data, setData] = useState(null)       // { questions, question, rows }
  const [selected, setSelected] = useState(questionId || null)
  const [edits, setEdits] = useState({})       // participantId -> { isCorrect, points }
  const [saving, setSaving] = useState(null)
  const [saved, setSaved] = useState({})
  const [error, setError] = useState('')

  const load = useCallback((qid) => {
    socket.emit('get-marks', { questionId: qid }, (res) => {
      if (res?.error) { setError(res.error); return }
      setData(res)
      setSelected(res.question?.id || null)
      setEdits({})
    })
  }, [socket])

  useEffect(() => { load(questionId) }, [load, questionId])

  useEffect(() => {
    const onCorrected = (d) => {
      setSaving(null)
      setSaved((s) => ({ ...s, [d.participantId]: true }))
      load(d.questionId)
    }
    const onError = (e) => { setSaving(null); setError(e?.message || 'Could not save') }
    socket.on('marks-corrected', onCorrected)
    socket.on('error', onError)
    return () => { socket.off('marks-corrected', onCorrected); socket.off('error', onError) }
  }, [socket, load])

  const q = data?.question
  const valueOf = (row) => ({ isCorrect: row.isCorrect, points: row.points, ...edits[row.participantId] })
  const changed = (row) => {
    const v = valueOf(row)
    return edits[row.participantId] && (v.isCorrect !== row.isCorrect || Number(v.points) !== row.points)
  }

  const setResult = (row, isCorrect) => {
    const cur = valueOf(row)
    let points = cur.points
    if (isCorrect && points <= 0) points = q?.points ?? 10
    if (!isCorrect && points > 0) points = -Math.abs(q?.negativePoints || 0)
    setEdits((e) => ({ ...e, [row.participantId]: { isCorrect, points } }))
    setSaved((s) => ({ ...s, [row.participantId]: false }))
  }
  const setPoints = (row, raw) => {
    const cur = valueOf(row)
    setEdits((e) => ({ ...e, [row.participantId]: { isCorrect: cur.isCorrect ?? false, points: raw } }))
    setSaved((s) => ({ ...s, [row.participantId]: false }))
  }
  const save = (row) => {
    const v = valueOf(row)
    const points = Number.parseInt(v.points, 10)
    if (!Number.isFinite(points)) { setError('Points must be a whole number'); return }
    setError('')
    setSaving(row.participantId)
    socket.emit('correct-mark', { questionId: q.id, participantId: row.participantId, isCorrect: Boolean(v.isCorrect), points })
  }

  return (
    <div className="ds-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ds-modal wide marks-modal" role="dialog" aria-label="Fix marks">
        <div className="ds-modal-header">
          <span className="ds-tile"><Icon name="pencil" /></span>
          <div>
            <h2>Fix marks</h2>
            <p>Change a group's result or points. Totals and the leaderboard update straight away.</p>
          </div>
          <button type="button" className="ds-close" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button>
        </div>

        <div className="ds-modal-body">
          {!data && !error && <div className="ds-skeleton" style={{ height: 120 }} />}
          {data && data.questions.length === 0 && <p className="ds-muted">No questions have been played yet.</p>}
          {data && data.questions.length > 0 && (
            <>
              <label className="ds-field">
                <span className="ds-label">Question</span>
                <select className="ds-select" value={selected || ''} onChange={(e) => load(e.target.value)}>
                  {[...data.questions].reverse().map((x) => (
                    <option key={x.id} value={x.id}>Q{x.number} · Round {x.round} · {x.text.length > 70 ? x.text.slice(0, 70) + '…' : x.text}</option>
                  ))}
                </select>
              </label>
              {q && (
                <div className="marks-q">
                  <span className="ds-chip good">+{q.points}</span>
                  {q.negativePoints > 0 && <span className="ds-chip bad">−{q.negativePoints}</span>}
                  <span className="ds-muted">Answer: <b>{q.correctAnswer || '—'}</b></span>
                </div>
              )}
              <div className="marks-table">
                <div className="marks-row head"><span>Group</span><span>Their answer</span><span>Result</span><span>Points</span><span /></div>
                {data.rows.map((row) => {
                  const v = valueOf(row)
                  return (
                    <div key={row.participantId} className={`marks-row ${row.eliminated ? 'out' : ''}`}>
                      <span className="marks-name">{row.name}{row.eliminated && <em>OUT</em>}</span>
                      <span className="marks-ans">{row.answered ? row.answer : <i>No answer</i>}</span>
                      <span className="marks-result" role="group" aria-label={`Result for ${row.name}`}>
                        <button type="button" className={v.isCorrect === true ? 'on good' : ''} onClick={() => setResult(row, true)}><Icon name="check" /> Correct</button>
                        <button type="button" className={v.isCorrect === false ? 'on bad' : ''} onClick={() => setResult(row, false)}><Icon name="x" /> Wrong</button>
                      </span>
                      <input className="ds-input marks-pts" type="number" value={v.points} aria-label={`Points for ${row.name}`}
                        onChange={(e) => setPoints(row, e.target.value)} />
                      <span className="marks-save">
                        {changed(row)
                          ? <button type="button" className="ds-btn ds-btn-primary ds-btn-sm" disabled={saving === row.participantId} onClick={() => save(row)}>{saving === row.participantId ? 'Saving…' : 'Save'}</button>
                          : saved[row.participantId] ? <span className="ds-chip good"><Icon name="check" /> Saved</span> : null}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
          {error && <div className="ds-alert bad" style={{ marginTop: 12 }}><Icon name="alert" /> {error}</div>}
        </div>

        <div className="ds-modal-footer">
          <button type="button" className="ds-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
