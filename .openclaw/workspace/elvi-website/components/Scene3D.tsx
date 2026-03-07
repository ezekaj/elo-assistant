import React, { useEffect, useRef, useState } from 'react';

interface Scene3DProps {
  scrollProgress: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  baseHue: number;
}

// Detect mobile device
const isMobile = () => {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || 'ontouchstart' in window;
};

// Premium 3D Scene inspired by igloo.inc
const Scene3D: React.FC<Scene3DProps> = ({ scrollProgress }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mobile, setMobile] = useState(false);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    setMobile(isMobile());
  }, []);

  // Canvas-based particle system (desktop only)
  useEffect(() => {
    if (mobile || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize particles
    const particleCount = 80;
    particlesRef.current = Array.from({ length: particleCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      z: Math.random() * 1000,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      vz: (Math.random() - 0.5) * 2,
      size: Math.random() * 2 + 1,
      baseHue: 210 + Math.random() * 40, // Blue to purple range
    }));

    // Mouse tracking
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      };
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Animation loop
    const animate = () => {
      ctx.fillStyle = 'rgba(3, 3, 4, 0.1)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Mouse influence
      const mouseInfluenceX = (mouseRef.current.x - 0.5) * 100;
      const mouseInfluenceY = (mouseRef.current.y - 0.5) * 100;

      particlesRef.current.forEach((p) => {
        // Update velocity based on scroll
        p.vz += scrollProgress * 0.01;

        // Update position
        p.x += p.vx + mouseInfluenceX * 0.01;
        p.y += p.vy + mouseInfluenceY * 0.01;
        p.z += p.vz;

        // Calculate speed for color shift (igloo.inc style)
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);

        // Hue shifts based on speed - faster = more towards cyan/green
        const hue = p.baseHue + speed * 50;
        const saturation = 70 + speed * 20;
        const lightness = 50 + speed * 10;

        // Wrap around edges
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        if (p.z < 0) p.z = 1000;
        if (p.z > 1000) p.z = 0;

        // 3D projection
        const perspective = 800;
        const scale = perspective / (perspective + p.z);
        const projX = centerX + (p.x - centerX) * scale;
        const projY = centerY + (p.y - centerY) * scale;
        const projSize = p.size * scale;

        // Draw particle with glow
        const alpha = scale * 0.8;

        // Outer glow
        const gradient = ctx.createRadialGradient(projX, projY, 0, projX, projY, projSize * 4);
        gradient.addColorStop(0, `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha * 0.5})`);
        gradient.addColorStop(0.5, `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha * 0.2})`);
        gradient.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(projX, projY, projSize * 4, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Core
        ctx.beginPath();
        ctx.arc(projX, projY, projSize, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness + 20}%, ${alpha})`;
        ctx.fill();

        // Dampen velocity
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.vz *= 0.98;

        // Add slight random movement
        p.vx += (Math.random() - 0.5) * 0.02;
        p.vy += (Math.random() - 0.5) * 0.02;
      });

      // Draw connection lines between nearby particles
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.05)';
      ctx.lineWidth = 0.5;

      for (let i = 0; i < particlesRef.current.length; i++) {
        for (let j = i + 1; j < particlesRef.current.length; j++) {
          const p1 = particlesRef.current[i];
          const p2 = particlesRef.current[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 150) {
            const perspective = 800;
            const scale1 = perspective / (perspective + p1.z);
            const scale2 = perspective / (perspective + p2.z);
            const projX1 = centerX + (p1.x - centerX) * scale1;
            const projY1 = centerY + (p1.y - centerY) * scale1;
            const projX2 = centerX + (p2.x - centerX) * scale2;
            const projY2 = centerY + (p2.y - centerY) * scale2;

            ctx.beginPath();
            ctx.moveTo(projX1, projY1);
            ctx.lineTo(projX2, projY2);
            ctx.globalAlpha = (1 - distance / 150) * 0.3;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [mobile, scrollProgress]);

  return (
    <div ref={containerRef} className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {/* Base gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 20% 20%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
            radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.06) 0%, transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(30, 41, 59, 0.5) 0%, transparent 80%),
            linear-gradient(180deg, #030304 0%, #0a0a12 50%, #030304 100%)
          `,
        }}
      />

      {/* Canvas for particle system (desktop) */}
      {!mobile && (
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          style={{
            opacity: 0.8,
            mixBlendMode: 'screen',
          }}
        />
      )}

      {/* Mobile: simplified static elements - smaller and more subtle */}
      {mobile && (
        <>
          <div
            className="absolute w-[100px] h-[100px] rounded-full opacity-10"
            style={{
              top: '15%',
              left: '10%',
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)',
              filter: 'blur(40px)',
            }}
          />
          <div
            className="absolute w-[80px] h-[80px] rounded-full opacity-10"
            style={{
              bottom: '25%',
              right: '15%',
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.3) 0%, transparent 70%)',
              filter: 'blur(30px)',
            }}
          />
        </>
      )}

      {/* Gradient orbs - desktop only with subtle animation */}
      {!mobile && (
        <>
          <div
            className="absolute w-[600px] h-[600px] rounded-full"
            style={{
              top: '5%',
              left: '15%',
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, transparent 60%)',
              filter: 'blur(80px)',
              transform: `translate(${scrollProgress * 30}px, ${scrollProgress * 20}px)`,
              transition: 'transform 0.3s ease-out',
            }}
          />
          <div
            className="absolute w-[500px] h-[500px] rounded-full"
            style={{
              bottom: '10%',
              right: '10%',
              background: 'radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 60%)',
              filter: 'blur(70px)',
              transform: `translate(${-scrollProgress * 20}px, ${-scrollProgress * 30}px)`,
              transition: 'transform 0.3s ease-out',
            }}
          />
          <div
            className="absolute w-[400px] h-[400px] rounded-full"
            style={{
              top: '50%',
              left: '50%',
              transform: `translate(-50%, -50%) scale(${1 + scrollProgress * 0.3})`,
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.05) 0%, transparent 60%)',
              filter: 'blur(60px)',
              transition: 'transform 0.3s ease-out',
            }}
          />
        </>
      )}

      {/* Grid floor with perspective */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[300%] h-[60vh] origin-bottom"
        style={{
          transform: `perspective(1000px) rotateX(70deg) translateY(${scrollProgress * 150}px)`,
          opacity: mobile ? 0.1 : 0.2,
        }}
      >
        <div
          className="w-full h-full"
          style={{
            backgroundImage: `
              linear-gradient(rgba(59, 130, 246, 0.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(59, 130, 246, 0.08) 1px, transparent 1px)
            `,
            backgroundSize: mobile ? '60px 60px' : '100px 100px',
            maskImage: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 70%)',
            WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Floating geometric shapes (desktop only) */}
      {!mobile && (
        <div className="absolute inset-0" style={{ perspective: '1500px' }}>
          {/* Hexagon-like shape */}
          <div
            className="absolute"
            style={{
              top: '20%',
              right: '20%',
              width: '120px',
              height: '120px',
              border: '1px solid rgba(59, 130, 246, 0.15)',
              transform: `rotateX(${45 + scrollProgress * 30}deg) rotateY(${30 + scrollProgress * 20}deg) rotateZ(${scrollProgress * 10}deg)`,
              transformStyle: 'preserve-3d',
              transition: 'transform 0.5s ease-out',
            }}
          />
          {/* Circle ring */}
          <div
            className="absolute"
            style={{
              bottom: '30%',
              left: '15%',
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              transform: `rotateX(${60 - scrollProgress * 20}deg) rotateY(${-20 + scrollProgress * 15}deg)`,
              transformStyle: 'preserve-3d',
              transition: 'transform 0.5s ease-out',
            }}
          />
          {/* Diamond shape */}
          <div
            className="absolute"
            style={{
              top: '60%',
              right: '30%',
              width: '60px',
              height: '60px',
              border: '1px solid rgba(16, 185, 129, 0.15)',
              transform: `rotate(45deg) rotateX(${scrollProgress * 40}deg) rotateY(${scrollProgress * 25}deg)`,
              transformStyle: 'preserve-3d',
              transition: 'transform 0.5s ease-out',
            }}
          />
        </div>
      )}

      {/* Stars - reduced on mobile */}
      <div className="absolute inset-0">
        {[...Array(mobile ? 15 : 40)].map((_, i) => (
          <div
            key={`star-${i}`}
            className="absolute rounded-full"
            style={{
              top: `${(i * 37) % 100}%`,
              left: `${(i * 53) % 100}%`,
              width: `${1 + (i % 2)}px`,
              height: `${1 + (i % 2)}px`,
              backgroundColor: i % 5 === 0 ? 'rgba(59, 130, 246, 0.6)' : 'rgba(255, 255, 255, 0.4)',
              boxShadow: i % 5 === 0 ? '0 0 4px rgba(59, 130, 246, 0.4)' : 'none',
              opacity: 0.3 + (i % 4) * 0.15,
            }}
          />
        ))}
      </div>

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.6) 100%)',
        }}
      />
    </div>
  );
};

export default Scene3D;
