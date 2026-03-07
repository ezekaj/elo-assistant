import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

export interface HUDHandle {
  updateVelocity: (v: number) => void;
  updateCoord: (c: number) => void;
  updateFPS: (fps: number) => void;
}

const HUD = forwardRef<HUDHandle>((_, ref) => {
  const velRef = useRef<HTMLElement>(null);
  const fpsRef = useRef<HTMLElement>(null);
  const coordRef = useRef<HTMLElement>(null);

  useImperativeHandle(ref, () => ({
    updateVelocity: (v: number) => {
      if (velRef.current) velRef.current.innerText = Math.abs(v).toFixed(2);
    },
    updateCoord: (c: number) => {
      if (coordRef.current) coordRef.current.innerText = c.toFixed(0).padStart(6, '0');
    },
    updateFPS: (fps: number) => {
      if (fpsRef.current) fpsRef.current.innerText = String(Math.round(fps));
    },
  }));

  return (
    <div className="hud">
      <div className="hud-top">
        <span>SYS.READY</span>
        <div className="hud-line" />
        <span>FPS: <strong ref={fpsRef}>60</strong></span>
      </div>

      <div
        style={{
          alignSelf: 'flex-start',
          marginTop: 'auto',
          marginBottom: 'auto',
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
        }}
      >
        SCROLL VELOCITY // <strong ref={velRef}>0.00</strong>
      </div>

      <div className="hud-bottom">
        <span>COORD: <strong ref={coordRef}>000000</strong></span>
        <div className="hud-line" />
        <span>VER 2.0.4 [BETA]</span>
      </div>
    </div>
  );
});

export default HUD;
