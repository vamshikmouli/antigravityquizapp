import { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  // Becomes true once we've handled any ?sso= entry param, so normal token
  // validation doesn't race ahead of SSO exchange.
  const [ssoChecked, setSsoChecked] = useState(false);

  // Step 1: SSO entry. If the host app (JDV/Classo) opened us with
  // ?sso=<token>&source=<jdv|classo>, exchange it for a quiz-app session token,
  // store it exactly where normal login stores it, and strip the query params.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ssoToken = params.get('sso');
    const source = params.get('source');

    if (!ssoToken || !source) {
      setSsoChecked(true);
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/auth/sso', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: ssoToken, source })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'SSO login failed');

        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user);
      } catch (err) {
        console.error('SSO login failed:', err);
        // Fall through: user can still use normal login.
      } finally {
        // Remove the single-use SSO token from the URL so refresh/bookmark can't replay it.
        params.delete('sso');
        params.delete('source');
        const qs = params.toString();
        const newUrl = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
        setSsoChecked(true);
      }
    })();
  }, []);

  // Step 2: once SSO handling has run, validate whatever token we hold.
  useEffect(() => {
    if (!ssoChecked) return;

    if (token) {
      // Validate token and get user data
      fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Invalid token');
      })
      .then(userData => {
        setUser(userData);
        setLoading(false);
      })
      .catch(() => {
        logout();
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [token, ssoChecked]);

  const login = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const loginWithGoogle = async (credential) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Google login failed');
    }

    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const register = async (name, email, password) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, email, password })
    });

    const data = await res.json();
    
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    localStorage.setItem('token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, loginWithGoogle, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
