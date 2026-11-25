import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from './GoogleSignInButton';
import AuthLayout from './AuthLayout';

function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await register(name, email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout title="Create your account" subtitle="Free for teachers and quiz hosts." footer={<>Already have an account? <Link to="/login" className="ds-link">Sign in</Link></>}>
      {error && <div className="ds-alert bad" style={{ marginBottom: 16 }}>⚠️ {error}</div>}
      <form onSubmit={handleSubmit}>
        <label className="ds-field">
          <span className="ds-label">Full name</span>
          <input className="ds-input" type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="e.g. Priya Sharma" required />
        </label>
        <label className="ds-field">
          <span className="ds-label">Email</span>
          <input className="ds-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@school.edu" required />
        </label>
        <label className="ds-field">
          <span className="ds-label">Password</span>
          <input className="ds-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" required />
        </label>
        <button type="submit" disabled={isLoading} className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block" style={{ marginTop: 6 }}>
          {isLoading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <GoogleSignInButton onError={setError} />
    </AuthLayout>
  );
}

export default RegisterScreen;
