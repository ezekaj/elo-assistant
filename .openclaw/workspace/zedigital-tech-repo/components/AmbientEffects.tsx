import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

interface AmbientEffectsProps {
  enableNoise?: boolean;
  enableScanlines?: boolean;
  enableMouseGlow?: boolean;
  enableParticles?: boolean;
  particleCount?: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  baseHue: number;
  pulseOffset: number;
}

// Premium ambient effects inspired by igloo.inc
const AmbientEffects: React.FC<AmbientEffectsProps> = ({
  enableNoise = true,
  enableScanlines = true,
  enableMouseGlow = true,
  enableParticles = true,
  particleCount = 35,
}) => {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isMobile, setIsMobile] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const animationRef = useRef<number>(0);
  const particleRef = useRef<Particle[]>([]);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const mouseVelocity = useRef({ x: 0, y: 0 });

  // Check for mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize particles
  useEffect(() => {
    if (!enableParticles) return;

    const count = isMobile ? Math.floor(particleCount / 3) : particleCount;
    const initialParticles: Particle[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 1,
      speedX: (Math.random() - 0.5) * 0.03,
      speedY: (Math.random() - 0.5) * 0.03 - 0.01,
      baseHue: 210 + Math.random() * 30, // Blue range
      pulseOffset: Math.random() * Math.PI * 2,
    }));

    particleRef.current = initialParticles;
    setParticles(initialParticles);
  }, [enableParticles, particleCount, isMobile]);

  // Animate particles with speed-based color changes
  useEffect(() => {
    if (!enableParticles || particles.length === 0) return;

    let lastTime = performance.now();

    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 16.67;
      lastTime = currentTime;

      particleRef.current = particleRef.current.map((p) => {
        // Update position
        let newX = p.x + p.speedX * deltaTime;
        let newY = p.y + p.speedY * deltaTime;

        // Mouse influence (desktop only)
        if (!isMobile && mouseVelocity.current.x !== 0) {
          const dx = mousePos.x / window.innerWidth * 100 - p.x;
          const dy = mousePos.y / window.innerHeight * 100 - p.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 30) {
            const force = (30 - distance) / 30 * 0.02;
            p.speedX += dx * force * 0.01;
            p.speedY += dy * force * 0.01;
          }
        }

        // Wrap around edges
        if (newX < -5) newX = 105;
        if (newX > 105) newX = -5;
        if (newY < -5) newY = 105;
        if (newY > 105) newY = -5;

        // Dampen velocity
        p.speedX *= 0.995;
        p.speedY *= 0.995;

        // Add slight random movement
        p.speedX += (Math.random() - 0.5) * 0.005;
        p.speedY += (Math.random() - 0.5) * 0.005;

        return { ...p, x: newX, y: newY };
      });

      setParticles([...particleRef.current]);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [enableParticles, particles.length, isMobile, mousePos]);

  // Mouse tracking for glow effect (desktop only)
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!enableMouseGlow || isMobile) return;

    // Calculate velocity for particle interaction
    mouseVelocity.current = {
      x: e.clientX - lastMousePos.current.x,
      y: e.clientY - lastMousePos.current.y,
    };
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    setMousePos({ x: e.clientX, y: e.clientY });
  }, [enableMouseGlow, isMobile]);

  useEffect(() => {
    if (!enableMouseGlow || isMobile) return;

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [enableMouseGlow, isMobile, handleMouseMove]);

  // Calculate particle color based on speed (igloo.inc style)
  const getParticleColor = useCallback((particle: Particle) => {
    const speed = Math.sqrt(particle.speedX * particle.speedX + particle.speedY * particle.speedY);
    const normalizedSpeed = Math.min(speed * 50, 1);

    // Shift from blue to cyan/green based on speed
    const hue = particle.baseHue + normalizedSpeed * 60;
    const saturation = 70 + normalizedSpeed * 20;
    const lightness = 50 + normalizedSpeed * 15;
    const opacity = 0.2 + normalizedSpeed * 0.4;

    return {
      color: `hsla(${hue}, ${saturation}%, ${lightness}%, ${opacity})`,
      glow: `0 0 ${4 + normalizedSpeed * 8}px hsla(${hue}, ${saturation}%, ${lightness}%, ${opacity * 0.6})`,
    };
  }, []);

  // Noise/Grain SVG filter
  const noiseFilter = useMemo(() => (
    <svg className="absolute w-0 h-0" aria-hidden="true">
      <defs>
        <filter id="noise-filter" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="4"
            stitchTiles="stitch"
            result="noise"
          />
          <feColorMatrix
            type="saturate"
            values="0"
            in="noise"
            result="monoNoise"
          />
          <feBlend
            in="SourceGraphic"
            in2="monoNoise"
            mode="multiply"
          />
        </filter>
      </defs>
    </svg>
  ), []);

  return (
    <>
      {/* SVG filter definition */}
      {enableNoise && noiseFilter}

      {/* Noise/Grain overlay - subtle film grain effect */}
      {enableNoise && (
        <div
          className="fixed inset-0 pointer-events-none z-[100]"
          style={{
            background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            opacity: 0.025,
            mixBlendMode: 'overlay',
          }}
        />
      )}

      {/* Scanline effect - subtle CRT aesthetic */}
      {enableScanlines && (
        <div
          className="fixed inset-0 pointer-events-none z-[101]"
          style={{
            background: `repeating-linear-gradient(
              0deg,
              transparent,
              transparent 2px,
              rgba(0, 0, 0, 0.012) 2px,
              rgba(0, 0, 0, 0.012) 4px
            )`,
            opacity: isMobile ? 0.4 : 0.8,
          }}
        />
      )}

      {/* Mouse-following glow effect (desktop only) - enhanced with gradient */}
      {enableMouseGlow && !isMobile && (
        <>
          {/* Primary glow */}
          <div
            className="fixed pointer-events-none z-[5] transition-opacity duration-200"
            style={{
              left: mousePos.x - 250,
              top: mousePos.y - 250,
              width: 500,
              height: 500,
              background: `radial-gradient(
                circle at center,
                rgba(59, 130, 246, 0.06) 0%,
                rgba(59, 130, 246, 0.03) 25%,
                rgba(139, 92, 246, 0.02) 50%,
                transparent 70%
              )`,
              transform: 'translate3d(0, 0, 0)',
              willChange: 'left, top',
            }}
          />
          {/* Secondary smaller glow - follows faster */}
          <div
            className="fixed pointer-events-none z-[6]"
            style={{
              left: mousePos.x - 75,
              top: mousePos.y - 75,
              width: 150,
              height: 150,
              background: `radial-gradient(
                circle at center,
                rgba(59, 130, 246, 0.1) 0%,
                rgba(59, 130, 246, 0.05) 40%,
                transparent 70%
              )`,
              transform: 'translate3d(0, 0, 0)',
              willChange: 'left, top',
              mixBlendMode: 'screen',
            }}
          />
        </>
      )}

      {/* Floating particles with speed-based color */}
      {enableParticles && (
        <div className="fixed inset-0 pointer-events-none z-[4] overflow-hidden">
          {particles.map((particle) => {
            const { color, glow } = getParticleColor(particle);
            return (
              <div
                key={particle.id}
                className="absolute rounded-full"
                style={{
                  left: `${particle.x}%`,
                  top: `${particle.y}%`,
                  width: particle.size,
                  height: particle.size,
                  backgroundColor: color,
                  boxShadow: glow,
                  transform: 'translate(-50%, -50%)',
                  willChange: 'left, top',
                }}
              />
            );
          })}
        </div>
      )}

      {/* Subtle vignette overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[3]"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0, 0, 0, 0.3) 100%)',
        }}
      />
    </>
  );
};

export default AmbientEffects;
