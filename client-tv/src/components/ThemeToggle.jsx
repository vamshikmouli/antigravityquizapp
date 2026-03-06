import React from 'react';
import { useTheme } from '../context/ThemeContext';

const ThemeToggle = ({ style }) => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button 
      onClick={toggleTheme}
      style={{
        background: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        fontSize: '1.5rem',
        cursor: 'pointer',
        padding: '12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        transition: 'all 0.3s ease',
        width: '56px',
        height: '56px',
        boxShadow: 'var(--shadow-glow)',
        ...style
      }}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="theme-toggle-btn"
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
};

export default ThemeToggle;
