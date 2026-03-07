import React, { useMemo } from 'react';

interface ParallaxLayersProps {
  scrollProgress: number;
}

// Premium parallax layers with elegant geometric elements
const ParallaxLayers: React.FC<ParallaxLayersProps> = ({ scrollProgress }) => {
  // Disable on mobile for performance
  const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || 'ontouchstart' in window);

  // Memoize scroll-based transforms for performance
  const transforms = useMemo(() => ({
    layer1: `translateY(${scrollProgress * 30}px)`,
    layer2: `translateY(${scrollProgress * 60}px)`,
    layer3: `translateY(${scrollProgress * 100}px)`,
    rotation: scrollProgress * 15,
  }), [scrollProgress]);

  if (isMobile) {
    // Mobile: minimal static accents
    return (
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-[1]">
        {/* Simple vertical lines */}
        <div className="absolute left-[12%] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/[0.03] to-transparent" />
        <div className="absolute right-[12%] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/[0.03] to-transparent" />

        {/* Single horizontal accent */}
        <div className="absolute top-[30%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/[0.05] to-transparent" />
      </div>
    );
  }

  // Desktop: full premium parallax effect
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-[1]">
      {/* Layer 1 - Slowest / Deepest */}
      <div
        className="absolute inset-0"
        style={{
          transform: transforms.layer1,
          willChange: 'transform',
        }}
      >
        {/* Large gradient orb */}
        <div
          className="absolute -top-[20%] -left-[10%] w-[700px] h-[700px] rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 60%)',
            filter: 'blur(100px)',
          }}
        />

        {/* Geometric accent - large ring */}
        <div
          className="absolute top-[15%] right-[8%] w-[200px] h-[200px] rounded-full border border-white/[0.03]"
          style={{
            transform: `rotate(${transforms.rotation}deg)`,
          }}
        />
      </div>

      {/* Layer 2 - Medium */}
      <div
        className="absolute inset-0"
        style={{
          transform: transforms.layer2,
          willChange: 'transform',
        }}
      >
        {/* Vertical lines with varying opacities */}
        <div className="absolute left-[8%] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/[0.04] to-transparent" />
        <div className="absolute left-[25%] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-blue-500/[0.06] to-transparent" />
        <div className="absolute right-[15%] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-white/[0.03] to-transparent" />
        <div className="absolute right-[30%] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-purple-500/[0.04] to-transparent" />

        {/* Diagonal accent line */}
        <div
          className="absolute top-[10%] left-[5%] w-[300px] h-px origin-left"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.1), transparent)',
            transform: `rotate(${25 + scrollProgress * 5}deg)`,
          }}
        />

        {/* Small geometric shapes */}
        <div
          className="absolute top-[40%] left-[15%] w-8 h-8"
          style={{
            border: '1px solid rgba(59, 130, 246, 0.1)',
            transform: `rotate(${45 + transforms.rotation * 2}deg)`,
          }}
        />
        <div
          className="absolute top-[60%] right-[20%] w-6 h-6 rounded-full"
          style={{
            border: '1px solid rgba(139, 92, 246, 0.1)',
          }}
        />
      </div>

      {/* Layer 3 - Fastest / Nearest */}
      <div
        className="absolute inset-0"
        style={{
          transform: transforms.layer3,
          willChange: 'transform',
        }}
      >
        {/* Horizontal lines */}
        <div className="absolute top-[20%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
        <div className="absolute top-[45%] left-[20%] right-[20%] h-px bg-gradient-to-r from-transparent via-blue-500/[0.05] to-transparent" />
        <div className="absolute top-[70%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/[0.02] to-transparent" />

        {/* Floating dot accents */}
        <div
          className="absolute top-[25%] right-[25%] w-1 h-1 rounded-full bg-blue-500/30"
          style={{
            boxShadow: '0 0 10px rgba(59, 130, 246, 0.3)',
          }}
        />
        <div
          className="absolute top-[55%] left-[30%] w-1 h-1 rounded-full bg-purple-500/20"
          style={{
            boxShadow: '0 0 8px rgba(139, 92, 246, 0.2)',
          }}
        />
        <div
          className="absolute top-[75%] right-[35%] w-0.5 h-0.5 rounded-full bg-white/30"
        />
      </div>

      {/* Static corner accents (no parallax for stability) */}
      <div className="absolute top-6 left-6 w-16 h-16 border-l border-t border-white/[0.04]" />
      <div className="absolute top-6 right-6 w-16 h-16 border-r border-t border-white/[0.04]" />
      <div className="absolute bottom-6 left-6 w-16 h-16 border-l border-b border-white/[0.04]" />
      <div className="absolute bottom-6 right-6 w-16 h-16 border-r border-b border-white/[0.04]" />

      {/* Center cross accent */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03]">
        <div className="w-px h-32 bg-white absolute left-1/2 -translate-x-1/2" />
        <div className="h-px w-32 bg-white absolute top-1/2 -translate-y-1/2" />
      </div>

      {/* Gradient overlays for depth */}
      <div
        className="absolute inset-0 opacity-50"
        style={{
          background: `
            radial-gradient(ellipse at 30% 20%, rgba(59, 130, 246, 0.03) 0%, transparent 40%),
            radial-gradient(ellipse at 70% 80%, rgba(139, 92, 246, 0.02) 0%, transparent 40%)
          `,
        }}
      />
    </div>
  );
};

export default ParallaxLayers;
