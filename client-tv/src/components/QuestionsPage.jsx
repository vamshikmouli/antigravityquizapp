import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import QuestionForm from './QuestionForm';
import { useParams, Link } from 'react-router-dom';
import './QuestionManager.css';

function QuestionsPage() {
  const { quizId } = useParams();
  const { token } = useAuth();
  const [quiz, setQuiz] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [selectedRound, setSelectedRound] = useState('All');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // Import from Quiz State
  const [showImportModal, setShowImportModal] = useState(false);
  const [availableQuizzes, setAvailableQuizzes] = useState([]);
  const [selectedSourceQuiz, setSelectedSourceQuiz] = useState(null);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);

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

  const rounds = ['All', ...new Set(questions.map(q => q.round))].sort((a,b) => a - b);
  const filteredQuestions = selectedRound === 'All' 
    ? questions 
    : questions.filter(q => q.round === selectedRound);

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="header-info" style={{ display: 'flex', alignItems: 'center' }}>
          <Link to="/quizzes" className="top-left-back-btn">← Back</Link>
          <h1 style={{ marginBottom: '8px' }}>{quiz?.title || 'Quiz Details'}</h1>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => { fetchAvailableQuizzes(); setShowImportModal(true); }} 
            className="add-btn" 
            style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#6366f1', border: '1px solid #6366f1', marginLeft: '10px' }}
          >
            🔗 Import from Quiz
          </button>

          <a href="/templates/sample_questions.xlsx" download className="back-link" style={{ marginLeft: '10px' }}>
            📥 Sample Template
          </a>
          <button onClick={() => fileInputRef.current?.click()} className="add-btn" style={{ background: 'var(--color-success)', marginLeft: '10px' }} disabled={importing}>
            {importing ? 'Importing...' : '📁 Bulk Import'}
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImport} 
            style={{ display: 'none' }}
            accept=".xlsx,.xls,.csv"
          />
          <button onClick={() => { setEditingQuestion(null); setShowForm(true); }} className="add-btn" style={{ marginLeft: '10px' }}>
            + Add Question
          </button>
        </div>
      </header>

      <div className="filters">
        <label>Filter by Round:</label>
        <select value={selectedRound} onChange={(e) => setSelectedRound(e.target.value === 'All' ? 'All' : parseInt(e.target.value))}>
          {rounds.map(r => (
            <option key={r} value={r}>{r === 'All' ? 'All Rounds' : `Round ${r}`}</option>
          ))}
        </select>
      </div>

      {loading ? <div className="spinner"></div> : (
        <div className="questions-list">
          {filteredQuestions.length === 0 ? (
            <p className="no-data">No questions found. Add some!</p>
          ) : (
            filteredQuestions.map(q => (
              <div key={q.id} className="question-item bounce-in">
                <div className="q-info">
                  <div className="q-primary-row">
                    {q.imageUrl && (
                      <div className="q-thumbnail">
                        <img src={q.imageUrl} alt="" />
                      </div>
                    )}
                    <div className="q-text-content">
                      <span className="q-badge">{q.type}</span>
                      <span className="q-round">Round {q.round}</span>
                      <h3>{q.text}</h3>
                      <p className="q-details">{q.timeLimit}s | {q.points}pts</p>
                    </div>
                  </div>
                </div>
                <div className="q-actions">
                  <button onClick={() => { setEditingQuestion(q); setShowForm(true); }}>Edit</button>
                  <button onClick={() => handleDelete(q.id)} className="delete-btn">Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Import from Quiz Modal */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content question-form-modal">
            <div className="modal-header">
              <h2>🔗 Import Questions from Another Quiz</h2>
              <button 
                className="close-btn" 
                onClick={() => { setShowImportModal(false); setSelectedSourceQuiz(null); }}
              >
                &times;
              </button>
            </div>
            
            <div className="modern-form">
              <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
                Select one of your existing quizzes to copy all its questions into this quiz.
              </p>

              {loadingQuizzes ? (
                <div className="spinner"></div>
              ) : (
                <div className="quiz-import-list">
                  {availableQuizzes.length === 0 ? (
                    <p style={{ textAlign: 'center', padding: '40px' }}>No other quizzes found.</p>
                  ) : (
                    availableQuizzes.map(qz => (
                      <div 
                        key={qz.id} 
                        className={`quiz-import-item ${selectedSourceQuiz?.id === qz.id ? 'selected' : ''}`}
                        onClick={() => setSelectedSourceQuiz(qz)}
                      >
                        <div className="import-quiz-info">
                          <h4>{qz.title}</h4>
                          <p>{qz.description || 'No description'}</p>
                        </div>
                        <div className="import-question-count">
                          {qz._count.questions} Questions
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className="modal-actions">
                <button 
                  className="cancel-btn" 
                  onClick={() => { setShowImportModal(false); setSelectedSourceQuiz(null); }}
                >
                  Cancel
                </button>
                <button 
                  className="save-btn" 
                  disabled={!selectedSourceQuiz || importing}
                  onClick={handleImportFromQuiz}
                >
                  {importing ? 'Importing...' : 'Confirm Import'}
                </button>
              </div>
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
        />
      )}
    </div>
  );
}

export default QuestionsPage;
