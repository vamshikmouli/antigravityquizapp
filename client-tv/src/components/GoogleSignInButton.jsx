import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

// Loads the Google Identity Services script once (shared across mounts).
let gisPromise = null;
function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Sign-In'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

/**
 * Renders the official Google Sign-In button, but only when the server reports
 * Google login is configured (GET /api/auth/config -> { googleEnabled, googleClientId }).
 * On a successful credential it exchanges it via AuthContext and navigates to the dashboard.
 */
export default function GoogleSignInButton({ onError }) {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const btnRef = useRef(null);
  const [enabled, setEnabled] = useState(false);
  const [clientId, setClientId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/config')
      .then((r) => r.json())
      .then((cfg) => {
        if (cancelled) return;
        if (cfg.googleEnabled && cfg.googleClientId) {
          setClientId(cfg.googleClientId);
          setEnabled(true);
        }
      })
      .catch(() => { /* leave Google disabled */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!enabled || !clientId || !btnRef.current) return;
    let cancelled = false;

    loadGis()
      .then(() => {
        if (cancelled || !btnRef.current) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (response) => {
            try {
              await loginWithGoogle(response.credential);
              navigate('/dashboard');
            } catch (err) {
              onError?.(err.message || 'Google login failed');
            }
          }
        });
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'signin_with'
        });
      })
      .catch((err) => onError?.(err.message));

    return () => { cancelled = true; };
  }, [enabled, clientId]);

  if (!enabled) return null;

  return (
    <div className="google-signin">
      <div className="auth-divider"><span>or</span></div>
      <div ref={btnRef} style={{ display: 'flex', justifyContent: 'center' }} />
    </div>
  );
}
