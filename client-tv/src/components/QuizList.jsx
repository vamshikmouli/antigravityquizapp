import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './QuestionManager.css';

function QuizList() {
  const { token } = useAuth();
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newQuizTitle, setNewQuizTitle] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchQuizzes = async () => {
    try {
      const res = await fetch('/api/quizzes', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setQuizzes(data);
    } catch (err) {
      console.error('Fetch quizzes error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuizzes();
  }, [token]);

  const handleCreateQuiz = async (e) => {
    e.preventDefault();
    if (!newQuizTitle.trim()) return;

    try {
      const res = await fetch('/api/quizzes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: newQuizTitle })
      });

      if (res.ok) {
        setNewQuizTitle('');
        setShowAddModal(false);
        fetchQuizzes();
      }
    } catch (err) {
      console.error('Create quiz error:', err);
    }
  };

  const handleDeleteQuiz = async (id) => {
    if (!confirm('Are you sure you want to delete this quiz? All questions inside will be deleted too.')) return;

    try {
      const res = await fetch(`/api/quizzes/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        fetchQuizzes();
      }
    } catch (err) {
      console.error('Delete quiz error:', err);
    }
  };

  return (
    <div className="dashboard-container fade-in">
      <header className="dashboard-header">
        <div className="header-info" style={{ display: 'flex', alignItems: 'center' }}>
          <Link to="/dashboard" className="top-left-back-btn">← Back</Link>
          <h1>My Quizzes</h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowAddModal(true)} className="add-btn">+ New Quiz</button>
        </div>
      </header>

      {loading ? (
        <div className="loader-container"><div className="spinner"></div></div>
      ) : (
        <div className="questions-list">
          {quizzes.length === 0 ? (
            <div className="no-data">
              <p>You haven't created any quizzes yet.</p>
              <button onClick={() => setShowAddModal(true)} className="primary-btn" style={{ marginTop: '20px' }}>Create Your First Quiz</button>
            </div>
          ) : (
            quizzes.map(quiz => (
              <div key={quiz.id} className="question-item bounce-in">
                <div className="q-info">
                  <span className="q-badge" style={{ background: 'var(--grad-primary)' }}>Quiz</span>
                  <span className="q-round">{quiz._count.questions} Questions</span>
                  <h3 style={{ fontSize: '1.8rem', margin: '10px 0' }}>{quiz.title}</h3>
                  <p className="q-details">{quiz.description || 'No description'}</p>
                </div>
                <div className="q-actions">
                  <Link to={`/quizzes/${quiz.id}`} className="view-btn">
                    <button style={{ background: 'var(--color-primary)', color: 'white', padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Manage Questions</button>
                  </Link>
                  <button onClick={() => handleDeleteQuiz(quiz.id)} className="delete-btn" style={{ marginLeft: '10px' }}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content card-glass" style={{ maxWidth: '500px', width: '90%' }}>
            <h2>Create New Quiz</h2>
            <form onSubmit={handleCreateQuiz} style={{ marginTop: '20px' }}>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label>Quiz Title</label>
                <input 
                  type="text" 
                  value={newQuizTitle} 
                  onChange={(e) => setNewQuizTitle(e.target.value)}
                  placeholder="e.g. Science Midterm"
                  autoFocus
                  required
                />
              </div>
              <div className="modal-footer" style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="secondary-btn" style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'white' }}>Cancel</button>
                <button type="submit" className="primary-btn" style={{ background: 'var(--grad-primary)' }}>Create Quiz</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuizList;
