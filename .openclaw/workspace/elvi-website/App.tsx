import React, { useState, useEffect } from 'react';
import World3D from './components/World3D';
import CustomCursor from './components/CustomCursor';
import CookieConsent from './components/CookieConsent';
import { Instagram, Github, Linkedin, Twitter } from 'lucide-react';

const NAV_LABELS = ['HOME', 'SERVICES', 'WORK', 'CONTACT'];

const App: React.FC = () => {
  const [activeSection, setActiveSection] = useState(0);

  useEffect(() => {
    const handleSectionChange = (e: Event) => {
      setActiveSection((e as CustomEvent).detail);
    };
    window.addEventListener('section-change', handleSectionChange);
    return () => window.removeEventListener('section-change', handleSectionChange);
  }, []);

  const navigateTo = (idx: number) => {
    window.dispatchEvent(new CustomEvent('navigate-section', { detail: idx }));
  };

  return (
    <>
      {/* OVERLAYS */}
      <div className="scanlines" />
      <div className="vignette" />
      <div className="noise" />

      {/* Minimal HUD - clean corner branding only */}
      <div className="hud-minimal">
        <span className="hud-brand">Z.E DIGITAL</span>
      </div>

      {/* Dot Navigation */}
      <nav className="dot-nav" aria-label="Section navigation">
        {NAV_LABELS.map((label, i) => (
          <button
            key={label}
            className={`dot-nav-item ${activeSection === i ? 'active' : ''}`}
            onClick={() => navigateTo(i)}
            aria-label={`Navigate to ${label}`}
          >
            <span className="dot-nav-label">{label}</span>
          </button>
        ))}
      </nav>

      {/* Custom Cursor */}
      <CustomCursor />

      {/* 3D World */}
      <World3D />

      {/* Scroll proxy */}
      <div className="scroll-proxy" />

      {/* Cookie Consent Banner */}
      <CookieConsent />

      {/* Privacy Policy link */}
      <a
        href="/privacy.html"
        style={{
          position: 'fixed',
          bottom: '1rem',
          left: '2rem',
          zIndex: 20,
          fontFamily: 'var(--font-code)',
          fontSize: '0.6rem',
          color: 'rgba(255, 255, 255, 0.35)',
          textDecoration: 'none',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          transition: 'color 0.3s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(0, 243, 255, 0.7)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255, 255, 255, 0.35)')}
      >
        Privacy Policy
      </a>

      {/* Social Links - bottom left */}
      <div
        style={{
          position: 'fixed',
          bottom: '2.5rem',
          left: '2rem',
          zIndex: 20,
          display: 'flex',
          gap: '1rem',
        }}
      >
        {[
          { icon: Instagram, url: 'https://instagram.com/zedigitaltech', label: 'Instagram' },
          { icon: Github, url: 'https://github.com/zedigitaltech', label: 'GitHub' },
          { icon: Linkedin, url: 'https://linkedin.com/company/zedigitaltech', label: 'LinkedIn' },
          { icon: Twitter, url: 'https://x.com/zedigitaltech', label: 'X/Twitter' },
        ].map((social) => (
          <a
            key={social.label}
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={social.label}
            style={{
              color: 'rgba(255, 255, 255, 0.35)',
              transition: 'color 0.3s, transform 0.2s',
              display: 'flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'rgba(0, 243, 255, 0.7)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.35)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <social.icon size={14} />
          </a>
        ))}
      </div>
    </>
  );
};

export default App;
