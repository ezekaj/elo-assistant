import React, { useRef, useState, useEffect } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

const AmbientAudio: React.FC = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Create ambient drone sound using Web Audio API
  const createAmbientSound = () => {
    if (audioContextRef.current) return;

    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    // Master gain node
    const masterGain = ctx.createGain();
    masterGain.gain.value = 0;
    masterGain.connect(ctx.destination);
    gainNodeRef.current = masterGain;

    // Create multiple oscillators for rich ambient sound
    const frequencies = [55, 82.5, 110, 165]; // Low drone frequencies

    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.value = freq;
      oscGain.gain.value = 0.15 / (i + 1); // Reduce volume for higher frequencies

      osc.connect(oscGain);
      oscGain.connect(masterGain);
      osc.start();

      oscillatorsRef.current.push(osc);

      // Add subtle frequency modulation
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.1 + (i * 0.05); // Very slow modulation
      lfoGain.gain.value = 2; // Subtle pitch variation
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start();
    });
  };

  const toggleAudio = async () => {
    setHasInteracted(true);

    if (!audioContextRef.current) {
      createAmbientSound();
    }

    const ctx = audioContextRef.current;
    const gain = gainNodeRef.current;

    if (!ctx || !gain) return;

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (isPlaying) {
      // Fade out
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
      setIsPlaying(false);
    } else {
      // Fade in
      gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + 1);
      setIsPlaying(true);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      oscillatorsRef.current.forEach(osc => osc.stop());
      audioContextRef.current?.close();
    };
  }, []);

  return (
    <button
      onClick={toggleAudio}
      className={`fixed bottom-4 sm:bottom-6 left-4 sm:left-6 z-50 w-9 h-9 sm:w-10 sm:h-10 rounded-full
                 flex items-center justify-center transition-all duration-300
                 ${isPlaying
                   ? 'bg-blue-500/20 border border-blue-500/50 glow-blue'
                   : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}
      aria-label={isPlaying ? 'Mute ambient audio' : 'Play ambient audio'}
    >
      {isPlaying ? (
        <Volume2 className="w-4 h-4 text-blue-400" />
      ) : (
        <VolumeX className="w-4 h-4 text-gray-500" />
      )}

      {/* Pulse ring when playing */}
      {isPlaying && (
        <span className="absolute inset-0 rounded-full border border-blue-500/30 animate-ping" />
      )}
    </button>
  );
};

export default AmbientAudio;
