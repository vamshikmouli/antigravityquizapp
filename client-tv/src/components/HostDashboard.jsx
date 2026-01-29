import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './QuestionManager.css';

function HostDashboard() {
  const { user, logout } = useAuth();

  return (
    <div className="dashboard-container fade-in">
      <header className="dashboard-header">
        <div>
          <h1>Welcome, {user?.name}</h1>
          <p className="subtitle">Quiz Host Dashboard</p>
        </div>
        <button onClick={logout} className="delete-btn" style={{ padding: '8px 16px' }}>Logout</button>
      </header>

      <div className="dashboard-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginTop: '40px' }}>
        <div className="card dashboard-card" style={{ background: 'rgba(255,255,255,0.1)', padding: '30px', borderRadius: '20px' }}>
          <h2>📚 Question Bank</h2>
          <p style={{ margin: '15px 0 25px', opacity: 0.8 }}>Manage your collection of questions. Add new questions, edit existing ones, or import from CSV.</p>
          <Link to="/questions">
            <button className="primary-btn">Manage Questions</button>
          </Link>
        </div>

        <div className="card dashboard-card" style={{ background: 'rgba(255,255,255,0.1)', padding: '30px', borderRadius: '20px' }}>
          <h2>🚀 Start Session</h2>
          <p style={{ margin: '15px 0 25px', opacity: 0.8 }}>Create a new quiz session, select questions, and launch the game on the big screen.</p>
          <Link to="/create-session">
            <button className="primary-btn" style={{ background: 'var(--color-success)' }}>Create New Session</button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default HostDashboard;
