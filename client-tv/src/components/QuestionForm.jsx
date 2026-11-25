import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { QUESTION_TYPES, typeInfo, LETTERS } from '../lib/questionTypes';

const TEXT_ANSWER_TYPES = ['SHORT_ANSWER', 'ORAL_BUZZER', 'ORAL_OPEN'];

function QuestionForm({ onClose, onSave, editingQuestion = null, quizId = null, defaultRound = 1 }) {
  const { token } = useAuth();
  const [formData, setFormData] = useState({
    text: editingQuestion?.text || '',
    type: editingQuestion?.type || 'MULTIPLE_CHOICE',
    options: editingQuestion?.options || ['', '', '', ''],
    correctAnswer: editingQuestion?.correctAnswer || '',
    points: editingQuestion?.points || 100,
    negativePoints: editingQuestion?.negativePoints || 0,
    timeLimit: editingQuestion?.timeLimit || 30,
    round: editingQuestion?.round || defaultRound || 1,
    imageUrl: editingQuestion?.imageUrl || '',
    optionImages: editingQuestion?.optionImages || (editingQuestion?.options?.length ? editingQuestion.options.map(() => '') : ['', '', '', '']),
    readingTime: editingQuestion?.readingTime || 0,
    quizId: editingQuestion?.quizId || quizId
  });
  const [uploading, setUploading] = useState({ question: false, options: [] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);


  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Reset options/answer when type changes
    if (field === 'type') {
      if (value === 'TRUE_FALSE') {
        setFormData(prev => ({ 
          ...prev, 
          type: value,
          options: ['True', 'False'],
          correctAnswer: 'True' 
        }));
      } else if (value === 'SHORT_ANSWER' || value === 'ORAL_BUZZER' || value === 'ORAL_OPEN') {
        setFormData(prev => ({ 
          ...prev, 
          type: value,
          options: [],
          correctAnswer: '' 
        }));
      } else {
        // MCQ or BUZZER
        setFormData(prev => ({ 
          ...prev, 
          type: value,
          options: ['', '', '', ''],
          correctAnswer: '' 
        }));
      }
    }
  };

  const handleOptionChange = (index, value) => {
    setFormData(prev => {
      const options = [...prev.options];
      const wasCorrect = prev.correctAnswer !== '' && prev.options[index] === prev.correctAnswer;
      options[index] = value;
      return { ...prev, options, correctAnswer: wasCorrect ? value : prev.correctAnswer };
    });
  };

  const handleFileUpload = async (e, type, index = null) => {
    const file = e.target.files[0];
    if (!file) return;

    const data = new FormData();
    data.append('image', file);

    try {
      if (type === 'question') setUploading(prev => ({ ...prev, question: true }));
      else {
        const newOpts = [...uploading.options];
        newOpts[index] = true;
        setUploading(prev => ({ ...prev, options: newOpts }));
      }

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: data
      });
      const result = await res.json();
      
      if (type === 'question') {
        setFormData(prev => ({ ...prev, imageUrl: result.imageUrl }));
      } else {
        const newImgs = [...formData.optionImages];
        newImgs[index] = result.imageUrl;
        setFormData(prev => ({ ...prev, optionImages: newImgs }));
      }
    } catch (err) {
      setError('Upload failed');
    } finally {
      if (type === 'question') setUploading(prev => ({ ...prev, question: false }));
      else {
        const newOpts = [...uploading.options];
        newOpts[index] = false;
        setUploading(prev => ({ ...prev, options: newOpts }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Validation
    if (!formData.text) return setError('Question text is required');
    if (!['SHORT_ANSWER', 'ORAL_BUZZER', 'ORAL_OPEN'].includes(formData.type) && !formData.correctAnswer) return setError('Correct answer is required');
    if (['MULTIPLE_CHOICE', 'BUZZER'].includes(formData.type)) {
      if (formData.options.some(opt => !opt)) return setError('All options must be filled');
    }
    if (formData.type === 'SHORT_ANSWER' && !formData.correctAnswer) return setError('Correct answer is required');

    setSaving(true);

    try {
      const url = editingQuestion 
        ? `/api/questions/${editingQuestion.id}`
        : '/api/questions';

      const method = editingQuestion ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          round: Number(formData.round) || 1,
          timeLimit: Math.max(5, Number(formData.timeLimit) || 30),
          readingTime: Math.max(0, Number(formData.readingTime) || 0),
          points: Math.max(0, Number(formData.points) || 0),
          negativePoints: Math.max(0, Number(formData.negativePoints) || 0)
        })
      });

      if (!res.ok) throw new Error('Failed to save question');

      onSave();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const t = typeInfo(formData.type);
  const num = (field) => (e) => handleChange(field, e.target.value === '' ? '' : parseInt(e.target.value, 10));
  const hasOptions = ['MULTIPLE_CHOICE', 'BUZZER'].includes(formData.type);

  return (
    <div className="ds-overlay">
      <form className={`ds-modal wide qf t-${formData.type}`} onSubmit={handleSubmit}>
        <div className="ds-modal-header">
          <span className="ds-type-icon">{t.icon}</span>
          <div>
            <h2>{editingQuestion ? 'Edit question' : 'New question'}</h2>
            <p>{t.label} · Round {formData.round || 1}</p>
          </div>
          <button type="button" onClick={onClose} className="ds-close" aria-label="Close">×</button>
        </div>

        <div className="ds-modal-body">
          <div className="qf-section">
            <div className="ds-label">Question type</div>
            <div className="qf-types">
              {QUESTION_TYPES.map((qt) => (
                <button type="button" key={qt.value} className={`qf-type t-${qt.value} ${formData.type === qt.value ? 'active' : ''}`}
                  onClick={() => formData.type !== qt.value && handleChange('type', qt.value)}>
                  <span className="ds-type-icon">{qt.icon}</span>
                  <span>{qt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="qf-section">
            <label className="ds-field" style={{ marginBottom: 10 }}>
              <span className="ds-label">Question</span>
              <textarea className="ds-textarea" value={formData.text} rows={3} autoFocus={!editingQuestion}
                onChange={(e) => handleChange('text', e.target.value)} placeholder="e.g. What is the SI unit of force?" />
            </label>
            <div className="ds-row">
              {formData.imageUrl && (
                <div className="qf-img">
                  <img src={formData.imageUrl} alt="Question" />
                  <button type="button" onClick={() => handleChange('imageUrl', '')} aria-label="Remove image">×</button>
                </div>
              )}
              <label className="ds-btn ds-btn-sm" style={{ cursor: 'pointer' }}>
                <input type="file" accept="image/*" hidden onChange={(e) => handleFileUpload(e, 'question')} />
                {uploading.question ? <><span className="ds-spinner" /> Uploading…</> : <>🖼️ {formData.imageUrl ? 'Change image' : 'Add image'}</>}
              </label>
              <span className="ds-hint">Optional — shown on the big screen.</span>
            </div>
          </div>

          <div className="qf-section">
            <div className="ds-label">{hasOptions ? 'Options — tap the circle to mark the correct one' : 'Correct answer'}</div>

            {hasOptions && (
              <div className="qf-options">
                {formData.options.map((opt, idx) => {
                  const correct = formData.correctAnswer === opt && opt !== '';
                  return (
                    <div key={idx} className={`qf-option o${idx % 4} ${correct ? 'correct' : ''}`}>
                      <button type="button" className="qf-mark" disabled={!opt} title="Mark as correct"
                        aria-label={`Mark option ${LETTERS[idx]} correct`} onClick={() => handleChange('correctAnswer', opt)}>
                        {correct ? '✓' : LETTERS[idx]}
                      </button>
                      {formData.optionImages[idx] && (
                        <span className="qf-opt-img">
                          <img src={formData.optionImages[idx]} alt="" />
                          <button type="button" aria-label="Remove image" onClick={() => {
                            const imgs = [...formData.optionImages]; imgs[idx] = '';
                            setFormData((prev) => ({ ...prev, optionImages: imgs }));
                          }}>×</button>
                        </span>
                      )}
                      <input className="ds-input" type="text" value={opt} placeholder={`Option ${LETTERS[idx]}`}
                        onChange={(e) => handleOptionChange(idx, e.target.value)} />
                      <label className="ds-icon-btn" title="Add image" style={{ cursor: 'pointer' }}>
                        <input type="file" accept="image/*" hidden onChange={(e) => handleFileUpload(e, 'option', idx)} />
                        {uploading.options[idx] ? <span className="ds-spinner" /> : '🖼️'}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}

            {formData.type === 'TRUE_FALSE' && (
              <div className="qf-tf">
                {['True', 'False'].map((val) => (
                  <button type="button" key={val} className={`qf-tf-card ${val === 'True' ? 'yes' : 'no'} ${formData.correctAnswer === val ? 'active' : ''}`}
                    onClick={() => handleChange('correctAnswer', val)}>
                    <span>{val === 'True' ? '✅' : '❌'}</span>{val}
                  </button>
                ))}
              </div>
            )}

            {TEXT_ANSWER_TYPES.includes(formData.type) && (
              <>
                <input className="ds-input" type="text" value={formData.correctAnswer}
                  onChange={(e) => handleChange('correctAnswer', e.target.value)}
                  placeholder={formData.type === 'SHORT_ANSWER' ? 'e.g. Mitochondria (exact match)' : 'Model answer for the host (optional)'} />
                <div className="ds-hint" style={{ marginTop: 6 }}>
                  {formData.type === 'SHORT_ANSWER' ? 'Students must type this answer.' : 'Shown to the host to judge spoken answers.'}
                </div>
              </>
            )}
          </div>

          <div className="qf-section" style={{ marginBottom: 0 }}>
            <div className="ds-label">Round, timing & scoring</div>
            <div className="qf-settings">
              <label className="qf-num"><span>Round</span><input className="ds-input" type="number" min="1" value={formData.round} onChange={num('round')} /></label>
              <label className="qf-num"><span>Time limit</span><div><input className="ds-input" type="number" min="5" value={formData.timeLimit} onChange={num('timeLimit')} /><em>s</em></div></label>
              <label className="qf-num"><span>Reading time</span><div><input className="ds-input" type="number" min="0" value={formData.readingTime} onChange={num('readingTime')} /><em>s</em></div></label>
              <label className="qf-num plus"><span>Points</span><input className="ds-input" type="number" min="0" value={formData.points} onChange={num('points')} /></label>
              <label className="qf-num minus"><span>Minus if wrong</span><input className="ds-input" type="number" min="0" value={formData.negativePoints} onChange={num('negativePoints')} /></label>
            </div>
          </div>

          {error && <div className="ds-alert bad" style={{ marginTop: 16 }}>⚠️ {error}</div>}
        </div>

        <div className="ds-modal-footer">
          <button type="button" onClick={onClose} className="ds-btn ds-btn-ghost">Cancel</button>
          <button type="submit" disabled={saving} className="ds-btn ds-btn-primary">
            {saving ? 'Saving…' : editingQuestion ? 'Save changes' : 'Add question'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default QuestionForm;
