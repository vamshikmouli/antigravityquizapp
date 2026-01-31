import { useState, useEffect } from 'react';
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

  const rounds = ['All', ...new Set(questions.map(q => q.round))].sort((a,b) => a - b);
  const filteredQuestions = selectedRound === 'All' 
    ? questions 
    : questions.filter(q => q.round === selectedRound);

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div>
          <h1 style={{ marginBottom: '8px' }}>{quiz?.title || 'Quiz Details'}</h1>
          <p style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>{questions.length} Questions</p>
        </div>
        <div className="header-actions">
          <Link to="/quizzes" className="back-link">← All Quizzes</Link>
          <button onClick={() => { setEditingQuestion(null); setShowForm(true); }} className="add-btn">
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
                  <span className="q-badge">{q.type}</span>
                  <span className="q-round">Round {q.round}</span>
                  <h3>{q.text}</h3>
                  <p className="q-details">{q.timeLimit}s | {q.points}pts</p>
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
