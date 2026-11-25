import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from './GoogleSignInButton';
import AuthLayout from './AuthLayout';

function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to manage and run your quizzes." footer={<>New here? <Link to="/register" className="ds-link">Create an account</Link></>}>
      {error && <div className="ds-alert bad" style={{ marginBottom: 16 }}>⚠️ {error}</div>}
      <form onSubmit={handleSubmit}>
        <label className="ds-field">
          <span className="ds-label">Email</span>
          <input className="ds-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@school.edu" required />
        </label>
        <label className="ds-field">
          <span className="ds-label">Password</span>
          <input className="ds-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" required />
        </label>
        <button type="submit" disabled={isLoading} className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block" style={{ marginTop: 6 }}>
          {isLoading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <GoogleSignInButton onError={setError} />
    </AuthLayout>
  );
}

export default LoginScreen;
