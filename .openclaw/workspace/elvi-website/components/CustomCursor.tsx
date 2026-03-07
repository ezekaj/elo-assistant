import React, { useEffect, useRef, useState } from 'react';

interface CursorState {
  x: number;
  y: number;
  visible: boolean;
  hovering: boolean;
  clicking: boolean;
  dragging: boolean;
}

const CustomCursor: React.FC = () => {
  const dotRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(true);

  // Position refs for animation loop
  const mousePos = useRef({ x: 0, y: 0 });
  const dotPos = useRef({ x: 0, y: 0 });
  const circlePos = useRef({ x: 0, y: 0 });
  const cursorState = useRef<CursorState>({
    x: 0,
    y: 0,
    visible: false,
    hovering: false,
    clicking: false,
    dragging: false,
  });

  // Magnetic effect tracking
  const magnetTarget = useRef<{ x: number; y: number; element: HTMLElement | null }>({
    x: 0,
    y: 0,
    element: null,
  });

  useEffect(() => {
    // Check if mobile
    const checkMobile = () => {
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth < 1024;
      setIsMobile(isTouchDevice || isSmallScreen);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    if (isMobile) {
      return () => window.removeEventListener('resize', checkMobile);
    }

    // Hide default cursor
    document.documentElement.style.cursor = 'none';
    document.body.style.cursor = 'none';

    // Lerp function for smooth interpolation
    const lerp = (start: number, end: number, factor: number) => {
      return start + (end - start) * factor;
    };

    // Check if element is interactive
    const isInteractive = (element: HTMLElement | null): boolean => {
      if (!element) return false;
      const interactiveSelectors = 'a, button, [role="button"], input, select, textarea, [data-cursor-hover], .cursor-pointer';
      return element.matches(interactiveSelectors) || element.closest(interactiveSelectors) !== null;
    };

    // Get nearest interactive element for magnetic effect
    const getNearestMagneticElement = (x: number, y: number): HTMLElement | null => {
      const magneticSelectors = 'a, button, [role="button"], [data-cursor-magnetic]';
      const elements = document.querySelectorAll<HTMLElement>(magneticSelectors);
      const magneticRadius = 80; // pixels

      let nearestElement: HTMLElement | null = null;
      let nearestDistance = Infinity;

      elements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));

        if (distance < magneticRadius && distance < nearestDistance) {
          nearestDistance = distance;
          nearestElement = element;
        }
      });

      return nearestElement;
    };

    // Animation loop
    let rafId: number;
    const animate = () => {
      const dot = dotRef.current;
      const circle = circleRef.current;

      if (!dot || !circle) {
        rafId = requestAnimationFrame(animate);
        return;
      }

      // Calculate target position (with magnetic effect)
      let targetX = mousePos.current.x;
      let targetY = mousePos.current.y;

      if (magnetTarget.current.element) {
        const rect = magnetTarget.current.element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const pullStrength = 0.3;
        targetX = lerp(mousePos.current.x, centerX, pullStrength);
        targetY = lerp(mousePos.current.y, centerY, pullStrength);
      }

      // Smooth interpolation for dot (faster)
      dotPos.current.x = lerp(dotPos.current.x, targetX, 0.35);
      dotPos.current.y = lerp(dotPos.current.y, targetY, 0.35);

      // Smooth interpolation for circle (slower, trailing effect)
      circlePos.current.x = lerp(circlePos.current.x, targetX, 0.15);
      circlePos.current.y = lerp(circlePos.current.y, targetY, 0.15);

      // Apply transforms
      dot.style.transform = `translate(${dotPos.current.x}px, ${dotPos.current.y}px) translate(-50%, -50%)`;
      circle.style.transform = `translate(${circlePos.current.x}px, ${circlePos.current.y}px) translate(-50%, -50%)`;

      // Update cursor states
      const state = cursorState.current;

      // Dot scaling
      let dotScale = 1;
      if (state.clicking) dotScale = 0.6;
      else if (state.hovering) dotScale = 1.5;
      dot.style.width = `${8 * dotScale}px`;
      dot.style.height = `${8 * dotScale}px`;

      // Circle scaling
      let circleScale = 1;
      if (state.clicking) circleScale = 0.8;
      else if (state.hovering) circleScale = 1.5;
      else if (state.dragging) circleScale = 1.3;
      circle.style.width = `${35 * circleScale}px`;
      circle.style.height = `${35 * circleScale}px`;

      // Visibility
      const opacity = state.visible ? 1 : 0;
      dot.style.opacity = String(opacity);
      circle.style.opacity = String(opacity * 0.5);

      rafId = requestAnimationFrame(animate);
    };

    // Mouse move handler
    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current.x = e.clientX;
      mousePos.current.y = e.clientY;
      cursorState.current.visible = true;

      // Check for interactive elements
      const target = e.target as HTMLElement;
      cursorState.current.hovering = isInteractive(target);

      // Check for magnetic elements
      const magneticElement = getNearestMagneticElement(e.clientX, e.clientY);
      magnetTarget.current.element = magneticElement;
    };

    // Mouse down/up handlers
    const handleMouseDown = () => {
      cursorState.current.clicking = true;
    };

    const handleMouseUp = () => {
      cursorState.current.clicking = false;
    };

    // Mouse enter/leave handlers
    const handleMouseEnter = () => {
      cursorState.current.visible = true;
    };

    const handleMouseLeave = () => {
      cursorState.current.visible = false;
    };

    // Drag handlers (for the main content area)
    const handleDragStart = () => {
      cursorState.current.dragging = true;
    };

    const handleDragEnd = () => {
      cursorState.current.dragging = false;
    };

    // Add event listeners for drag state detection
    const container = document.getElementById('root');
    if (container) {
      container.addEventListener('mousedown', (e) => {
        const target = e.target as HTMLElement;
        if (!isInteractive(target)) {
          handleDragStart();
        }
      });
      window.addEventListener('mouseup', handleDragEnd);
    }

    // Event listeners
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseenter', handleMouseEnter);
    document.addEventListener('mouseleave', handleMouseLeave);

    // Start animation loop
    rafId = requestAnimationFrame(animate);

    // Cleanup
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseenter', handleMouseEnter);
      document.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('mouseup', handleDragEnd);
      document.documentElement.style.cursor = '';
      document.body.style.cursor = '';
    };
  }, [isMobile]);

  // Don't render on mobile
  if (isMobile) return null;

  return (
    <>
      {/* Dot cursor - small, follows mouse closely */}
      <div
        ref={dotRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '8px',
          height: '8px',
          backgroundColor: '#00f3ff',
          borderRadius: '50%',
          pointerEvents: 'none',
          zIndex: 99999,
          mixBlendMode: 'difference',
          transition: 'width 0.2s ease, height 0.2s ease, background-color 0.2s ease',
          willChange: 'transform',
        }}
      />
      {/* Circle cursor - larger, trails behind */}
      <div
        ref={circleRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '35px',
          height: '35px',
          border: '1px solid rgba(0, 243, 255, 0.5)',
          borderRadius: '50%',
          pointerEvents: 'none',
          zIndex: 99998,
          transition: 'width 0.3s ease, height 0.3s ease, border-color 0.2s ease',
          willChange: 'transform',
        }}
      />
    </>
  );
};

export default CustomCursor;
