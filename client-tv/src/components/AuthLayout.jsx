/** Split-screen layout for sign-in / register: brand panel + form card. */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="ds-auth">
      <aside className="ds-auth-brand">
        <div className="ds-row" style={{ gap: 12 }}>
          <span className="ds-brand-icon">🎯</span>
          <strong style={{ fontSize: 18 }}>Quiz App</strong>
        </div>
        <div>
          <h2>Live quizzes your class <span className="ds-grad-text">will love.</span></h2>
          <ul>
            <li><span>✨</span>Describe a quiz — AI plans rounds and writes questions</li>
            <li><span>📺</span>Run it on the big screen, students play on phones</li>
            <li><span>🔔</span>Fair buzzer rounds, live leaderboards and music</li>
          </ul>
        </div>
        <span className="ds-muted" style={{ fontSize: 12.5 }}>Made for classrooms, clubs and quiz nights.</span>
      </aside>
      <main className="ds-auth-main">
        <div className="ds-auth-card">
          <h1>{title}</h1>
          {subtitle && <p className="ds-dim" style={{ margin: '4px 0 22px' }}>{subtitle}</p>}
          {children}
          {footer && <div className="ds-auth-footer">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
