import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowRight } from 'lucide-react';

interface HeroProps {
  scrollProgress?: number;
}

// Text scramble effect
const useTextScramble = (text: string, active: boolean) => {
  const [displayText, setDisplayText] = useState(text);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const iterationRef = useRef(0);

  useEffect(() => {
    if (!active) {
      const timeout = setTimeout(() => setDisplayText(text), 100);
      return () => clearTimeout(timeout);
    }

    iterationRef.current = 0;
    const interval = setInterval(() => {
      setDisplayText(
        text
          .split('')
          .map((char, index) => {
            if (char === ' ' || char === '.' || char === '_') return char;
            if (index < iterationRef.current) return text[index];
            return chars[Math.floor(Math.random() * chars.length)];
          })
          .join('')
      );

      if (iterationRef.current >= text.length) clearInterval(interval);
      iterationRef.current += 0.3;
    }, 40);

    return () => clearInterval(interval);
  }, [text, active]);

  return displayText;
};

const Hero: React.FC<HeroProps> = ({ scrollProgress = 0 }) => {
  const [mounted, setMounted] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [isHoveringTitle, setIsHoveringTitle] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevScrollRef = useRef(scrollProgress);

  const scrambledTitle = useTextScramble('Z.E', isHoveringTitle);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    const timer = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  // Re-trigger animations on loop-back
  useEffect(() => {
    const wasAtEnd = prevScrollRef.current > 0.8;
    const nowAtStart = scrollProgress < 0.1;
    if (wasAtEnd && nowAtStart) {
      setMounted(false);
      setAnimationKey(prev => prev + 1);
      setTimeout(() => setMounted(true), 150);
    }
    prevScrollRef.current = scrollProgress;
  }, [scrollProgress]);

  const parallaxY = isMobile ? 0 : scrollProgress * 60;

  // Multi-type animation helper
  const getAnimationStyle = useCallback((
    delay: number,
    type: 'fadeUp' | 'clipReveal' | 'slideLeft' | 'lineExpand' = 'fadeUp'
  ): React.CSSProperties => {
    if (!mounted) {
      switch (type) {
        case 'clipReveal':
          return { clipPath: 'polygon(0 100%, 100% 100%, 100% 100%, 0 100%)', transform: 'translateY(40px)' };
        case 'slideLeft':
          return { opacity: 0, transform: 'translateX(-20px)' };
        case 'lineExpand':
          return { transform: 'scaleX(0)', transformOrigin: 'left' };
        default:
          return { opacity: 0, transform: 'translateY(30px)' };
      }
    }

    const animMap: Record<string, string> = {
      fadeUp: 'heroFadeUp',
      clipReveal: isMobile ? 'heroFadeUp' : 'heroClipReveal',
      slideLeft: 'heroSlideInLeft',
      lineExpand: 'heroLineExpand',
    };

    const durMap: Record<string, string> = {
      fadeUp: '0.7s',
      clipReveal: '0.9s',
      slideLeft: '0.7s',
      lineExpand: '0.8s',
    };

    return {
      animation: `${animMap[type]} ${durMap[type]} cubic-bezier(0.16, 1, 0.3, 1) ${delay}s forwards`,
      ...(type === 'clipReveal' && !isMobile
        ? { clipPath: 'polygon(0 100%, 100% 100%, 100% 100%, 0 100%)' }
        : type !== 'lineExpand' ? { opacity: 0 } : {}),
      ...(type === 'lineExpand' ? { transform: 'scaleX(0)', transformOrigin: 'left' } : {}),
    };
  }, [mounted, isMobile]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center overflow-hidden">
      {/* Keyframes */}
      <style>{`
        @keyframes heroFadeUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroClipReveal {
          from {
            clip-path: polygon(0 100%, 100% 100%, 100% 100%, 0 100%);
            transform: translateY(40px);
          }
          to {
            clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%);
            transform: translateY(0);
          }
        }
        @keyframes heroSlideInLeft {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes heroLineExpand {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        @keyframes heroLineGrow {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
        }
        @keyframes heroGradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes heroDotPulse {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
        @keyframes heroDrift1 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        @keyframes heroDrift2 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
        @keyframes heroDrift3 {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-25px); }
        }
        @keyframes heroRuleShimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes cursorBlink {
          0%, 45% { opacity: 1; }
          50%, 95% { opacity: 0; }
          100% { opacity: 1; }
        }
        .glitch-hover {
          position: relative;
        }
        .glitch-hover::before,
        .glitch-hover::after {
          content: attr(data-text);
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
        }
        .glitch-hover:hover::before {
          animation: glitchA 0.3s linear infinite;
          clip-path: polygon(0 0, 100% 0, 100% 33%, 0 33%);
          -webkit-text-fill-color: rgba(59, 130, 246, 0.6);
          opacity: 1;
        }
        .glitch-hover:hover::after {
          animation: glitchB 0.3s linear infinite;
          clip-path: polygon(0 67%, 100% 67%, 100% 100%, 0 100%);
          -webkit-text-fill-color: rgba(139, 92, 246, 0.6);
          opacity: 1;
        }
        @keyframes glitchA {
          0% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          50% { transform: translateX(3px); }
          75% { transform: translateX(-1px); }
          100% { transform: translateX(0); }
        }
        @keyframes glitchB {
          0% { transform: translateX(0); }
          25% { transform: translateX(3px); }
          50% { transform: translateX(-3px); }
          75% { transform: translateX(1px); }
          100% { transform: translateX(0); }
        }
      `}</style>

      {/* Main Content */}
      <div
        key={animationKey}
        className="relative z-10 w-full px-6 sm:px-12 lg:px-24 max-w-7xl text-center sm:text-left mx-auto sm:mx-0"
      >
        {/* Status Badge */}
        <div
          className="flex items-center gap-2.5 mb-6 sm:mb-8 justify-center sm:justify-start"
          style={getAnimationStyle(0, 'slideLeft')}
        >
          <span
            className="w-1.5 h-1.5 rounded-full bg-blue-500"
            style={{ animation: mounted ? 'heroDotPulse 2s ease-in-out infinite' : 'none' }}
          />
          <span className="mono text-[9px] sm:text-[10px] text-blue-500/70 uppercase tracking-[0.25em] font-medium">
            Engineering Sovereignty
          </span>
          <span
            className="hidden sm:inline-block w-[2px] h-3 bg-blue-500/50 ml-1"
            style={{ animation: mounted ? 'cursorBlink 1.1s step-end infinite' : 'none' }}
          />
        </div>

        {/* Title */}
        <h1 className="mb-4 sm:mb-6 cursor-default" style={{ fontFamily: "'Lora', Georgia, serif" }}>
          {/* Line 1: Z.E */}
          <span
            className="block text-[20vw] sm:text-[14vw] md:text-[12vw] lg:text-[10vw] font-medium leading-[0.85] tracking-tighter"
            style={getAnimationStyle(0.15, 'clipReveal')}
            onMouseEnter={() => !isMobile && setIsHoveringTitle(true)}
            onMouseLeave={() => setIsHoveringTitle(false)}
          >
            <span
              className="inline-block"
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #3b82f6 40%, #8b5cf6 70%, #ffffff 100%)',
                backgroundSize: '300% 300%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: mounted ? 'heroGradientShift 8s ease infinite' : 'none',
              }}
            >
              {isMobile ? 'Z.E' : scrambledTitle}
            </span>
          </span>

          {/* Line 2: Digital Tech. */}
          <span
            className="glitch-hover block text-[12vw] sm:text-[8vw] md:text-[7vw] lg:text-[6vw] italic text-white/15 leading-[0.9] tracking-tight transition-all duration-500 hover:text-white/25"
            data-text="Digital Tech."
            style={{
              ...getAnimationStyle(0.4, 'clipReveal'),
              ...(mounted ? { transform: `translateY(${parallaxY}px)` } : {}),
            }}
          >
            Digital Tech.
          </span>
        </h1>

        {/* Horizontal Divider */}
        <div
          className="h-px w-32 sm:w-48 mb-5 sm:mb-6 mx-auto sm:mx-0"
          style={{
            ...getAnimationStyle(0.7, 'lineExpand'),
            background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.5) 0%, rgba(139, 92, 246, 0.3) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            ...(mounted ? { animation: `heroLineExpand 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.7s forwards, heroRuleShimmer 20s linear 1.5s infinite` } : {}),
          }}
        />

        {/* Tagline */}
        <p
          className="serif italic text-gray-400 text-sm sm:text-base lg:text-lg leading-relaxed max-w-[280px] sm:max-w-md lg:max-w-lg mb-6 sm:mb-8 mx-auto sm:mx-0 transition-colors duration-500 hover:text-gray-300"
          style={getAnimationStyle(0.9)}
        >
          We engineer websites, AI systems, and software that accelerate business growth.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('navigate-section', { detail: { sectionIndex: 2 } }))}
            className="group w-full sm:w-auto px-6 sm:px-7 py-3.5 sm:py-3 border border-white/10 hover:border-white/25 hover:bg-white/[0.03] transition-all duration-300"
            style={getAnimationStyle(1.1)}
          >
            <span className="mono text-[11px] text-gray-400 uppercase tracking-wider group-hover:text-white transition-colors">
              View Our Work
            </span>
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('navigate-section', { detail: { sectionIndex: 4 } }))}
            className="group w-full sm:w-auto px-6 sm:px-7 py-3.5 sm:py-3 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all duration-300 flex items-center justify-center sm:justify-start gap-2"
            style={getAnimationStyle(1.2)}
          >
            <span className="mono text-[11px] text-emerald-400 uppercase tracking-wider group-hover:text-emerald-300 transition-colors">
              Start a Project
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-emerald-500 group-hover:translate-x-1 transition-transform duration-300" />
          </button>
        </div>
      </div>

      {/* Desktop Decorative Elements */}
      {!isMobile && (
        <>
          {/* Vertical accent line - right side */}
          <div
            className="absolute top-[15%] right-[8%] w-px h-40 opacity-0"
            style={{
              background: 'linear-gradient(to bottom, rgba(59, 130, 246, 0.3), transparent)',
              transform: `translateY(${scrollProgress * 80}px)`,
              animation: mounted ? 'heroFadeUp 1s ease 1.3s forwards' : 'none',
            }}
          />

          {/* Floating micro-dots */}
          <div
            className="absolute top-[25%] right-[20%] w-1.5 h-1.5 rounded-full bg-blue-500/30 opacity-0"
            style={{ animation: mounted ? 'heroFadeUp 1s ease 1.4s forwards, heroDrift1 8s ease-in-out 2s infinite' : 'none' }}
          />
          <div
            className="absolute top-[55%] right-[15%] w-1 h-1 rounded-full bg-violet-500/20 opacity-0"
            style={{ animation: mounted ? 'heroFadeUp 1s ease 1.5s forwards, heroDrift2 6s ease-in-out 2.5s infinite' : 'none' }}
          />
          <div
            className="absolute top-[40%] right-[25%] w-1 h-1 rounded-full bg-blue-400/25 opacity-0"
            style={{ animation: mounted ? 'heroFadeUp 1s ease 1.6s forwards, heroDrift3 10s ease-in-out 3s infinite' : 'none' }}
          />

          {/* Scroll Indicator - bottom center */}
          <div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center opacity-0"
            style={{ animation: mounted ? 'heroFadeUp 0.8s ease 1.5s forwards' : 'none' }}
          >
            <div className="relative h-12 w-px overflow-hidden">
              <div
                className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-blue-500/40 to-transparent"
                style={{
                  animation: mounted ? 'heroLineGrow 1s cubic-bezier(0.16, 1, 0.3, 1) 1.7s forwards' : 'none',
                  transformOrigin: 'top',
                  transform: mounted ? undefined : 'scaleY(0)',
                }}
              />
            </div>
            <span className="mono text-[8px] text-gray-600 mt-2 tracking-[0.2em] uppercase">
              Scroll
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default Hero;
