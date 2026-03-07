import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Send, ChevronDown } from 'lucide-react';
import { SERVICES, PROJECTS } from '../constants';
import ServiceCard from './ServiceCard';
import ProjectCard from './ProjectCard';
import ContactCard from './ContactCard';
import ProjectDetailModal from './ProjectDetailModal';
import { Project } from '../types';

const CONFIG = {
  starCount: 150,
  starCountMobile: 50,
  zGap: 550,
  sectionGap: 1200, // larger gap between sections for clear separation
  camSpeed: 2.5,
};

const SECTION_TEXTS = ['Z.E DIGITAL', 'SERVICES', 'PORTFOLIO', 'CONTACT'];

interface ItemDef {
  type: 'text' | 'card' | 'star' | 'contact-teaser' | 'section-divider' | 'scroll-hint';
  x: number;
  y: number;
  rot: number;
  baseZ: number;
  content?: string;
  textContent?: string;
}

const World3D: React.FC = () => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rafId = useRef<number>(0);

  const stateRef = useRef({
    scroll: 0,
    velocity: 0,
    targetSpeed: 0,
    mouseX: 0,
    mouseY: 0,
  });

  const [items, setItems] = useState<ItemDef[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [showScrollHint, setShowScrollHint] = useState(true);
  const loopSizeRef = useRef(0);
  const lastTimeRef = useRef(0);
  const sectionBoundariesRef = useRef<number[]>([]);
  const lenisRef = useRef<any>(null);

  // Build items list
  useEffect(() => {
    const mobile = window.innerWidth < 768 || 'ontouchstart' in window;
    setIsMobile(mobile);

    const builtItems: ItemDef[] = [];
    let zPos = 0;
    const sectionStarts: number[] = [];

    // HOME section
    sectionStarts.push(zPos);

    // Hero big text
    builtItems.push({ type: 'text', x: 0, y: 0, rot: 0, baseZ: -zPos, textContent: SECTION_TEXTS[0] });
    zPos += CONFIG.zGap;

    // Scroll hint (below hero text)
    builtItems.push({ type: 'scroll-hint', x: 0, y: 180, rot: 0, baseZ: -zPos + 200 });

    // Hero card
    builtItems.push({ type: 'card', x: 0, y: 0, rot: 0, baseZ: -zPos, content: 'hero' });
    zPos += CONFIG.zGap;

    // Section divider before services
    zPos += CONFIG.sectionGap;

    // SERVICES section
    sectionStarts.push(zPos);

    // "SERVICES" text
    builtItems.push({ type: 'text', x: 0, y: 0, rot: 0, baseZ: -zPos, textContent: SECTION_TEXTS[1] });
    zPos += CONFIG.zGap;

    // Service cards - staggered left/right lanes
    SERVICES.forEach((_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const spreadX = side * (mobile ? 140 : 350);
      const spreadY = (i % 2 === 0 ? -1 : 1) * (mobile ? 30 : 60);
      builtItems.push({
        type: 'card', x: spreadX, y: spreadY, rot: (Math.random() - 0.5) * 12,
        baseZ: -zPos, content: `service-${i}`,
      });
      zPos += CONFIG.zGap;
    });

    // Section divider before portfolio
    zPos += CONFIG.sectionGap;

    // PORTFOLIO section
    sectionStarts.push(zPos);

    // "PORTFOLIO" text
    builtItems.push({ type: 'text', x: 0, y: 0, rot: 0, baseZ: -zPos, textContent: SECTION_TEXTS[2] });
    zPos += CONFIG.zGap;

    // Project cards - staggered left/right lanes (same as services)
    PROJECTS.forEach((_, i) => {
      const side = i % 2 === 0 ? -1 : 1;
      const spreadX = side * (mobile ? 140 : 350);
      const spreadY = (i % 2 === 0 ? -1 : 1) * (mobile ? 30 : 60);
      builtItems.push({
        type: 'card', x: spreadX, y: spreadY, rot: (Math.random() - 0.5) * 12,
        baseZ: -zPos, content: `project-${i}`,
      });
      zPos += CONFIG.zGap;
    });

    // Section divider before contact
    zPos += CONFIG.sectionGap;

    // CONTACT section
    sectionStarts.push(zPos);

    // "CONTACT" text
    builtItems.push({ type: 'text', x: 0, y: 0, rot: 0, baseZ: -zPos, textContent: SECTION_TEXTS[3] });
    zPos += CONFIG.zGap;

    // Contact teaser card
    builtItems.push({ type: 'contact-teaser', x: 0, y: 0, rot: 0, baseZ: -zPos, content: 'contact-teaser' });
    zPos += CONFIG.sectionGap * 3; // big buffer before looping back to Home

    // Stars
    const starCount = mobile ? CONFIG.starCountMobile : CONFIG.starCount;
    for (let i = 0; i < starCount; i++) {
      builtItems.push({
        type: 'star',
        x: (Math.random() - 0.5) * 3000,
        y: (Math.random() - 0.5) * 3000,
        rot: 0,
        baseZ: -Math.random() * zPos,
      });
    }

    sectionBoundariesRef.current = sectionStarts;
    loopSizeRef.current = zPos;
    setItems(builtItems);
  }, []);

  // Hide scroll hint after first scroll
  useEffect(() => {
    const hideHint = () => {
      setShowScrollHint(false);
      window.removeEventListener('scroll', hideHint);
      window.removeEventListener('wheel', hideHint);
      window.removeEventListener('touchmove', hideHint);
    };
    window.addEventListener('scroll', hideHint);
    window.addEventListener('wheel', hideHint);
    window.addEventListener('touchmove', hideHint);
    // Auto hide after 5 seconds
    const timer = setTimeout(() => setShowScrollHint(false), 5000);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', hideHint);
      window.removeEventListener('wheel', hideHint);
      window.removeEventListener('touchmove', hideHint);
    };
  }, []);

  // ESC key to close overlays
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContactOpen(false);
        setSelectedProject(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Stop Lenis scroll when contact modal is open
  useEffect(() => {
    if (contactOpen && lenisRef.current) {
      lenisRef.current.stop();
    } else if (!contactOpen && lenisRef.current) {
      lenisRef.current.start();
    }
  }, [contactOpen]);

  // Animation loop - CDN Lenis
  useEffect(() => {
    if (items.length === 0) return;

    const LenisClass = (window as any).Lenis;
    if (!LenisClass) return;

    const lenis = new LenisClass({
      smooth: true,
      lerp: isMobile ? 0.12 : 0.08,
      direction: 'vertical',
      gestureDirection: 'vertical',
      smoothTouch: true,
      touchMultiplier: isMobile ? 3 : 2,
      normalizeWheel: true,
    });
    lenisRef.current = lenis;

    let currentSection = 0;

    lenis.on('scroll', ({ scroll, velocity }: { scroll: number; velocity: number }) => {
      stateRef.current.scroll = scroll;
      stateRef.current.targetSpeed = velocity;
    });

    // Navigation event listener
    const handleNavigate = (e: Event) => {
      const idx = (e as CustomEvent).detail;
      const boundaries = sectionBoundariesRef.current;
      if (boundaries[idx] !== undefined) {
        const targetScroll = boundaries[idx] / CONFIG.camSpeed;
        lenis.scrollTo(targetScroll, { immediate: false });
      }
    };
    window.addEventListener('navigate-section', handleNavigate);

    // Mouse tracking (desktop only)
    const handleMouseMove = (e: MouseEvent) => {
      stateRef.current.mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
      stateRef.current.mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    if (!isMobile) {
      window.addEventListener('mousemove', handleMouseMove);
    }

    const raf = (time: number) => {
      lenis.raf(time);

      const delta = time - lastTimeRef.current;
      lastTimeRef.current = time;

      // Smooth velocity
      const state = stateRef.current;
      state.velocity += (state.targetSpeed - state.velocity) * 0.1;

      // Camera tilt - clamped to prevent disorientation
      if (worldRef.current && !isMobile) {
        const rawTiltX = state.mouseY * 5 - state.velocity * 0.5;
        const rawTiltY = state.mouseX * 5;
        const tiltX = Math.max(-20, Math.min(20, rawTiltX));
        const tiltY = Math.max(-12, Math.min(12, rawTiltY));
        worldRef.current.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
      }

      // Dynamic perspective (warp) - skip on mobile for perf
      if (viewportRef.current && !isMobile) {
        const fov = 1000 - Math.min(Math.abs(state.velocity) * 10, 600);
        viewportRef.current.style.perspective = `${fov}px`;
      }

      // Section tracking
      const cameraZ = state.scroll * CONFIG.camSpeed;
      const boundaries = sectionBoundariesRef.current;
      let newSection = 0;
      for (let s = boundaries.length - 1; s >= 0; s--) {
        if (cameraZ >= boundaries[s] - CONFIG.zGap * 0.5) {
          newSection = s;
          break;
        }
      }
      if (newSection !== currentSection) {
        currentSection = newSection;
        window.dispatchEvent(new CustomEvent('section-change', { detail: currentSection }));
      }

      // Item positioning
      const modC = loopSizeRef.current;
      if (modC === 0) { rafId.current = requestAnimationFrame(raf); return; }

      items.forEach((item, i) => {
        const el = itemRefs.current[i];
        if (!el) return;

        let relZ = item.baseZ + cameraZ;
        let vizZ = ((relZ % modC) + modC) % modC;
        if (vizZ > 500) vizZ -= modC;

        // Opacity - wider fade window for better readability
        let alpha = 1;
        if (vizZ < -3000) alpha = 0;
        else if (vizZ < -2000) alpha = (vizZ + 3000) / 1000;
        if (vizZ > 150 && item.type !== 'star') alpha = 1 - ((vizZ - 150) / 600);
        if (alpha < 0) alpha = 0;

        // Scroll hint fades based on showScrollHint state
        if (item.type === 'scroll-hint') {
          alpha = alpha * (showScrollHint ? 1 : 0);
        }

        el.style.opacity = String(alpha);
        el.style.pointerEvents = alpha > 0.5 ? 'auto' : 'none';

        if (alpha > 0) {
          let trans = `translate3d(${item.x}px, ${item.y}px, ${vizZ}px)`;

          if (item.type === 'star') {
            const stretch = Math.max(1, Math.min(1 + Math.abs(state.velocity) * 0.05, 4));
            trans += ` scale3d(1, 1, ${stretch})`;
          } else if (item.type === 'text') {
            trans += ` rotateZ(${item.rot}deg)`;
            const isHeroText = item.textContent === SECTION_TEXTS[0];
            if (Math.abs(state.velocity) > 1) {
              const offset = state.velocity * 2;
              el.style.textShadow = `${offset}px 0 red, ${-offset}px 0 cyan`;
            } else if (isHeroText) {
              el.style.textShadow = '3px 0 red, -3px 0 cyan';
            } else {
              el.style.textShadow = 'none';
            }
          } else if (item.type === 'scroll-hint') {
            trans += ` translate(-50%, 0)`;
          } else {
            // Dampen float near camera for readability
            const proximity = Math.min(1, Math.abs(vizZ) / 1500);
            const t = time * 0.001;
            const floatAmount = Math.sin(t + item.x) * (3 + 7 * proximity);
            const rotZ = item.rot * (0.3 + 0.7 * proximity);
            trans += ` rotateZ(${rotZ}deg) rotateY(${floatAmount}deg)`;
          }

          el.style.transform = trans;
        }
      });

      rafId.current = requestAnimationFrame(raf);
    };

    rafId.current = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId.current);
      lenis.destroy();
      lenisRef.current = null;
      window.removeEventListener('navigate-section', handleNavigate);
      if (!isMobile) window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [items, isMobile, showScrollHint]);

  const renderItemContent = useCallback((item: ItemDef) => {
    if (item.type === 'text') {
      const isHero = item.textContent === SECTION_TEXTS[0];
      return <div className={`big-text${isHero ? ' big-text-hero' : ''}`}>{item.textContent}</div>;
    }
    if (item.type === 'star') {
      return <div className="star" />;
    }
    if (item.type === 'scroll-hint') {
      return (
        <div className="scroll-hint-indicator">
          <span>Scroll to explore</span>
          <ChevronDown style={{ width: 16, height: 16, animation: 'bounce-down 1.5s infinite' }} />
        </div>
      );
    }
    if (item.type === 'contact-teaser') {
      return (
        <div className="card" onClick={() => setContactOpen(true)} style={{ cursor: 'pointer' }}>
          <div className="card-header">
            <span className="card-id">CONTACT</span>
            <div style={{ width: 10, height: 10, background: '#00ff88' }} />
          </div>
          <h2>Get in Touch</h2>
          <div className="card-body">
            <p>Ready to build something extraordinary? Let's talk about your project.</p>
            <p style={{ marginTop: '12px', color: 'var(--accent-2)' }}>Click to open contact form</p>
          </div>
          <div className="card-footer">
            <span>contact@zedigital.tech</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Send style={{ width: 10, height: 10 }} /> TRANSMIT
            </span>
          </div>
        </div>
      );
    }

    const content = item.content;
    if (content === 'hero') {
      return (
        <div className="card">
          <div className="card-header">
            <span className="card-id">Z.E DIGITAL TECH</span>
            <div style={{ width: 10, height: 10, background: 'var(--accent)' }} />
          </div>
          <h2>We Build Digital Excellence</h2>
          <div className="card-body">
            <p>Web development, AI systems, and custom software solutions that drive business growth.</p>
            <p style={{ marginTop: '12px', color: 'var(--accent-2)' }}>Websites • AI Solutions • Custom Software</p>
          </div>
          <div className="card-footer">
            <span>EST. 2024</span>
            <span>TIRANA, AL</span>
          </div>
        </div>
      );
    }

    if (content?.startsWith('service-')) {
      const idx = parseInt(content.split('-')[1]);
      return <ServiceCard service={SERVICES[idx]} index={idx} />;
    }

    if (content?.startsWith('project-')) {
      const idx = parseInt(content.split('-')[1]);
      const project = PROJECTS[idx];
      return <ProjectCard project={project} onClick={() => setSelectedProject(project)} />;
    }

    return null;
  }, []);

  return (
    <>
      <div className="viewport" ref={viewportRef}>
        <div className="world" ref={worldRef}>
          {items.map((item, i) => (
            <div
              key={i}
              ref={el => { itemRefs.current[i] = el; }}
              className="item"
              style={{ opacity: 0 }}
            >
              {renderItemContent(item)}
            </div>
          ))}
        </div>
      </div>

      {selectedProject && (
        <ProjectDetailModal
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
        />
      )}

      {contactOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            overflow: 'auto',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setContactOpen(false); }}
          onWheel={(e) => e.stopPropagation()}
        >
          <style>{`
            .contact-modal .card,
            .contact-modal .card-wide {
              transform: none !important;
              pointer-events: auto !important;
              position: relative !important;
            }
            .contact-modal input,
            .contact-modal textarea,
            .contact-modal select {
              pointer-events: auto !important;
              user-select: text !important;
              -webkit-user-select: text !important;
              cursor: text !important;
            }
            .contact-modal select {
              cursor: pointer !important;
            }
          `}</style>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setContactOpen(false)}
              style={{
                position: 'absolute',
                top: -40,
                right: 0,
                background: 'none',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#fff',
                fontFamily: 'var(--font-code)',
                fontSize: '0.7rem',
                padding: '4px 12px',
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              Close [ESC]
            </button>
            <div className="contact-modal">
              <ContactCard />
            </div>
          </div>
        </div>
      )}

    </>
  );
};

export default World3D;
