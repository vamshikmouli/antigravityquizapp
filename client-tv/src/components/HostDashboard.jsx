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
          <p className="subtitle" style={{ fontSize: '1.2rem', opacity: 0.7 }}>Quiz Host Dashboard</p>
        </div>
        <button onClick={logout} className="delete-btn" style={{ padding: '12px 24px', fontSize: '1rem', borderRadius: '12px' }}>Logout</button>
      </header>

      <div className="dashboard-cards-grid" style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', 
        gap: '40px', 
        marginTop: '60px' 
      }}>
        <div className="card-glass" style={{ 
          padding: '50px', 
          borderRadius: '32px', 
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '350px'
        }}>
          <div>
            <span style={{ fontSize: '64px', display: 'block', marginBottom: '20px' }}>📚</span>
            <h2 style={{ fontSize: '2.5rem', marginBottom: '20px' }}>Question Bank</h2>
            <p style={{ fontSize: '1.2rem', marginBottom: '40px', opacity: 0.7, lineHeight: 1.6 }}>
              Manage your collection of questions. Add new questions, edit existing ones, or import from CSV.
            </p>
          </div>
          <Link to="/quizzes">
            <button className="join-button-tv" style={{ width: '100%', fontSize: '1.5rem' }}>Manage Quizzes</button>
          </Link>
        </div>

        <div className="card-glass" style={{ 
          padding: '50px', 
          borderRadius: '32px', 
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '350px'
        }}>
          <div>
            <span style={{ fontSize: '64px', display: 'block', marginBottom: '20px' }}>🚀</span>
            <h2 style={{ fontSize: '2.5rem', marginBottom: '20px' }}>Start Session</h2>
            <p style={{ fontSize: '1.2rem', marginBottom: '40px', opacity: 0.7, lineHeight: 1.6 }}>
              Create a new quiz session, select questions, and launch the game on the big screen.
            </p>
          </div>
          <Link to="/create-session">
            <button className="join-button-tv" style={{ width: '100%', fontSize: '1.5rem', background: 'var(--grad-success)' }}>Create New Session</button>
          </Link>
        </div>

        <div className="card-glass" style={{ 
          padding: '50px', 
          borderRadius: '32px', 
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.03)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minHeight: '350px'
        }}>
          <div>
            <span style={{ fontSize: '64px', display: 'block', marginBottom: '20px' }}>🎵</span>
            <h2 style={{ fontSize: '2.5rem', marginBottom: '20px' }}>Music Settings</h2>
            <p style={{ fontSize: '1.2rem', marginBottom: '40px', opacity: 0.7, lineHeight: 1.6 }}>
              Upload and manage background music for different stages of your quiz.
            </p>
          </div>
          <Link to="/music-settings">
            <button className="join-button-tv" style={{ width: '100%', fontSize: '1.5rem', background: 'var(--grad-primary)' }}>Manage Music</button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default HostDashboard;
