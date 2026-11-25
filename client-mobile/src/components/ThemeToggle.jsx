import React from 'react';
import { useTheme } from '../context/ThemeContext';

// Line icons (Lucide style) so the toggle matches the rest of the app.
const SUN = <><circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" /></>;
const MOON = <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />;

const ThemeToggle = ({ style }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button type="button" 
      onClick={toggleTheme}
      style={{
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        fontSize: '1.2rem',
        color: 'inherit',
        cursor: 'pointer',
        padding: '8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        transition: 'all 0.3s ease',
        width: '40px',
        height: '40px',
        ...style
      }}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="theme-toggle-btn"
    >
      <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {theme === 'dark' ? SUN : MOON}
      </svg>
    </button>
  );
};

export default ThemeToggle;
