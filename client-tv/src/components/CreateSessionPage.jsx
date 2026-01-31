import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import './QuestionManager.css';

function CreateSessionPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const res = await fetch('/api/questions', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setQuestions(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchQuestions();
  }, [token]);

  const toggleSelection = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(qId => qId !== id) : [...prev, id]
    );
  };

  const handleStartSession = async () => {
    if (selectedIds.length === 0) return alert('Select at least one question');

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          questionIds: selectedIds,
          settings: {
            musicEnabled: true,
            showLiveResults: true
          }
        })
      });

      const session = await res.json();
      // Navigate to Lobby with session data
      // We need to pass role='host' to prompt appropriate UI
      // But App.jsx handles routing based on socket events usually.
      // We should probably just navigate to '/' and let JoinSession auto-join or similar?
      // Actually, Host needs to join the socket room.
      // So we will navigate to a special route or trigger socket join here? 
      // Existing App.jsx uses 'join-session' socket emit.
      // Let's redirect to a "HostLobby" route that handles this, or simply back to Home and auto-fill?
      // Better: Redirect to /lobby with state
      
      // Since App.jsx is structured around 'sessionCode' state, we might need to rely on the user entering the code 
      // OR we can update the implementation to allow direct navigation.
      
      // For now, let's redirect to the Join screen and maybe auto-fill if possible, 
      // OR better, we simply show the code and ask them to Connect. 
      // Wait, the host IS the TV app.
      // So we should navigate to /host-connect/${session.code} ?
      
      // Let's just go to a success screen or reuse JoinSession
      navigate('/lobby-connect', { state: { code: session.code, isHost: true } });
      
    } catch (err) {
      console.error(err);
      alert('Failed to start session');
    }
  };

  // Group questions by round
  const questionsByRound = questions.reduce((acc, q) => {
    if (!acc[q.round]) acc[q.round] = [];
    acc[q.round].push(q);
    return acc;
  }, {});

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Create New Session</h1>
        <Link to="/" className="back-link">Cancel</Link>
      </header>

      <div className="session-wizard">
        <div className="wizard-step">
          <h2>Select Questions</h2>
          <p>Choose questions to include in this quiz session.</p>
          
          <div className="questions-selection-list">
            {Object.keys(questionsByRound).sort((a,b)=>a-b).map(round => (
              <div key={round} className="round-group">
                <h3>Round {round}</h3>
                {questionsByRound[round].map(q => (
                  <div key={q.id} className={`selection-item ${selectedIds.includes(q.id) ? 'selected' : ''}`} onClick={() => toggleSelection(q.id)}>
                    <div className="selection-checkbox"></div>
                    <div className="selection-info">
                      <span className="type-badge">{q.type.replace('_', ' ')}</span>
                      <div className="selection-text">{q.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="wizard-actions">
          <div className="status">
            <strong>{selectedIds.length}</strong> questions selected
          </div>
          <button onClick={handleStartSession} className="launch-btn">
            Launch Quiz 🚀
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateSessionPage;
