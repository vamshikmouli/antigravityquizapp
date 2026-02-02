import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import './QuestionManager.css';

const QUESTION_TYPES = {
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  BUZZER: 'BUZZER',
  TRUE_FALSE: 'TRUE_FALSE',
  SHORT_ANSWER: 'SHORT_ANSWER'
};

function QuestionForm({ onClose, onSave, editingQuestion = null, quizId = null }) {
  const { token } = useAuth();
  const [formData, setFormData] = useState({
    text: editingQuestion?.text || '',
    type: editingQuestion?.type || 'MULTIPLE_CHOICE',
    options: editingQuestion?.options || ['', '', '', ''],
    correctAnswer: editingQuestion?.correctAnswer || '',
    points: editingQuestion?.points || 100,
    negativePoints: editingQuestion?.negativePoints || 0,
    timeLimit: editingQuestion?.timeLimit || 30,
    round: editingQuestion?.round || 1,
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
      } else if (value === 'SHORT_ANSWER') {
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
    const newOptions = [...formData.options];
    newOptions[index] = value;
    setFormData(prev => ({ ...prev, options: newOptions }));
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
    if (formData.type !== 'SHORT_ANSWER' && !formData.correctAnswer) return setError('Correct answer is required');
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
        body: JSON.stringify(formData)
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

  return (
    <div className="modal-overlay">
      <div className="modal-content question-form-modal">
        <div className="modal-header">
          <h2>{editingQuestion ? 'Edit Question' : 'Add New Question'}</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit} className="modern-form">
          <div className="form-section">
            <h3 className="section-title">📝 Content</h3>
            
            {/* Row 1: Type and Round */}
            <div className="form-row">
              <div className="form-group half">
                <label>Question Type</label>
                <div className="select-wrapper">
                  <select 
                    value={formData.type} 
                    onChange={(e) => handleChange('type', e.target.value)}
                  >
                    <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                    <option value="BUZZER">Buzzer (Fastest Finger)</option>
                    <option value="TRUE_FALSE">True / False</option>
                    <option value="SHORT_ANSWER">Short Answer</option>
                  </select>
                </div>
              </div>
              
              <div className="form-group half">
                <label>Round Number</label>
                <input 
                  type="number" 
                  min="1"
                  value={formData.round}
                  onChange={(e) => handleChange('round', parseInt(e.target.value))}
                  className="modern-input"
                />
              </div>
            </div>

            {/* Question Text */}
            <div className="form-group big-text">
              <label>Question Text</label>
              <textarea 
                value={formData.text}
                onChange={(e) => handleChange('text', e.target.value)}
                rows="3"
                placeholder="What is the capital of..."
                className="modern-textarea"
              />
            </div>

            {/* Question Image */}
            <div className="form-group">
              <label>Question Image (Optional)</label>
              <div className="upload-container">
                {formData.imageUrl && (
                  <div className="preview-box">
                    <img src={formData.imageUrl} alt="Question preview" />
                    <button type="button" className="remove-img" onClick={() => handleChange('imageUrl', '')}>×</button>
                  </div>
                )}
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e, 'question')}
                  className="file-input"
                  id="q-image"
                />
                <label htmlFor="q-image" className="file-label">
                  {uploading.question ? 'Uploading...' : '📁 Choose Image'}
                </label>
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3 className="section-title">✨ Answer & Options</h3>

            {/* Options & Answer based on Type */}
            {['MULTIPLE_CHOICE', 'BUZZER'].includes(formData.type) && (
              <div className="options-grid">
                {formData.options.map((opt, idx) => (
                  <div key={idx} className={`option-card ${formData.correctAnswer === opt && opt !== '' ? 'correct-selected' : ''}`}>
                    <div className="option-header">
                      <span className="option-label">Option {String.fromCharCode(65 + idx)}</span>
                      <input 
                        type="radio"
                        name="correctAnswer"
                        checked={formData.correctAnswer === opt && opt !== ''}
                        onChange={() => handleChange('correctAnswer', opt)}
                        disabled={!opt}
                        className="custom-radio"
                      />
                    </div>
                    
                    {formData.optionImages[idx] && (
                      <div className="option-preview">
                        <img src={formData.optionImages[idx]} alt="" />
                        <button type="button" onClick={() => {
                          const newImgs = [...formData.optionImages];
                          newImgs[idx] = '';
                          setFormData(prev => ({ ...prev, optionImages: newImgs }));
                        }}>×</button>
                      </div>
                    )}

                    <div className="option-controls">
                      <input 
                        type="text" 
                        value={opt}
                        onChange={(e) => handleOptionChange(idx, e.target.value)}
                        placeholder={`Answer ${String.fromCharCode(65 + idx)}`}
                        className="modern-input"
                      />
                      <label className="opt-file-btn">
                        <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'option', idx)} />
                        {uploading.options[idx] ? '...' : '🖼️'}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {formData.type === 'TRUE_FALSE' && (
              <div className="true-false-wrapper">
                {['True', 'False'].map(val => (
                  <div 
                    key={val} 
                    className={`tf-card ${formData.correctAnswer === val ? 'selected' : ''}`}
                    onClick={() => handleChange('correctAnswer', val)}
                  >
                    <div className="tf-icon">{val === 'True' ? '✅' : '❌'}</div>
                    <span>{val}</span>
                  </div>
                ))}
              </div>
            )}

            {formData.type === 'SHORT_ANSWER' && (
              <div className="form-group">
                <label>Correct Answer (Exact Match)</label>
                <input 
                  type="text" 
                  value={formData.correctAnswer}
                  onChange={(e) => handleChange('correctAnswer', e.target.value)}
                  className="modern-input"
                  placeholder="e.g. Paris"
                />
              </div>
            )}
          </div>

          <div className="form-section">
            <h3 className="section-title">⚙️ Settings</h3>
            {/* Row 2: Settings */}
            <div className="form-row">
              <div className="form-group third">
                <label>Time Limit (s)</label>
                <input 
                  type="number" 
                  min="5"
                  value={formData.timeLimit}
                  onChange={(e) => handleChange('timeLimit', parseInt(e.target.value))}
                  className="modern-input"
                />
              </div>
              
              <div className="form-group third">
                <label>Points</label>
                <input 
                  type="number" 
                  value={formData.points}
                  onChange={(e) => handleChange('points', parseInt(e.target.value))}
                  className="modern-input"
                />
              </div>

              <div className="form-group third">
                <label>Neg. Points (<span style={{color:'#ff6b6b'}}>-</span>)</label>
                <input 
                  type="number" 
                  value={formData.negativePoints}
                  onChange={(e) => handleChange('negativePoints', parseInt(e.target.value))}
                  className="modern-input"
                />
              </div>

              <div className="form-group third">
                <label>Reading Time (s)</label>
                <input 
                  type="number" 
                  min="0"
                  value={formData.readingTime}
                  onChange={(e) => handleChange('readingTime', parseInt(e.target.value))}
                  className="modern-input"
                  placeholder="Buzzer delay"
                />
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-btn">Cancel</button>
            <button type="submit" disabled={saving} className="primary-btn save-btn">
              {saving ? 'Saving...' : 'Save Question'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default QuestionForm;
