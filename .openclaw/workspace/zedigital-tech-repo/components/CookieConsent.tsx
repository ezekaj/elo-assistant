import React, { useState, useEffect } from 'react';

const CONSENT_KEY = 'ze-consent-acknowledged';

const CookieConsent: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const acknowledged = localStorage.getItem(CONSENT_KEY);
    if (!acknowledged) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'rgba(3, 3, 3, 0.95)',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        flexWrap: 'wrap',
        animation: 'consentSlideUp 0.4s ease-out',
      }}
    >
      <style>{`
        @keyframes consentSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      <p
        style={{
          fontFamily: "var(--font-code, 'JetBrains Mono', monospace)",
          fontSize: '0.7rem',
          color: 'rgba(255, 255, 255, 0.6)',
          margin: 0,
          maxWidth: '600px',
          lineHeight: 1.6,
        }}
      >
        This site uses third-party services for the contact form and AI chat assistant.
        No tracking cookies are used.{' '}
        <a
          href="/privacy.html"
          style={{
            color: '#00f3ff',
            textDecoration: 'none',
          }}
        >
          Learn more
        </a>
      </p>
      <button
        onClick={handleAccept}
        style={{
          background: 'rgba(255, 0, 60, 0.1)',
          border: '1px solid rgba(255, 0, 60, 0.3)',
          color: '#ff003c',
          fontFamily: "var(--font-code, 'JetBrains Mono', monospace)",
          fontSize: '0.65rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          padding: '8px 20px',
          cursor: 'pointer',
          transition: 'all 0.3s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255, 0, 60, 0.2)';
          e.currentTarget.style.borderColor = 'rgba(255, 0, 60, 0.6)';
          e.currentTarget.style.boxShadow = '0 0 20px rgba(255, 0, 60, 0.2)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255, 0, 60, 0.1)';
          e.currentTarget.style.borderColor = 'rgba(255, 0, 60, 0.3)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        Accept
      </button>
    </div>
  );
};

export default CookieConsent;
