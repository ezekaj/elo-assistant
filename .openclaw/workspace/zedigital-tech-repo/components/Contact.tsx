import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUpRight, Terminal, Send, Zap, CheckCircle, AlertCircle, RefreshCw, Github, Linkedin, Twitter } from 'lucide-react';
import emailjs from '@emailjs/browser';
import { SERVICES } from '../constants';
import {
  keyframeDefinitions,
  useInView,
  useAnimationConfig,
  ANIMATION_DURATIONS,
  ANIMATION_EASINGS,
  getStaggerDelay,
} from '../utils/animations';

const EMAILJS_SERVICE_ID = 'service_permbcj';
const EMAILJS_TEMPLATE_ID = 'template_bqpgg0f';
const EMAILJS_PUBLIC_KEY = '42n0yt2zg1-x6TNDT';

// Validation types
interface ValidationErrors {
  name?: string;
  email?: string;
  service?: string;
  message?: string;
}

interface FormState {
  name: string;
  email: string;
  service: string;
  message: string;
}

type SubmissionStatus = 'idle' | 'submitting' | 'success' | 'error';

// Confetti particle component
const ConfettiParticle: React.FC<{ index: number }> = ({ index }) => {
  const colors = ['#3B82F6', '#60A5FA', '#93C5FD', '#22D3EE', '#10B981', '#34D399'];
  const color = colors[index % colors.length];
  const delay = Math.random() * 0.5;
  const duration = 2 + Math.random() * 2;
  const startX = Math.random() * 100;
  const drift = (Math.random() - 0.5) * 100;

  return (
    <div
      className="absolute w-2 h-2 rounded-full pointer-events-none"
      style={{
        backgroundColor: color,
        left: `${startX}%`,
        top: '-10px',
        animation: `confetti-fall ${duration}s ease-out ${delay}s forwards`,
        transform: `translateX(${drift}px)`,
      }}
    />
  );
};

// Confetti container
const Confetti: React.FC<{ show: boolean }> = ({ show }) => {
  if (!show) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-30">
      {Array.from({ length: 50 }).map((_, i) => (
        <ConfettiParticle key={i} index={i} />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% {
            opacity: 1;
            transform: translateY(0) rotate(0deg) scale(1);
          }
          100% {
            opacity: 0;
            transform: translateY(400px) rotate(720deg) scale(0.5);
          }
        }
      `}</style>
    </div>
  );
};

// Social media links configuration
const SOCIAL_LINKS = [
  { name: 'GitHub', icon: Github, url: 'https://github.com/ezekaj' },
  { name: 'LinkedIn', icon: Linkedin, url: 'https://www.linkedin.com/company/zedigitaltech' },
  { name: 'Instagram', icon: () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 sm:w-3.5 sm:h-3.5">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
    </svg>
  ), url: 'https://www.instagram.com/zedigitaltech' },
  { name: 'Twitter', icon: Twitter, url: 'https://twitter.com/zedigitaltech' },
];

const Contact: React.FC = () => {
  const [formState, setFormState] = useState<FormState>({
    name: '',
    email: '',
    service: '',
    message: ''
  });
  const [focused, setFocused] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('idle');
  const [submissionError, setSubmissionError] = useState<string>('');
  const [showConfetti, setShowConfetti] = useState(false);
  const [mounted, setMounted] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
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

  // Animation styles matching Services component
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

  // Email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Validate a single field
  const validateField = useCallback((field: keyof FormState, value: string): string | undefined => {
    switch (field) {
      case 'name':
        if (!value.trim()) return 'Name is required';
        if (value.trim().length < 2) return 'Name must be at least 2 characters';
        return undefined;
      case 'email':
        if (!value.trim()) return 'Email is required';
        if (!emailRegex.test(value)) return 'Please enter a valid email';
        return undefined;
      case 'service':
        if (!value) return 'Please select a service type';
        return undefined;
      case 'message':
        if (!value.trim()) return 'Message is required';
        if (value.trim().length < 10) return 'Message must be at least 10 characters';
        return undefined;
      default:
        return undefined;
    }
  }, []);

  // Validate all fields
  const validateForm = useCallback((): ValidationErrors => {
    const newErrors: ValidationErrors = {};
    (Object.keys(formState) as Array<keyof FormState>).forEach(field => {
      const error = validateField(field, formState[field]);
      if (error) newErrors[field] = error;
    });
    return newErrors;
  }, [formState, validateField]);

  // Real-time validation on change (only for touched fields)
  useEffect(() => {
    const newErrors: ValidationErrors = {};
    (Object.keys(touched) as Array<keyof FormState>).forEach(field => {
      if (touched[field]) {
        const error = validateField(field, formState[field]);
        if (error) newErrors[field] = error;
      }
    });
    setErrors(newErrors);
  }, [formState, touched, validateField]);

  const handleBlur = (field: keyof FormState) => {
    setFocused(null);
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleChange = (field: keyof FormState, value: string) => {
    setFormState(s => ({ ...s, [field]: value }));
    // Clear submission status when user starts editing
    if (submissionStatus === 'error') {
      setSubmissionStatus('idle');
      setSubmissionError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Mark all fields as touched
    setTouched({
      name: true,
      email: true,
      service: true,
      message: true
    });

    // Validate form
    const formErrors = validateForm();
    setErrors(formErrors);

    if (Object.keys(formErrors).length > 0) {
      return;
    }

    setSubmissionStatus('submitting');
    setSubmissionError('');

    try {
      const serviceLabel = SERVICES.find(s => s.id === formState.service)?.title || formState.service;

      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          to_email: 'contact@zedigital.tech',
          from_name: formState.name,
          from_email: formState.email,
          reply_to: formState.email,
          service_type: serviceLabel,
          message: formState.message,
        },
        EMAILJS_PUBLIC_KEY
      );

      setSubmissionStatus('success');
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4000);
      setFormState({ name: '', email: '', service: '', message: '' });
      setTouched({});
    } catch (error) {
      setSubmissionStatus('error');
      setSubmissionError(
        error instanceof Error
          ? error.message
          : 'Failed to send message. Please try again.'
      );
    }
  };

  const handleRetry = () => {
    setSubmissionStatus('idle');
    setSubmissionError('');
  };

  const isSubmitting = submissionStatus === 'submitting';

  return (
    <div
      ref={sectionRef as React.RefObject<HTMLDivElement>}
      className="w-full h-full max-w-6xl mx-auto px-4 sm:px-8 flex flex-col justify-center"
    >
      {/* Inject keyframes */}
      <style>{keyframeDefinitions}</style>
      <style>{`
        @keyframes statusPulse {
          0%, 100% {
            box-shadow: 0 0 0 0 currentColor;
            opacity: 1;
          }
          50% {
            box-shadow: 0 0 8px 2px currentColor;
            opacity: 0.7;
          }
        }
        @keyframes subtlePulse {
          0%, 100% {
            transform: scale(1);
            opacity: 0.6;
          }
          50% {
            transform: scale(1.1);
            opacity: 1;
          }
        }
        .status-pulse {
          animation: statusPulse 2s ease-in-out infinite;
        }
        .subtle-pulse {
          animation: subtlePulse 3s ease-in-out infinite;
        }
      `}</style>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-16 items-start">

        {/* Left - CTA (hidden on mobile, shown on desktop) */}
        <div className="hidden lg:block lg:col-span-5 text-left">
          <div
            className="mono text-[10px] sm:text-[9px] text-blue-500 mb-4 sm:mb-6 tracking-[0.3em] sm:tracking-[0.5em] font-medium uppercase opacity-50"
            style={getAnimationStyle(0.1)}
          >
            <span
              className="inline-block"
              style={{
                animation: mounted && shouldAnimate && !isMobile ? `glitch 4s ease-in-out 2s infinite` : 'none',
              }}
            >
              Let's Talk
            </span>
          </div>

          <h2
            className="serif text-4xl sm:text-5xl md:text-7xl font-medium leading-[0.9] tracking-tight mb-6 sm:mb-8"
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
              Get in
            </span>
            <br />
            <span className="italic text-white/30">Touch.</span>
          </h2>

          <div
            className="h-px w-24 bg-gradient-to-r from-blue-500/50 to-transparent mb-6 sm:mb-8 mx-auto lg:mx-0 origin-left"
            style={{
              ...getAnimationStyle(0.3, 'scaleIn'),
              transform: mounted ? undefined : 'scaleX(0)',
            }}
          ></div>

          <p
            className="text-gray-400 text-sm sm:text-base serif italic leading-relaxed mb-8 sm:mb-12 max-w-xs sm:max-w-sm mx-auto lg:mx-0"
            style={getAnimationStyle(0.4)}
          >
            Ready to start your next project? We're here to help bring your ideas to life.
          </p>

          {/* Status indicators with enhanced pulse animations */}
          <div className="space-y-3 sm:space-y-4 flex flex-col items-center lg:items-start">
            <div
              className="flex items-center gap-3 sm:gap-4 group cursor-default"
              style={getAnimationStyle(0.5)}
            >
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-blue-500 status-pulse text-blue-500"></div>
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-blue-500 animate-ping opacity-30"></div>
              </div>
              <span className="mono text-[9px] sm:text-[10px] text-gray-600 uppercase tracking-widest group-hover:text-white transition-colors">
                Systems Online
              </span>
            </div>
            <div
              className="flex items-center gap-3 sm:gap-4 group cursor-default"
              style={getAnimationStyle(0.55)}
            >
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-green-500 subtle-pulse"></div>
              </div>
              <span className="mono text-[9px] sm:text-[10px] text-gray-600 uppercase tracking-widest group-hover:text-white transition-colors">
                Response Time: &lt;24h
              </span>
            </div>
            <div
              className="flex items-center gap-3 sm:gap-4 group cursor-pointer"
              style={getAnimationStyle(0.6)}
            >
              <div className="w-2 h-2 rounded-full bg-white/30 subtle-pulse" style={{ animationDelay: '0.5s' }}></div>
              <a
                href="mailto:hello@zedigital.tech"
                className="mono text-[10px] sm:text-[10px] text-gray-600 uppercase tracking-widest group-hover:text-blue-400 transition-colors"
              >
                hello@zedigital.tech
              </a>
            </div>
          </div>

          {/* Social media links with icons and actual URLs */}
          <div
            className="mt-8 sm:mt-12 flex gap-4 sm:gap-6 justify-center lg:justify-start"
            style={getAnimationStyle(0.7)}
          >
            {SOCIAL_LINKS.map((social, index) => {
              const IconComponent = social.icon;
              return (
                <a
                  key={social.name}
                  href={social.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mono text-[10px] sm:text-[9px] text-gray-700 uppercase tracking-widest hover:text-blue-500 transition-all duration-300 flex items-center gap-1.5 group"
                  style={{
                    animationDelay: `${0.7 + index * 0.05}s`,
                  }}
                >
                  <IconComponent className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-600 group-hover:text-blue-500 transition-colors" />
                  {social.name}
                  <ArrowUpRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                </a>
              );
            })}
          </div>

          {/* Stats */}
          <div
            className="mt-8 sm:mt-12 grid grid-cols-3 gap-3 sm:gap-4"
            style={getAnimationStyle(0.8)}
          >
            {[
              { value: '50+', label: 'Projects' },
              { value: '99%', label: 'Uptime' },
              { value: '24h', label: 'Response', icon: Zap },
            ].map((stat, index) => (
              <div
                key={stat.label}
                className="p-3 bg-white/[0.02] border border-white/[0.05] text-center hover:border-blue-500/30 hover:bg-white/[0.04] transition-all duration-300 group"
                style={{
                  animation: mounted && shouldAnimate ? `fadeInUp ${ANIMATION_DURATIONS.slow}s ${ANIMATION_EASINGS.smooth} ${0.8 + index * 0.1}s forwards` : undefined,
                  opacity: mounted ? undefined : 0,
                }}
              >
                <div className="mono text-lg sm:text-xl text-blue-400 font-medium flex items-center justify-center gap-1 group-hover:text-blue-300 transition-colors">
                  {stat.icon && <stat.icon className="w-3 h-3" />}
                  {stat.value}
                </div>
                <div className="mono text-[9px] text-gray-600 uppercase tracking-wider mt-1 group-hover:text-gray-500 transition-colors">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right - Form */}
        <div
          className="lg:col-span-7"
          style={getAnimationStyle(0.4, 'fadeInRight')}
        >
          {/* Mobile-only compact header */}
          <div className="lg:hidden text-center mb-4" style={getAnimationStyle(0.1)}>
            <div className="mono text-[9px] text-blue-500 mb-2 tracking-[0.3em] font-medium uppercase opacity-50">
              Let's Talk
            </div>
            <h2 className="serif text-2xl font-medium tracking-tight">
              <span style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #3b82f6 50%, #ffffff 100%)',
                backgroundSize: '200% 200%',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                Get in Touch.
              </span>
            </h2>
          </div>
          <div
            ref={formRef}
            className="relative bg-[#0a0a0a] border border-white/[0.08] overflow-hidden glow-blue"
          >
            {/* Confetti Animation */}
            <Confetti show={showConfetti} />

            {/* Scanline overlay */}
            <div
              className="absolute inset-0 pointer-events-none z-10 opacity-[0.02]"
              style={{
                background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
              }}
            />

            {/* Vignette */}
            <div
              className="absolute inset-0 pointer-events-none z-10"
              style={{
                background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.3) 100%)',
              }}
            />

            {/* Terminal Header */}
            <div className="relative z-20 px-3 sm:px-6 py-2 sm:py-4 border-b border-white/[0.05] bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex gap-1 sm:gap-1.5">
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-500/40 hover:bg-red-500/70 transition-colors cursor-pointer"></div>
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-yellow-500/40 hover:bg-yellow-500/70 transition-colors cursor-pointer"></div>
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-500/40 hover:bg-green-500/70 transition-colors cursor-pointer"></div>
                </div>
                <div className="flex items-center gap-2">
                  <Terminal className="w-3 h-3 text-gray-600" />
                  <span className="mono text-[10px] sm:text-[9px] text-gray-600 tracking-widest uppercase">Contact Form</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${submissionStatus === 'success' ? 'bg-green-500' : submissionStatus === 'error' ? 'bg-red-500' : 'bg-green-500'} animate-pulse`}></span>
                <span className={`mono text-[9px] sm:text-[8px] ${submissionStatus === 'success' ? 'text-green-500/60' : submissionStatus === 'error' ? 'text-red-500/60' : 'text-green-500/60'} uppercase`}>
                  {submissionStatus === 'success' ? 'Transmitted' : submissionStatus === 'error' ? 'Error' : submissionStatus === 'submitting' ? 'Transmitting' : 'Ready'}
                </span>
              </div>
            </div>

            {/* Success State */}
            {submissionStatus === 'success' && (
              <div className="relative z-20 p-8 sm:p-12 text-center animate-fadeIn">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 mb-6">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h3 className="serif text-2xl sm:text-3xl font-medium text-white mb-3">
                  Message Sent!
                </h3>
                <p className="mono text-xs text-gray-500 mb-6 max-w-sm mx-auto">
                  Your message has been received. We'll respond within 24 hours.
                </p>
                <button
                  onClick={() => setSubmissionStatus('idle')}
                  className="mono text-[9px] text-blue-400 uppercase tracking-widest hover:text-blue-300 transition-colors"
                >
                  Send Another Message
                </button>
              </div>
            )}

            {/* Error State */}
            {submissionStatus === 'error' && (
              <div className="relative z-20 p-8 sm:p-12 text-center animate-fadeIn">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 mb-6">
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="serif text-2xl sm:text-3xl font-medium text-white mb-3">
                  Something Went Wrong
                </h3>
                <p className="mono text-xs text-gray-500 mb-6 max-w-sm mx-auto">
                  {submissionError || 'An error occurred. Please try again.'}
                </p>
                <button
                  onClick={handleRetry}
                  className="group flex items-center gap-2 mx-auto mono text-[9px] text-blue-400 uppercase tracking-widest hover:text-blue-300 transition-colors"
                >
                  <RefreshCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500" />
                  Try Again
                </button>
              </div>
            )}

            {/* Form (hidden during success/error states) */}
            {submissionStatus !== 'success' && submissionStatus !== 'error' && (
              <form onSubmit={handleSubmit} className="relative z-20 p-3 sm:p-5 lg:p-8 space-y-3 sm:space-y-4 lg:space-y-6">
                {/* Floating label styles */}
                <style>{`
                  .floating-label-container {
                    position: relative;
                  }
                  .floating-label {
                    position: absolute;
                    left: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
                    pointer-events: none;
                    z-index: 1;
                  }
                  .floating-label-active {
                    top: 6px;
                    transform: translateY(0);
                    font-size: 7px;
                  }
                  .input-glow-blue {
                    box-shadow: 0 0 20px rgba(59, 130, 246, 0.15), 0 0 40px rgba(59, 130, 246, 0.08), inset 0 0 20px rgba(59, 130, 246, 0.03);
                  }
                  .input-glow-red {
                    box-shadow: 0 0 20px rgba(239, 68, 68, 0.15), 0 0 40px rgba(239, 68, 68, 0.08), inset 0 0 20px rgba(239, 68, 68, 0.03);
                  }
                `}</style>

                {/* Name & Email Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                  {/* Name Field with floating label */}
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="floating-label-container">
                      <label
                        className={`floating-label mono text-[9px] sm:text-[8px] uppercase tracking-widest flex items-center gap-2 ${
                          focused === 'name' || formState.name
                            ? 'floating-label-active'
                            : ''
                        } ${
                          errors.name && touched.name
                            ? 'text-red-500'
                            : focused === 'name'
                            ? 'text-blue-400'
                            : 'text-gray-600'
                        }`}
                        style={{
                          left: '14px',
                          top: focused === 'name' || formState.name ? '8px' : '50%',
                        }}
                      >
                        <span className={errors.name && touched.name ? 'text-red-500' : 'text-blue-500'}>▸</span>
                        Your Name
                        <span className="text-red-500/60">*</span>
                      </label>
                      <input
                        type="text"
                        value={formState.name}
                        onChange={(e) => handleChange('name', e.target.value)}
                        onFocus={() => setFocused('name')}
                        onBlur={() => handleBlur('name')}
                        disabled={isSubmitting}
                        className={`w-full bg-[#050505] border ${
                          errors.name && touched.name
                            ? 'border-red-500/50 input-glow-red'
                            : focused === 'name'
                            ? 'border-blue-500/50 input-glow-blue'
                            : 'border-white/[0.08] hover:border-white/[0.15]'
                        } px-3 sm:px-4 pt-5 pb-2.5 text-xs sm:text-sm text-white focus:outline-none transition-all duration-300 mono disabled:opacity-50`}
                      />
                    </div>
                    {errors.name && touched.name && (
                      <div className="flex items-center gap-1.5 text-red-400 animate-slideDown">
                        <AlertCircle className="w-3 h-3" />
                        <span className="mono text-[9px]">{errors.name}</span>
                      </div>
                    )}
                  </div>

                  {/* Email Field with floating label */}
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="floating-label-container">
                      <label
                        className={`floating-label mono text-[9px] sm:text-[8px] uppercase tracking-widest flex items-center gap-2 ${
                          focused === 'email' || formState.email
                            ? 'floating-label-active'
                            : ''
                        } ${
                          errors.email && touched.email
                            ? 'text-red-500'
                            : focused === 'email'
                            ? 'text-blue-400'
                            : 'text-gray-600'
                        }`}
                        style={{
                          left: '14px',
                          top: focused === 'email' || formState.email ? '8px' : '50%',
                        }}
                      >
                        <span className={errors.email && touched.email ? 'text-red-500' : 'text-blue-500'}>▸</span>
                        Email
                        <span className="text-red-500/60">*</span>
                      </label>
                      <input
                        type="email"
                        value={formState.email}
                        onChange={(e) => handleChange('email', e.target.value)}
                        onFocus={() => setFocused('email')}
                        onBlur={() => handleBlur('email')}
                        disabled={isSubmitting}
                        className={`w-full bg-[#050505] border ${
                          errors.email && touched.email
                            ? 'border-red-500/50 input-glow-red'
                            : focused === 'email'
                            ? 'border-blue-500/50 input-glow-blue'
                            : 'border-white/[0.08] hover:border-white/[0.15]'
                        } px-3 sm:px-4 pt-5 pb-2.5 text-xs sm:text-sm text-white focus:outline-none transition-all duration-300 mono disabled:opacity-50`}
                      />
                    </div>
                    {errors.email && touched.email && (
                      <div className="flex items-center gap-1.5 text-red-400 animate-slideDown">
                        <AlertCircle className="w-3 h-3" />
                        <span className="mono text-[9px]">{errors.email}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Service Selection with floating label */}
                <div className="space-y-1.5 sm:space-y-2">
                  <div className="floating-label-container relative">
                    <label
                      className={`floating-label floating-label-active mono text-[9px] sm:text-[8px] uppercase tracking-widest flex items-center gap-2 ${
                        errors.service && touched.service
                          ? 'text-red-500'
                          : focused === 'service'
                          ? 'text-blue-400'
                          : 'text-gray-600'
                      }`}
                      style={{
                        left: '14px',
                        top: '8px',
                      }}
                    >
                      <span className={errors.service && touched.service ? 'text-red-500' : 'text-blue-500'}>▸</span>
                      Service Type
                      <span className="text-red-500/60">*</span>
                    </label>
                    <select
                      value={formState.service}
                      onChange={(e) => handleChange('service', e.target.value)}
                      onFocus={() => setFocused('service')}
                      onBlur={() => handleBlur('service')}
                      disabled={isSubmitting}
                      className={`w-full bg-[#050505] border ${
                        errors.service && touched.service
                          ? 'border-red-500/50 input-glow-red'
                          : focused === 'service'
                          ? 'border-blue-500/50 input-glow-blue'
                          : 'border-white/[0.08] hover:border-white/[0.15]'
                      } px-3 sm:px-4 pt-5 pb-2.5 text-xs sm:text-sm text-white focus:outline-none transition-all duration-300 appearance-none cursor-pointer mono disabled:opacity-50`}
                    >
                      <option value="" className="bg-[#0a0a0a]">Select service type</option>
                      {SERVICES.map(service => (
                        <option key={service.id} value={service.id} className="bg-[#0a0a0a]">
                          {service.title}
                        </option>
                      ))}
                    </select>
                    {/* Custom dropdown arrow */}
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className={`w-4 h-4 ${focused === 'service' ? 'text-blue-400' : 'text-gray-600'} transition-colors`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  {errors.service && touched.service && (
                    <div className="flex items-center gap-1.5 text-red-400 animate-slideDown">
                      <AlertCircle className="w-3 h-3" />
                      <span className="mono text-[9px]">{errors.service}</span>
                    </div>
                  )}
                </div>

                {/* Message with floating label */}
                <div className="space-y-1.5 sm:space-y-2">
                  <div className="floating-label-container relative">
                    <label
                      className={`absolute mono text-[9px] sm:text-[8px] uppercase tracking-widest flex items-center gap-2 transition-all duration-200 ${
                        focused === 'message' || formState.message
                          ? 'top-2 left-3.5 text-[6px] sm:text-[7px]'
                          : 'top-4 left-3.5'
                      } ${
                        errors.message && touched.message
                          ? 'text-red-500'
                          : focused === 'message'
                          ? 'text-blue-400'
                          : 'text-gray-600'
                      }`}
                      style={{ zIndex: 1, pointerEvents: 'none' }}
                    >
                      <span className={errors.message && touched.message ? 'text-red-500' : 'text-blue-500'}>▸</span>
                      Message
                      <span className="text-red-500/60">*</span>
                    </label>
                    <textarea
                      value={formState.message}
                      onChange={(e) => handleChange('message', e.target.value)}
                      onFocus={() => setFocused('message')}
                      onBlur={() => handleBlur('message')}
                      rows={3}
                      disabled={isSubmitting}
                      className={`w-full bg-[#050505] border ${
                        errors.message && touched.message
                          ? 'border-red-500/50 input-glow-red'
                          : focused === 'message'
                          ? 'border-blue-500/50 input-glow-blue'
                          : 'border-white/[0.08] hover:border-white/[0.15]'
                      } px-3 sm:px-4 pt-6 pb-2.5 text-xs sm:text-sm text-white focus:outline-none transition-all duration-300 resize-none mono disabled:opacity-50`}
                    />
                  </div>
                  {errors.message && touched.message && (
                    <div className="flex items-center gap-1.5 text-red-400 animate-slideDown">
                      <AlertCircle className="w-3 h-3" />
                      <span className="mono text-[9px]">{errors.message}</span>
                    </div>
                  )}
                </div>

                {/* Submit */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1 sm:pt-4">
                  <div className="mono text-[9px] sm:text-[8px] text-gray-700 uppercase tracking-widest order-2 sm:order-1 flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-green-500"></span>
                    Encrypted transmission
                  </div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="group relative flex items-center gap-2 sm:gap-3 bg-emerald-500/10 border border-emerald-500/30 px-5 sm:px-6 py-2.5 sm:py-3 hover:border-emerald-500/60 hover:bg-emerald-500/20 transition-all duration-300 order-1 sm:order-2 w-full sm:w-auto justify-center overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {/* Button glow */}
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                    {/* Submitting animation */}
                    {isSubmitting && (
                      <div className="absolute inset-0 overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent animate-shimmer" />
                      </div>
                    )}

                    <span className="relative mono text-[10px] sm:text-[11px] text-emerald-400 uppercase tracking-widest group-hover:text-emerald-300 transition-colors">
                      {isSubmitting ? 'Sending...' : 'Send Message'}
                    </span>
                    <Send className={`relative w-3 h-3 sm:w-4 sm:h-4 text-emerald-500 group-hover:text-emerald-300 transition-all ${isSubmitting ? 'animate-pulse' : 'group-hover:translate-x-0.5'}`} />
                  </button>
                </div>
              </form>
            )}

            {/* Footer */}
            <div className="relative z-20 px-3 sm:px-8 py-2 sm:py-4 border-t border-white/[0.05] bg-white/[0.01] flex items-center justify-between">
              <span className="mono text-[9px] sm:text-[8px] text-gray-700 uppercase tracking-widest">
                Protocol v2.4
              </span>
              <span className={`mono text-[9px] sm:text-[8px] ${formState.message.length < 10 && formState.message.length > 0 ? 'text-red-400' : 'text-gray-700'}`}>
                {formState.message.length}/500 chars
              </span>
            </div>

            {/* Custom styles for animations */}
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
              }
              @keyframes slideDown {
                from { opacity: 0; transform: translateY(-5px); }
                to { opacity: 1; transform: translateY(0); }
              }
              @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
              }
              .animate-fadeIn {
                animation: fadeIn 0.4s ease-out;
              }
              .animate-slideDown {
                animation: slideDown 0.2s ease-out;
              }
              .animate-shimmer {
                animation: shimmer 1.5s infinite;
              }
            `}</style>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
