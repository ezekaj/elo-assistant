import { useEffect, useState, useRef, RefObject } from 'react';

// Animation timing constants
export const ANIMATION_DURATIONS = {
  fast: 0.3,
  normal: 0.6,
  slow: 0.8,
  xslow: 1.2,
} as const;

export const ANIMATION_EASINGS = {
  smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
  bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  ease: 'ease',
  easeOut: 'ease-out',
  easeIn: 'ease-in',
  easeInOut: 'ease-in-out',
  linear: 'linear',
} as const;

// CSS Keyframe animation definitions as string (for injection via <style> tag)
export const keyframeDefinitions = `
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeInDown {
    from {
      opacity: 0;
      transform: translateY(-30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeInLeft {
    from {
      opacity: 0;
      transform: translateX(-30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes fadeInRight {
    from {
      opacity: 0;
      transform: translateX(30px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes fadeOutUp {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(-30px);
    }
  }

  @keyframes fadeOutDown {
    from {
      opacity: 1;
      transform: translateY(0);
    }
    to {
      opacity: 0;
      transform: translateY(30px);
    }
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @keyframes scaleOut {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.9);
    }
  }

  @keyframes slideInUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  @keyframes slideInDown {
    from {
      transform: translateY(-100%);
    }
    to {
      transform: translateY(0);
    }
  }

  @keyframes charReveal {
    from {
      opacity: 0;
      transform: translateY(100%);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes glitch {
    0%, 100% {
      opacity: 1;
      transform: translateX(0);
    }
    10% {
      opacity: 0.8;
      transform: translateX(-2px);
    }
    20% {
      opacity: 1;
      transform: translateX(2px);
    }
    30% {
      opacity: 0.9;
      transform: translateX(0);
    }
  }

  @keyframes lineGrow {
    from {
      transform: scaleY(0);
    }
    to {
      transform: scaleY(1);
    }
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }

  @keyframes float {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-10px);
    }
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes cursorBlink {
    0%, 45% {
      opacity: 1;
    }
    50%, 95% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }

  /* GPU-optimized breathing gradient - removed filter for better performance */
  @keyframes breathingGradient {
    0%, 100% {
      background-position: 0% 50%;
    }
    25% {
      background-position: 50% 25%;
    }
    50% {
      background-position: 100% 50%;
    }
    75% {
      background-position: 50% 75%;
    }
  }

  /* GPU-optimized section animations - removed blur filter for 60fps */
  @keyframes sectionEnter {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(20px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  @keyframes sectionExit {
    from {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
    to {
      opacity: 0;
      transform: scale(1.02) translateY(-10px);
    }
  }

  @keyframes subtleHoverGlow {
    0%, 100% {
      box-shadow: 0 0 0 rgba(59, 130, 246, 0);
    }
    50% {
      box-shadow: 0 0 20px rgba(59, 130, 246, 0.15);
    }
  }

  @keyframes colorShiftBlue {
    0%, 100% {
      color: rgba(59, 130, 246, 0.6);
    }
    50% {
      color: rgba(59, 130, 246, 1);
    }
  }

  @keyframes scrollColorTransition {
    0% {
      --theme-accent: rgba(59, 130, 246, 1);
      --theme-accent-glow: rgba(59, 130, 246, 0.3);
    }
    25% {
      --theme-accent: rgba(99, 102, 241, 1);
      --theme-accent-glow: rgba(99, 102, 241, 0.3);
    }
    50% {
      --theme-accent: rgba(139, 92, 246, 1);
      --theme-accent-glow: rgba(139, 92, 246, 0.3);
    }
    75% {
      --theme-accent: rgba(79, 70, 229, 1);
      --theme-accent-glow: rgba(79, 70, 229, 0.3);
    }
    100% {
      --theme-accent: rgba(59, 130, 246, 1);
      --theme-accent-glow: rgba(59, 130, 246, 0.3);
    }
  }
`;

// Animation name type for type safety
export type AnimationName =
  | 'fadeIn'
  | 'fadeOut'
  | 'fadeInUp'
  | 'fadeInDown'
  | 'fadeInLeft'
  | 'fadeInRight'
  | 'fadeOutUp'
  | 'fadeOutDown'
  | 'scaleIn'
  | 'scaleOut'
  | 'slideInUp'
  | 'slideInDown'
  | 'charReveal'
  | 'glitch'
  | 'lineGrow'
  | 'pulse'
  | 'shimmer'
  | 'float'
  | 'spin'
  | 'cursorBlink'
  | 'breathingGradient'
  | 'sectionEnter'
  | 'sectionExit'
  | 'subtleHoverGlow'
  | 'colorShiftBlue'
  | 'scrollColorTransition';

// Type for animation config
export interface AnimationConfig {
  animation: AnimationName;
  duration?: number;
  delay?: number;
  easing?: keyof typeof ANIMATION_EASINGS;
  fillMode?: 'forwards' | 'backwards' | 'both' | 'none';
  iterationCount?: number | 'infinite';
}

// Generate animation style object
export function getAnimationStyle(config: AnimationConfig): React.CSSProperties {
  const {
    animation,
    duration = ANIMATION_DURATIONS.normal,
    delay = 0,
    easing = 'smooth',
    fillMode = 'forwards',
    iterationCount = 1,
  } = config;

  return {
    animation: `${animation} ${duration}s ${ANIMATION_EASINGS[easing]} ${delay}s ${iterationCount} ${fillMode}`,
    opacity: fillMode === 'forwards' || fillMode === 'both' ? 0 : undefined,
  };
}

// Stagger delay utilities
export function getStaggerDelay(index: number, baseDelay: number = 0, staggerAmount: number = 0.1): number {
  return baseDelay + index * staggerAmount;
}

export function getStaggeredAnimationStyle(
  config: Omit<AnimationConfig, 'delay'>,
  index: number,
  baseDelay: number = 0,
  staggerAmount: number = 0.1
): React.CSSProperties {
  return getAnimationStyle({
    ...config,
    delay: getStaggerDelay(index, baseDelay, staggerAmount),
  });
}

// Create stagger children animation styles
export function createStaggerChildren(
  count: number,
  config: Omit<AnimationConfig, 'delay'>,
  baseDelay: number = 0,
  staggerAmount: number = 0.1
): React.CSSProperties[] {
  return Array.from({ length: count }, (_, index) =>
    getStaggeredAnimationStyle(config, index, baseDelay, staggerAmount)
  );
}

// Intersection Observer hook for scroll-triggered animations
export interface UseInViewOptions {
  threshold?: number | number[];
  rootMargin?: string;
  triggerOnce?: boolean;
  root?: Element | null;
}

export interface UseInViewResult {
  ref: RefObject<HTMLElement | null>;
  inView: boolean;
  entry: IntersectionObserverEntry | null;
}

export function useInView(options: UseInViewOptions = {}): UseInViewResult {
  const {
    threshold = 0.1,
    rootMargin = '0px',
    triggerOnce = true,
    root = null,
  } = options;

  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  const [entry, setEntry] = useState<IntersectionObserverEntry | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Skip if already triggered and triggerOnce is true
    if (inView && triggerOnce) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [observerEntry] = entries;
        setEntry(observerEntry);

        if (observerEntry.isIntersecting) {
          setInView(true);
          if (triggerOnce) {
            observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setInView(false);
        }
      },
      {
        threshold,
        rootMargin,
        root,
      }
    );

    observer.observe(element);

    return () => {
      observer.unobserve(element);
    };
  }, [threshold, rootMargin, triggerOnce, root, inView]);

  return { ref, inView, entry };
}

// Hook for multiple elements with staggered animations
export interface UseStaggeredInViewOptions extends UseInViewOptions {
  staggerDelay?: number;
}

export function useStaggeredInView(
  count: number,
  options: UseStaggeredInViewOptions = {}
): { refs: RefObject<HTMLElement | null>[]; inViewStates: boolean[]; delays: number[] } {
  const { staggerDelay = 0.1, ...inViewOptions } = options;

  const refs = useRef<RefObject<HTMLElement | null>[]>(
    Array.from({ length: count }, () => ({ current: null }))
  ).current;

  const [inViewStates, setInViewStates] = useState<boolean[]>(Array(count).fill(false));

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    refs.forEach((ref, index) => {
      const element = ref.current;
      if (!element) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const [entry] = entries;
          if (entry.isIntersecting) {
            // Add staggered delay before setting inView
            setTimeout(() => {
              setInViewStates((prev) => {
                const newStates = [...prev];
                newStates[index] = true;
                return newStates;
              });
            }, index * staggerDelay * 1000);

            if (inViewOptions.triggerOnce !== false) {
              observer.unobserve(element);
            }
          }
        },
        {
          threshold: inViewOptions.threshold ?? 0.1,
          rootMargin: inViewOptions.rootMargin ?? '0px',
          root: inViewOptions.root ?? null,
        }
      );

      observer.observe(element);
      observers.push(observer);
    });

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [count, staggerDelay, inViewOptions.threshold, inViewOptions.rootMargin, inViewOptions.root, inViewOptions.triggerOnce]);

  const delays = Array.from({ length: count }, (_, i) => i * staggerDelay);

  return { refs, inViewStates, delays };
}

// Utility to detect if reduced motion is preferred
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

// Utility to detect if mobile device
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

// Combined hook that simplifies animations with reduced motion and mobile support
export function useAnimationConfig(baseDelay: number = 0): {
  shouldAnimate: boolean;
  getStyle: (animation: AnimationName, delay?: number) => React.CSSProperties;
  isMobile: boolean;
} {
  const prefersReducedMotion = usePrefersReducedMotion();
  const isMobile = useIsMobile();

  const shouldAnimate = !prefersReducedMotion;

  const getStyle = (animation: AnimationName, delay: number = 0): React.CSSProperties => {
    if (prefersReducedMotion) {
      return { opacity: 1 };
    }

    // Use simpler/faster animations on mobile
    const effectiveAnimation = isMobile && animation.startsWith('fadeIn') ? 'fadeIn' : animation;
    const effectiveDuration = isMobile ? ANIMATION_DURATIONS.fast : ANIMATION_DURATIONS.normal;

    return getAnimationStyle({
      animation: effectiveAnimation,
      duration: effectiveDuration,
      delay: baseDelay + delay,
      easing: 'smooth',
    });
  };

  return { shouldAnimate, getStyle, isMobile };
}

// Animation preset constants for common use cases
export const ANIMATION_PRESETS = {
  heroFadeIn: {
    animation: 'fadeInUp' as const,
    duration: 0.8,
    easing: 'smooth' as const,
  },
  sectionReveal: {
    animation: 'fadeInUp' as const,
    duration: 0.6,
    easing: 'smooth' as const,
  },
  cardHover: {
    animation: 'scaleIn' as const,
    duration: 0.3,
    easing: 'easeOut' as const,
  },
  textGlitch: {
    animation: 'glitch' as const,
    duration: 4,
    iterationCount: 'infinite' as const,
    easing: 'linear' as const,
  },
  lineGrow: {
    animation: 'lineGrow' as const,
    duration: 0.8,
    easing: 'easeOut' as const,
  },
  floatingElement: {
    animation: 'float' as const,
    duration: 3,
    iterationCount: 'infinite' as const,
    easing: 'easeInOut' as const,
  },
} as const;
