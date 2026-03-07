import React, { useRef, useState, useEffect, useCallback, createContext, useContext } from 'react';
import { SERVICES, SERVICE_ICONS } from '../constants';
import {
  keyframeDefinitions,
  useInView,
  useAnimationConfig,
  ANIMATION_DURATIONS,
  ANIMATION_EASINGS,
  getStaggerDelay,
} from '../utils/animations';
import { Service } from '../types';
import { X } from 'lucide-react';

// Context to manage expanded service state
interface ServiceExpansionContextType {
  expandedService: Service | null;
  setExpandedService: (service: Service | null) => void;
}

const ServiceExpansionContext = createContext<ServiceExpansionContextType>({
  expandedService: null,
  setExpandedService: () => {},
});

const Services: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [expandedService, setExpandedService] = useState<Service | null>(null);
  const { shouldAnimate, isMobile } = useAnimationConfig();

  // Section visibility for scroll-triggered animations
  const { ref: sectionRef, inView: sectionInView } = useInView({
    threshold: 0.1,
    rootMargin: '-50px',
    triggerOnce: true,
  });

  useEffect(() => {
    if (sectionInView) {
      const timer = setTimeout(() => setMounted(true), 100);
      return () => clearTimeout(timer);
    }
  }, [sectionInView]);

  // Handle escape key to close expanded panel
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && expandedService) {
        setExpandedService(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [expandedService]);

  // Lock body scroll when panel is open
  useEffect(() => {
    if (expandedService) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [expandedService]);

  // Animation styles matching Hero component
  // Note: Using shorthand `animation` with delay included to avoid React warnings about mixing shorthand/longhand
  const getAnimationStyle = (delay: number, animation: string = 'fadeInUp'): React.CSSProperties => {
    if (!mounted || !sectionInView) {
      return { opacity: 0, transform: 'translateY(30px)' };
    }
    if (!shouldAnimate) {
      return { opacity: 1 };
    }
    if (isMobile) {
      // Delay included in animation shorthand
      return {
        animation: `fadeIn ${ANIMATION_DURATIONS.normal}s ${ANIMATION_EASINGS.ease} ${delay * 0.5}s forwards`,
        opacity: 0,
      };
    }
    // Delay included in animation shorthand
    return {
      animation: `${animation} ${ANIMATION_DURATIONS.slow}s ${ANIMATION_EASINGS.smooth} ${delay}s forwards`,
      opacity: 0,
    };
  };

  return (
    <ServiceExpansionContext.Provider value={{ expandedService, setExpandedService }}>
      <div
        ref={sectionRef as React.RefObject<HTMLDivElement>}
        className="w-full h-full max-w-6xl mx-auto px-4 sm:px-8 overflow-hidden flex flex-col justify-center"
      >
        {/* Inject keyframes */}
        <style>{keyframeDefinitions}</style>

        {/* Section Header - Centered on top for bento layout */}
        <div className="text-center mb-4 sm:mb-8 lg:mb-16">
          <div
            className="mono text-[9px] sm:text-xs text-blue-400 mb-2 sm:mb-6 tracking-[0.2em] sm:tracking-[0.4em] font-medium uppercase"
            style={getAnimationStyle(0.1)}
          >
            <span
              className="inline-block"
              style={{
                animation: mounted && shouldAnimate && !isMobile ? `glitch 4s ease-in-out 2s infinite` : 'none',
              }}
            >
              Our Services
            </span>
          </div>
          <h2
            className="serif text-3xl sm:text-6xl md:text-7xl lg:text-8xl font-medium leading-[0.9] tracking-tight mb-2 sm:mb-8"
            style={getAnimationStyle(0.2)}
          >
            <span
              className="inline-block"
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #3b82f6 50%, #ffffff 100%)',
                backgroundSize: '200% 200%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                animation: mounted && shouldAnimate ? 'heroGradientShift 8s ease infinite' : 'none',
              }}
            >
              Core Expertise.
            </span>
          </h2>
          <div
            className="hidden sm:block h-px w-24 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent mx-auto mb-6 sm:mb-8 origin-center"
            style={{
              ...getAnimationStyle(0.4, 'scaleIn'),
              transform: mounted ? undefined : 'scaleX(0)',
            }}
          />
          <p
            className="hidden sm:block text-gray-400 text-sm sm:text-base md:text-lg serif italic leading-relaxed max-w-xl mx-auto transition-colors duration-300 hover:text-gray-300"
            style={getAnimationStyle(0.5)}
          >
            From web development to AI integration, we deliver solutions that drive real results.
          </p>
        </div>

        {/* Bento-style Services Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-5 lg:gap-6">
          {SERVICES.map((service, index) => (
            <ServiceCard
              key={service.id}
              service={service}
              index={index}
              isFeatured={index === 0}
              isFlipCard={false}
              mounted={mounted}
              shouldAnimate={shouldAnimate}
              isMobile={isMobile}
              baseDelay={0.6}
            />
          ))}
        </div>
      </div>

      {/* Service Detail Panel with Backdrop */}
      <ServiceDetailPanel
        service={expandedService}
        onClose={() => setExpandedService(null)}
        shouldAnimate={shouldAnimate}
      />
    </ServiceExpansionContext.Provider>
  );
};

// Service Detail Panel Component
interface ServiceDetailPanelProps {
  service: Service | null;
  onClose: () => void;
  shouldAnimate: boolean;
}

const ServiceDetailPanel: React.FC<ServiceDetailPanelProps> = ({ service, onClose, shouldAnimate }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Manage visibility state for animations
  useEffect(() => {
    if (service) {
      // Small delay to allow the backdrop to render first
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
      // Focus the close button when panel opens for accessibility
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 100);
    } else {
      setIsVisible(false);
    }
  }, [service]);

  // Handle click outside to close
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  // Don't render if no service is selected
  if (!service) return null;

  const serviceIndex = SERVICES.findIndex(s => s.id === service.id);

  return (
    <>
      {/* Backdrop with blur */}
      <div
        className="fixed inset-0 z-50 transition-all duration-300"
        style={{
          backgroundColor: isVisible ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0)',
          backdropFilter: isVisible ? 'blur(8px)' : 'blur(0px)',
          WebkitBackdropFilter: isVisible ? 'blur(8px)' : 'blur(0px)',
        }}
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-detail-title"
      >
        {/* Slide-out Panel */}
        <div
          ref={panelRef}
          className="absolute right-0 top-0 h-full w-full max-w-lg bg-gradient-to-br from-gray-950 to-black border-l border-white/10 overflow-y-auto"
          style={{
            transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
            transition: shouldAnimate ? 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
            boxShadow: isVisible ? '-20px 0 60px rgba(0, 0, 0, 0.5)' : 'none',
          }}
          role="document"
        >
          {/* Close Button */}
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 p-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 hover:border-blue-500/50 transition-all duration-300 group z-10"
            aria-label="Close service details"
          >
            <X className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors duration-300" />
          </button>

          {/* Panel Content */}
          <div className="p-6 sm:p-8 lg:p-10">
            {/* Service Index */}
            <div
              className="mono text-[10px] sm:text-xs text-blue-500/70 mb-4 tracking-wider"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: shouldAnimate ? 'all 0.4s ease 0.1s' : 'none',
              }}
            >
              {String(serviceIndex + 1).padStart(2, '0')} / {String(SERVICES.length).padStart(2, '0')}
            </div>

            {/* Icon */}
            <div
              className="w-12 h-12 sm:w-16 sm:h-16 text-blue-500 mb-6"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: shouldAnimate ? 'all 0.4s ease 0.15s' : 'none',
              }}
            >
              {SERVICE_ICONS[service.icon]}
            </div>

            {/* Title */}
            <h3
              id="service-detail-title"
              className="text-2xl sm:text-3xl lg:text-4xl font-semibold uppercase tracking-[0.1em] text-white mb-4"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: shouldAnimate ? 'all 0.4s ease 0.2s' : 'none',
              }}
            >
              {service.title}
            </h3>

            {/* Description */}
            <p
              className="text-gray-400 text-sm sm:text-base leading-relaxed mb-8"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: shouldAnimate ? 'all 0.4s ease 0.25s' : 'none',
              }}
            >
              {service.description}
            </p>

            {/* Divider */}
            <div
              className="h-px w-full bg-gradient-to-r from-blue-500/50 via-blue-500/20 to-transparent mb-8"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'scaleX(1)' : 'scaleX(0)',
                transformOrigin: 'left',
                transition: shouldAnimate ? 'all 0.5s ease 0.3s' : 'none',
              }}
            />

            {/* Capabilities Header */}
            <h4
              className="mono text-[10px] sm:text-xs text-blue-400 tracking-wider uppercase mb-4"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: shouldAnimate ? 'all 0.4s ease 0.35s' : 'none',
              }}
            >
              What We Deliver
            </h4>

            {/* Capabilities List */}
            <ul className="space-y-3" role="list" aria-label={`${service.title} capabilities`}>
              {(service.capabilities || []).map((capability, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 text-gray-300 text-sm sm:text-base"
                  style={{
                    opacity: isVisible ? 1 : 0,
                    transform: isVisible ? 'translateX(0)' : 'translateX(20px)',
                    transition: shouldAnimate ? `all 0.4s ease ${0.4 + i * 0.05}s` : 'none',
                  }}
                >
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 flex-shrink-0" />
                  {capability}
                </li>
              ))}
            </ul>

            {/* Bottom CTA */}
            <div
              className="mt-10 pt-8 border-t border-white/5"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: shouldAnimate ? 'all 0.4s ease 0.7s' : 'none',
              }}
            >
              <p className="text-gray-500 text-xs sm:text-sm mb-4 italic">
                Ready to transform your business?
              </p>
              <button
                className="group inline-flex items-center gap-2 mono text-xs sm:text-sm text-blue-400 hover:text-blue-300 transition-colors duration-300"
                onClick={() => {
                  onClose();
                  // Scroll to contact section
                  const contactSection = document.querySelector('#contact');
                  if (contactSection) {
                    contactSection.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
              >
                <span className="tracking-wider uppercase">Get in touch</span>
                <svg
                  className="w-4 h-4 transform group-hover:translate-x-1 transition-transform duration-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// Service card keyframes with enhanced 3D effects
const serviceKeyframes = `
  @keyframes heroGradientShift {
    0%, 100% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
  }

  @keyframes borderGlow {
    0%, 100% {
      border-color: rgba(59, 130, 246, 0.3);
      box-shadow: 0 0 20px rgba(59, 130, 246, 0.1);
    }
    50% {
      border-color: rgba(59, 130, 246, 0.5);
      box-shadow: 0 0 30px rgba(59, 130, 246, 0.2);
    }
  }

  @keyframes iconPulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
  }

  @keyframes iconRotate {
    0%, 100% {
      transform: rotate(0deg) scale(1);
    }
    25% {
      transform: rotate(-5deg) scale(1.05);
    }
    75% {
      transform: rotate(5deg) scale(1.05);
    }
  }

  @keyframes borderTrail {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  @keyframes countUp {
    0% {
      opacity: 0;
      transform: translateY(10px);
    }
    50% {
      opacity: 0.5;
      transform: translateY(5px);
    }
    100% {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes flipToBack {
    0% {
      transform: perspective(1000px) rotateY(0deg);
    }
    100% {
      transform: perspective(1000px) rotateY(180deg);
    }
  }

  @keyframes flipToFront {
    0% {
      transform: perspective(1000px) rotateY(180deg);
    }
    100% {
      transform: perspective(1000px) rotateY(360deg);
    }
  }

  @keyframes textColorShift {
    0%, 100% {
      color: rgb(156, 163, 175);
    }
    50% {
      color: rgb(209, 213, 219);
    }
  }
`;

// Service card props interface
interface ServiceCardProps {
  service: Service;
  index: number;
  isFeatured?: boolean;
  isFlipCard?: boolean;
  mounted: boolean;
  shouldAnimate: boolean;
  isMobile: boolean;
  baseDelay: number;
}

// Animated index indicator component
const AnimatedIndex: React.FC<{
  index: number;
  isHovered: boolean;
  mounted: boolean;
  shouldAnimate: boolean;
}> = ({ index, isHovered, mounted, shouldAnimate }) => {
  const [displayNum, setDisplayNum] = useState(0);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    if (!mounted || hasAnimated) return;

    // Counting animation effect
    const targetNum = index + 1;
    const duration = 600;
    const steps = 8;
    const stepDuration = duration / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      if (currentStep >= steps) {
        setDisplayNum(targetNum);
        setHasAnimated(true);
        clearInterval(interval);
      } else {
        // Show random numbers before settling on final
        setDisplayNum(Math.floor(Math.random() * 4) + 1);
      }
    }, stepDuration);

    return () => clearInterval(interval);
  }, [mounted, index, hasAnimated]);

  return (
    <span
      className="mono text-[10px] sm:text-xs font-medium text-gray-700 group-hover:text-blue-500/70 transition-all duration-300"
      style={{
        animation: mounted && shouldAnimate ? `countUp 0.5s ease-out ${0.3 + index * 0.1}s forwards` : 'none',
        opacity: mounted ? undefined : 0,
        textShadow: isHovered ? '0 0 10px rgba(59, 130, 246, 0.3)' : 'none',
      }}
    >
      {displayNum.toString().padStart(2, '0')}
    </span>
  );
};

// Separate card component with enhanced 3D hover effect
const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  index,
  isFeatured = false,
  isFlipCard = false,
  mounted,
  shouldAnimate,
  isMobile,
  baseDelay,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });
  const { setExpandedService } = useContext(ServiceExpansionContext);

  // Staggered animation delay
  const animationDelay = getStaggerDelay(index, baseDelay, 0.15);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current || isMobile || isFlipped) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    setMousePosition({ x: x + 0.5, y: y + 0.5 });

    cardRef.current.style.transform = `
      perspective(1000px)
      rotateY(${x * 18}deg)
      rotateX(${-y * 18}deg)
      scale(1.03)
    `;

    // Move inner glow based on mouse position
    const glowEl = cardRef.current.querySelector('.card-glow') as HTMLElement;
    if (glowEl) {
      glowEl.style.background = `radial-gradient(ellipse at ${(x + 0.5) * 100}% ${(y + 0.5) * 100}%, rgba(59, 130, 246, 0.25) 0%, rgba(59, 130, 246, 0.1) 30%, transparent 60%)`;
    }

    // Animate border glow with trailing effect
    const borderGlowEl = cardRef.current.querySelector('.border-glow') as HTMLElement;
    if (borderGlowEl) {
      const angle = (x + 0.5) * 360;
      borderGlowEl.style.background = `conic-gradient(from ${angle}deg at 50% 50%, rgba(59, 130, 246, 0.7), rgba(59, 130, 246, 0.3), transparent 30%, transparent 70%, rgba(59, 130, 246, 0.3), rgba(59, 130, 246, 0.7))`;
    }
  }, [isMobile, isFlipped]);

  const handleMouseLeave = useCallback(() => {
    if (!cardRef.current) return;

    cardRef.current.style.transform = 'perspective(1000px) rotateY(0) rotateX(0) scale(1)';

    const glowEl = cardRef.current.querySelector('.card-glow') as HTMLElement;
    if (glowEl) {
      glowEl.style.background = 'transparent';
    }

    const borderGlowEl = cardRef.current.querySelector('.border-glow') as HTMLElement;
    if (borderGlowEl) {
      borderGlowEl.style.background = 'transparent';
    }
  }, []);

  const handleCardClick = () => {
    if (isFlipCard && !isMobile) {
      setIsFlipped(!isFlipped);
    }
  };

  // Card animation style
  const cardStyle: React.CSSProperties = {
    transformStyle: 'preserve-3d',
    transition: isFlipped
      ? 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
      : 'transform 0.15s ease-out, border-color 0.3s ease, box-shadow 0.3s ease',
    opacity: mounted ? undefined : 0,
    ...(mounted && shouldAnimate && !isMobile
      ? {
          animation: `fadeInUp ${ANIMATION_DURATIONS.slow}s ${ANIMATION_EASINGS.smooth} ${animationDelay}s forwards`,
          opacity: 0,
        }
      : mounted
      ? { opacity: 1 }
      : {}),
  };

  // Featured card spans 2 columns on larger screens (not on mobile 2-col grid)
  const gridClass = isFeatured
    ? 'col-span-2 lg:col-span-2 lg:row-span-1'
    : '';

  // Service capabilities for flip card back
  const serviceCapabilities: Record<string, string[]> = {
    'web-development': ['Full-stack applications', 'Responsive design', 'Performance optimization', 'E-commerce platforms'],
    'ai-solutions': ['Machine learning integration', 'Intelligent automation', 'Predictive analytics', 'Custom AI models'],
    'software-development': ['Custom enterprise apps', 'API development', 'Cloud solutions', 'System integration'],
    'cybersecurity': ['Security audits', 'Penetration testing', 'Compliance & protection', 'Threat monitoring'],
  };

  // Flip card variant
  if (isFlipCard) {
    return (
      <>
        <style>{serviceKeyframes}</style>
        <div
          className={`group relative ${gridClass}`}
          style={{
            WebkitPerspective: '1000px',
            perspective: '1000px',
            ...cardStyle,
          }}
        >
          <div
            ref={cardRef}
            className="relative w-full h-full cursor-pointer"
            style={{
              WebkitTransformStyle: 'preserve-3d',
              transformStyle: 'preserve-3d',
              WebkitTransition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
              WebkitTransform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
            onClick={handleCardClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => {
              setIsHovered(false);
              handleMouseLeave();
            }}
          >
            {/* Front of card */}
            <div
              className={`absolute inset-0 bg-white/[0.02] border border-white/[0.05] hover:border-blue-500/40
                         transition-all duration-300 overflow-hidden
                         ${isFeatured ? 'p-6 sm:p-10' : 'p-5 sm:p-8'}`}
              style={{
                WebkitBackfaceVisibility: 'hidden',
                backfaceVisibility: 'hidden',
                MozBackfaceVisibility: 'hidden',
              } as React.CSSProperties}
            >
              {/* Animated border trail */}
              <div
                className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{
                  background: `conic-gradient(from 0deg at 50% 50%, transparent, rgba(59, 130, 246, 0.5), transparent, rgba(59, 130, 246, 0.3), transparent)`,
                  animation: isHovered && shouldAnimate ? 'borderTrail 3s linear infinite' : 'none',
                  maskImage: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  maskComposite: 'xor',
                  WebkitMaskComposite: 'xor',
                  padding: '1px',
                }}
              />

              {/* Dynamic glow effect */}
              <div
                className="card-glow absolute inset-0 pointer-events-none transition-all duration-200"
                style={{
                  background: isHovered ? `radial-gradient(ellipse at ${mousePosition.x * 100}% ${mousePosition.y * 100}%, rgba(59, 130, 246, 0.15) 0%, transparent 50%)` : 'transparent',
                }}
              />

              <div className="relative z-10 h-full flex flex-col">
                <div className="flex items-start justify-between mb-4 sm:mb-6">
                  <div
                    className={`${isFeatured ? 'w-10 h-10 sm:w-14 sm:h-14' : 'w-8 h-8 sm:w-10 sm:h-10'} text-gray-600 group-hover:text-blue-500 transition-all duration-300`}
                    style={{
                      animation: isHovered && shouldAnimate && !isMobile ? 'iconRotate 1.5s ease-in-out infinite' : 'none',
                    }}
                  >
                    {SERVICE_ICONS[service.icon]}
                  </div>
                  <AnimatedIndex index={index} isHovered={isHovered} mounted={mounted} shouldAnimate={shouldAnimate} />
                </div>

                <h3
                  className={`font-semibold uppercase tracking-[0.1em] sm:tracking-[0.15em] mb-2 sm:mb-3
                             group-hover:text-white transition-all duration-300 group-hover:translate-x-1 transform
                             ${isFeatured ? 'text-sm sm:text-base md:text-lg' : 'text-xs sm:text-sm'}`}
                  style={{
                    textShadow: isHovered ? '0 0 20px rgba(59, 130, 246, 0.3)' : 'none',
                  }}
                >
                  {service.title}
                </h3>
                <p
                  className={`text-gray-500 leading-relaxed transition-colors duration-300
                             ${isFeatured ? 'text-xs sm:text-sm md:text-base' : 'text-[10px] sm:text-[11px]'}`}
                  style={{
                    animation: isHovered && shouldAnimate ? 'textColorShift 2s ease-in-out infinite' : 'none',
                  }}
                >
                  {service.description}
                </p>

                {/* Flip indicator */}
                <div className="mt-auto pt-4 sm:pt-6 flex items-center gap-2 opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                  <span className="mono text-[9px] sm:text-[10px] text-blue-500 tracking-wider uppercase">
                    Click to flip
                  </span>
                  <svg
                    className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    style={{
                      animation: isHovered ? 'iconPulse 1s ease-in-out infinite' : 'none',
                    }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Back of card */}
            <div
              className={`absolute inset-0 bg-gradient-to-br from-blue-950/50 to-black/80 border border-blue-500/30
                         overflow-hidden
                         ${isFeatured ? 'p-6 sm:p-10' : 'p-5 sm:p-8'}`}
              style={{
                WebkitBackfaceVisibility: 'hidden',
                backfaceVisibility: 'hidden',
                MozBackfaceVisibility: 'hidden',
                WebkitTransform: 'rotateY(180deg)',
                transform: 'rotateY(180deg)',
              } as React.CSSProperties}
            >
              {/* Subtle gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-blue-500/5 to-transparent pointer-events-none" />

              <div className="relative z-10 h-full flex flex-col">
                <div className="flex items-start justify-between mb-4 sm:mb-6">
                  <h4 className="mono text-[10px] sm:text-xs text-blue-400 tracking-wider uppercase">
                    Capabilities
                  </h4>
                  <AnimatedIndex index={index} isHovered={isHovered} mounted={mounted} shouldAnimate={shouldAnimate} />
                </div>

                <h3
                  className={`font-semibold uppercase tracking-[0.1em] sm:tracking-[0.15em] mb-4 sm:mb-6 text-white
                             ${isFeatured ? 'text-sm sm:text-base md:text-lg' : 'text-xs sm:text-sm'}`}
                >
                  {service.title}
                </h3>

                <ul className="space-y-2 sm:space-y-3 flex-grow">
                  {(serviceCapabilities[service.id] || []).map((capability, i) => (
                    <li
                      key={i}
                      className={`flex items-center gap-2 text-gray-300
                                 ${isFeatured ? 'text-xs sm:text-sm' : 'text-[10px] sm:text-[11px]'}`}
                    >
                      <span className="w-1 h-1 bg-blue-500 rounded-full flex-shrink-0" />
                      {capability}
                    </li>
                  ))}
                </ul>

                {/* Click to flip back */}
                <div className="mt-auto pt-4 sm:pt-6 flex items-center gap-2">
                  <span className="mono text-[9px] sm:text-[10px] text-blue-400 tracking-wider uppercase">
                    Click to flip back
                  </span>
                  <svg
                    className="w-3 h-3 sm:w-4 sm:h-4 text-blue-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Handle card click to expand
  const handleCardExpand = useCallback(() => {
    setExpandedService(service);
  }, [service, setExpandedService]);

  // Standard card (non-flip)
  return (
    <>
      <style>{serviceKeyframes}</style>
      <div
        ref={cardRef}
        className={`group relative bg-white/[0.02] border border-white/[0.05]
                   hover:border-blue-500/40 transition-all duration-300 cursor-pointer overflow-hidden
                   ${gridClass}
                   ${isFeatured ? 'p-3 sm:p-6 lg:p-10' : 'p-3 sm:p-5 lg:p-8'}`}
        style={{
          ...cardStyle,
          boxShadow: isHovered ? '0 0 40px rgba(59, 130, 246, 0.15), inset 0 0 20px rgba(59, 130, 246, 0.05)' : 'none',
        }}
        onClick={handleCardExpand}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardExpand();
          }
        }}
        onMouseMove={handleMouseMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          handleMouseLeave();
        }}
        role="button"
        tabIndex={0}
        aria-label={`View details for ${service.title}`}
      >
        {/* Animated border glow effect on hover - follows mouse */}
        <div
          className="border-glow absolute inset-0 pointer-events-none transition-all duration-300 opacity-0 group-hover:opacity-100"
          style={{
            background: 'transparent',
            maskImage: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'xor',
            WebkitMaskComposite: 'xor',
            padding: '1px',
          }}
        />

        {/* Subtle animated border trail on hover */}
        <div
          className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-60 transition-opacity duration-500"
          style={{
            background: `conic-gradient(from 0deg at 50% 50%, transparent, rgba(59, 130, 246, 0.4), transparent, rgba(59, 130, 246, 0.2), transparent)`,
            animation: isHovered && shouldAnimate && !isMobile ? 'borderTrail 4s linear infinite' : 'none',
            maskImage: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            maskComposite: 'xor',
            WebkitMaskComposite: 'xor',
            padding: '1px',
          }}
        />

        {/* Dynamic glow effect - follows mouse position */}
        <div className="card-glow absolute inset-0 pointer-events-none transition-all duration-200" />

        {/* Hover gradient overlay */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-transparent" />
        </div>

        <div className="relative z-10">
          <div className="flex items-start justify-between mb-2 sm:mb-4 lg:mb-6">
            {/* Icon with enhanced hover animation */}
            <div
              className={`${isFeatured ? 'w-6 h-6 sm:w-10 sm:h-10 lg:w-14 lg:h-14' : 'w-5 h-5 sm:w-8 sm:h-8 lg:w-10 lg:h-10'} text-gray-600 group-hover:text-blue-500 transition-all duration-300`}
              style={{
                animation: isHovered && shouldAnimate && !isMobile ? 'iconRotate 1.5s ease-in-out infinite' : 'none',
                filter: isHovered ? 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))' : 'none',
              }}
            >
              {SERVICE_ICONS[service.icon]}
            </div>
            {/* Animated index indicator with counting effect */}
            <AnimatedIndex index={index} isHovered={isHovered} mounted={mounted} shouldAnimate={shouldAnimate} />
          </div>

          <h3
            className={`font-semibold uppercase tracking-[0.05em] sm:tracking-[0.1em] lg:tracking-[0.15em] mb-1 sm:mb-2 lg:mb-3
                       text-gray-200 group-hover:text-white transition-all duration-300 group-hover:translate-x-1 transform
                       ${isFeatured ? 'text-[10px] sm:text-sm md:text-lg' : 'text-[9px] sm:text-xs lg:text-sm'}`}
            style={{
              textShadow: isHovered ? '0 0 20px rgba(59, 130, 246, 0.3)' : 'none',
            }}
          >
            {service.title}
          </h3>
          <p
            className={`text-gray-500 leading-relaxed transition-colors duration-300 hidden sm:block
                       ${isFeatured ? 'text-xs sm:text-sm md:text-base' : 'text-[10px] sm:text-[11px]'}`}
            style={{
              animation: isHovered && shouldAnimate && !isMobile ? 'textColorShift 2s ease-in-out infinite' : 'none',
            }}
          >
            {service.description}
          </p>

          {/* Learn more prompt - appears on hover with enhanced animation */}
          <div
            className="hidden sm:flex mt-4 sm:mt-6 items-center gap-2 opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300"
          >
            <span className="mono text-[9px] sm:text-[10px] text-blue-500 tracking-wider uppercase">
              Learn more
            </span>
            <svg
              className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500 transform group-hover:translate-x-1 transition-transform duration-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </div>
        </div>

        {/* Corner accent with glow */}
        <div className="absolute top-0 right-0 w-10 h-10 overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div
            className="absolute top-0 right-0 w-20 h-px bg-gradient-to-l from-blue-500/60 to-transparent transform rotate-45 translate-y-5 -translate-x-2"
            style={{
              boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)',
            }}
          />
        </div>

        {/* Bottom corner accent for featured card */}
        {isFeatured && (
          <div className="absolute bottom-0 left-0 w-10 h-10 overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div
              className="absolute bottom-0 left-0 w-20 h-px bg-gradient-to-r from-blue-500/60 to-transparent transform -rotate-45 -translate-y-5 translate-x-2"
              style={{
                boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)',
              }}
            />
          </div>
        )}
      </div>
    </>
  );
};

export default Services;
