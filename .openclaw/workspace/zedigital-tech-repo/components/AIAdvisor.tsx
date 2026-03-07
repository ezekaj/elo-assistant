import React, { useState, useRef, useEffect } from 'react';
import { Cpu, Command, Loader2, Terminal, Zap } from 'lucide-react';
import { getAIAdvisorResponse } from '../services/geminiService';

const AIAdvisor: React.FC = () => {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [glitchText, setGlitchText] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Occasional glitch effect
  useEffect(() => {
    const glitchInterval = setInterval(() => {
      if (Math.random() > 0.95) {
        setGlitchText(true);
        setTimeout(() => setGlitchText(false), 100);
      }
    }, 2000);
    return () => clearInterval(glitchInterval);
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);
    const history = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));
    const response = await getAIAdvisorResponse(userMsg, history);
    setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    setIsLoading(false);
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-start">

        {/* Left - Info */}
        <div className="lg:col-span-4 text-center lg:text-left">
          <div className="mono text-[8px] sm:text-[9px] text-blue-500 mb-3 sm:mb-4 tracking-[0.3em] sm:tracking-[0.5em] font-medium uppercase opacity-50">
            Intelligence
          </div>
          <h2 className={`serif text-3xl sm:text-5xl md:text-6xl font-medium mb-4 sm:mb-6 tracking-tight transition-all duration-100 ${glitchText ? 'text-blue-400 translate-x-0.5' : ''}`}>
            The Lab.
          </h2>
          <div className="h-px w-24 bg-gradient-to-r from-blue-500/50 to-transparent mb-4 sm:mb-6 mx-auto lg:mx-0"></div>
          <p className="text-gray-500 text-xs sm:text-sm serif italic leading-relaxed mb-6 sm:mb-8 max-w-xs mx-auto lg:mx-0">
            Automated architectural scoping for complex digital environments.
          </p>

          {/* Status Card */}
          <div className="p-3 sm:p-4 bg-white/[0.02] border border-white/[0.05] hover:border-blue-500/20 transition-colors duration-300">
            <div className="flex items-center gap-3 sm:gap-4 justify-center lg:justify-start">
              <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <Cpu className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                {/* Pulse ring */}
                <span className="absolute inset-0 rounded-full border border-blue-500/30 animate-ping" style={{ animationDuration: '2s' }} />
              </div>
              <div>
                <div className="mono text-[7px] sm:text-[8px] text-gray-600 uppercase tracking-widest">Neural Engine</div>
                <div className="text-[10px] sm:text-xs font-medium text-blue-400 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  Gemini Active
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 mt-3 sm:mt-4">
            <div className="p-2 sm:p-3 bg-white/[0.01] border border-white/[0.03]">
              <div className="mono text-[7px] text-gray-600 uppercase tracking-wider mb-1">Latency</div>
              <div className="text-[10px] sm:text-xs text-blue-400 flex items-center gap-1">
                <Zap className="w-2.5 h-2.5" />
                ~120ms
              </div>
            </div>
            <div className="p-2 sm:p-3 bg-white/[0.01] border border-white/[0.03]">
              <div className="mono text-[7px] text-gray-600 uppercase tracking-wider mb-1">Model</div>
              <div className="text-[10px] sm:text-xs text-gray-400">Gemini 2.0</div>
            </div>
          </div>
        </div>

        {/* Right - Terminal */}
        <div className="lg:col-span-8">
          <div
            ref={terminalRef}
            className="relative bg-[#0a0a0a] border border-white/[0.08] overflow-hidden flex flex-col h-[350px] sm:h-[450px] lg:h-[500px] glow-blue"
          >
            {/* Scanline overlay */}
            <div
              className="absolute inset-0 pointer-events-none z-20 opacity-[0.03]"
              style={{
                background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
              }}
            />

            {/* CRT flicker effect */}
            <div
              className="absolute inset-0 pointer-events-none z-20 opacity-0 animate-pulse"
              style={{
                background: 'rgba(59, 130, 246, 0.02)',
                animationDuration: '0.1s',
              }}
            />

            {/* Vignette */}
            <div
              className="absolute inset-0 pointer-events-none z-20"
              style={{
                background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)',
              }}
            />

            {/* Header */}
            <div className="relative z-30 px-4 sm:px-6 py-3 sm:py-4 border-b border-white/[0.05] bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex gap-1 sm:gap-1.5">
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-500/40 hover:bg-red-500/70 transition-colors cursor-pointer"></div>
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-yellow-500/40 hover:bg-yellow-500/70 transition-colors cursor-pointer"></div>
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-500/40 hover:bg-green-500/70 transition-colors cursor-pointer"></div>
                </div>
                <div className="flex items-center gap-2">
                  <Terminal className="w-3 h-3 text-gray-600" />
                  <span className="mono text-[8px] sm:text-[9px] text-gray-600 tracking-widest uppercase">zedigital://lab/advisor</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                <span className="mono text-[7px] sm:text-[8px] text-blue-500/60 uppercase">Connected</span>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="relative z-30 flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
              {messages.length === 0 && (
                <div className="mono text-[9px] sm:text-[10px] text-blue-500/40 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-green-500">▸</span>
                    <span>[SYS] Neural connection established</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-500">▸</span>
                    <span>[SYS] Gemini model loaded</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-500">▸</span>
                    <span>[LOG] Awaiting input<span className="inline-block w-[6px] h-[10px] bg-yellow-500/70 ml-0.5 align-middle cursor-blink"></span></span>
                  </div>
                  <div className="h-4"></div>
                  <div className="text-gray-600 italic">
                    Ask about web development, AI integration, system architecture, or digital strategy.
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`${msg.role === 'user' ? 'text-right' : ''} animate-fadeIn`}>
                  <div className="mono text-[7px] sm:text-[8px] text-gray-600 mb-1 sm:mb-2 uppercase tracking-widest flex items-center gap-2 justify-start">
                    {msg.role === 'user' ? (
                      <>
                        <span className="text-blue-500">◆</span>
                        <span>User Input</span>
                      </>
                    ) : (
                      <>
                        <span className="text-green-500">◆</span>
                        <span>Engine Response</span>
                      </>
                    )}
                  </div>
                  <div className={`text-xs sm:text-sm leading-relaxed p-3 sm:p-4 ${
                    msg.role === 'user'
                      ? 'bg-blue-500/10 border-l-2 border-blue-500/50 text-blue-300'
                      : 'bg-white/[0.02] border-l-2 border-green-500/30 text-gray-300'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-center gap-3 text-gray-600 p-3 bg-white/[0.02]">
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin text-blue-500" />
                  <div className="flex items-center gap-2">
                    <span className="mono text-[8px] sm:text-[9px] uppercase tracking-widest">Processing query</span>
                    <span className="flex gap-1">
                      <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-1 h-1 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="relative z-30 p-3 sm:p-4 border-t border-white/[0.05] bg-white/[0.02]">
              <div className="flex items-center gap-2 sm:gap-3 bg-[#050505] border border-white/[0.08] px-3 sm:px-4 py-2 sm:py-3 focus-within:border-blue-500/40 focus-within:shadow-[0_0_20px_rgba(59,130,246,0.1)] transition-all duration-300">
                <Command className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500/50" />
                <span className="mono text-blue-500/70 text-xs">$</span>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Enter command..."
                  className="flex-1 bg-transparent text-xs sm:text-sm text-white placeholder-gray-700 focus:outline-none mono"
                />
                <button
                  onClick={handleSend}
                  disabled={isLoading || !input.trim()}
                  className="mono text-[9px] sm:text-[10px] font-medium px-3 py-1 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-all uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  Execute
                </button>
              </div>
              <div className="flex items-center justify-between mt-2 px-1">
                <span className="mono text-[7px] text-gray-700 uppercase tracking-wider">Press Enter to submit</span>
                <span className="mono text-[7px] text-gray-700">
                  {messages.length} message{messages.length !== 1 ? 's' : ''} in session
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add keyframe animation for fade in */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default AIAdvisor;
