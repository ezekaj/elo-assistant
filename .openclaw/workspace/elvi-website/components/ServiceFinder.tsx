import React, { useState, useCallback } from 'react';
import { Search, ArrowRight, ArrowLeft, RotateCcw, Sparkles, CheckCircle2 } from 'lucide-react';
import { SERVICES, SERVICE_ICONS } from '../constants';
import { Service } from '../types';
import {
  keyframeDefinitions,
  useAnimationConfig,
  ANIMATION_DURATIONS,
  ANIMATION_EASINGS,
} from '../utils/animations';
import { navigateToSection } from './Navbar';

// Question and answer types
interface QuestionOption {
  id: string;
  label: string;
  description: string;
  icon?: React.ReactNode;
}

interface Question {
  id: string;
  question: string;
  options: QuestionOption[];
}

// Questions for the service finder
const QUESTIONS: Question[] = [
  {
    id: 'goal',
    question: 'What are you looking to build?',
    options: [
      { id: 'website', label: 'Website or Web App', description: 'Public-facing sites, dashboards, e-commerce' },
      { id: 'software', label: 'Custom Software', description: 'Internal tools, APIs, enterprise systems' },
      { id: 'ai', label: 'AI Integration', description: 'Chatbots, automation, machine learning' },
      { id: 'security', label: 'Security Review', description: 'Audits, penetration testing, compliance' },
    ],
  },
  {
    id: 'timeline',
    question: "What's your timeline?",
    options: [
      { id: 'urgent', label: 'Urgent (< 1 month)', description: 'Need it ASAP, high priority project' },
      { id: 'standard', label: 'Standard (1-3 months)', description: 'Typical development cycle' },
      { id: 'flexible', label: 'Flexible (3+ months)', description: 'Long-term engagement, no rush' },
      { id: 'ongoing', label: 'Ongoing Partnership', description: 'Continuous development & support' },
    ],
  },
  {
    id: 'expertise',
    question: "What's your technical expertise?",
    options: [
      { id: 'non-technical', label: 'Non-Technical', description: "I'll need guidance on everything" },
      { id: 'some', label: 'Some Experience', description: 'Basic understanding of tech concepts' },
      { id: 'technical', label: 'Technical Background', description: 'I can discuss architecture & specs' },
      { id: 'developer', label: 'Developer/Engineer', description: 'Looking for specialized expertise' },
    ],
  },
  {
    id: 'priority',
    question: "What's most important to you?",
    options: [
      { id: 'speed', label: 'Speed to Market', description: 'Launch fast, iterate later' },
      { id: 'quality', label: 'Quality & Reliability', description: 'Rock-solid, well-tested solution' },
      { id: 'security', label: 'Security & Compliance', description: 'Data protection is critical' },
      { id: 'scalability', label: 'Scalability', description: 'Built to handle growth' },
    ],
  },
];

// Service recommendation scoring
interface ServiceScore {
  service: Service;
  score: number;
  reasons: string[];
  matchPercentage: number;
}

// Scoring logic for recommendations
function calculateRecommendations(answers: Record<string, string>): ServiceScore[] {
  const scores: Record<string, { score: number; reasons: string[] }> = {};

  SERVICES.forEach(service => {
    scores[service.id] = { score: 0, reasons: [] };
  });

  // Goal-based scoring
  const goal = answers['goal'];
  if (goal === 'website') {
    scores['web-development'].score += 40;
    scores['web-development'].reasons.push('Perfect fit for web applications');
    scores['ai-solutions'].score += 10;
    scores['ai-solutions'].reasons.push('AI can enhance web experiences');
  } else if (goal === 'software') {
    scores['software-development'].score += 40;
    scores['software-development'].reasons.push('Specialized in custom software');
    scores['web-development'].score += 15;
    scores['web-development'].reasons.push('Web technologies complement software');
  } else if (goal === 'ai') {
    scores['ai-solutions'].score += 40;
    scores['ai-solutions'].reasons.push('Core expertise in AI integration');
    scores['software-development'].score += 15;
    scores['software-development'].reasons.push('AI often requires custom backends');
  } else if (goal === 'security') {
    scores['cybersecurity'].score += 40;
    scores['cybersecurity'].reasons.push('Dedicated security expertise');
  }

  // Timeline-based scoring
  const timeline = answers['timeline'];
  if (timeline === 'urgent') {
    scores['web-development'].score += 10;
    scores['web-development'].reasons.push('Rapid development capabilities');
  } else if (timeline === 'ongoing') {
    scores['software-development'].score += 10;
    scores['software-development'].reasons.push('Long-term partnership ready');
    scores['cybersecurity'].score += 10;
    scores['cybersecurity'].reasons.push('Continuous security monitoring');
  }

  // Priority-based scoring
  const priority = answers['priority'];
  if (priority === 'security') {
    scores['cybersecurity'].score += 25;
    scores['cybersecurity'].reasons.push('Security is our specialty');
    scores['software-development'].score += 10;
    scores['software-development'].reasons.push('Secure coding practices');
  } else if (priority === 'quality') {
    scores['software-development'].score += 15;
    scores['software-development'].reasons.push('Enterprise-grade quality standards');
    scores['web-development'].score += 10;
  } else if (priority === 'speed') {
    scores['web-development'].score += 15;
    scores['web-development'].reasons.push('Agile development process');
  } else if (priority === 'scalability') {
    scores['software-development'].score += 15;
    scores['software-development'].reasons.push('Scalable architecture design');
    scores['ai-solutions'].score += 10;
    scores['ai-solutions'].reasons.push('ML systems scale with data');
  }

  // Expertise-based adjustments
  const expertise = answers['expertise'];
  if (expertise === 'developer') {
    scores['ai-solutions'].score += 5;
    scores['ai-solutions'].reasons.push('Advanced technical collaboration');
  } else if (expertise === 'non-technical') {
    scores['web-development'].score += 5;
    scores['web-development'].reasons.push('Full-service support included');
  }

  // Convert to array and calculate percentages
  const maxPossibleScore = 80; // Maximum achievable score
  const results: ServiceScore[] = SERVICES.map(service => ({
    service,
    score: scores[service.id].score,
    reasons: scores[service.id].reasons.filter((r, i, arr) => arr.indexOf(r) === i), // Dedupe
    matchPercentage: Math.min(99, Math.round((scores[service.id].score / maxPossibleScore) * 100)),
  }));

  // Sort by score descending
  return results.sort((a, b) => b.score - a.score);
}

const ServiceFinder: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [recommendations, setRecommendations] = useState<ServiceScore[]>([]);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right'>('left');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const { shouldAnimate, isMobile } = useAnimationConfig();

  const totalSteps = QUESTIONS.length;
  const currentQuestion = QUESTIONS[currentStep];
  const progress = ((currentStep + 1) / totalSteps) * 100;

  // Handle answer selection
  const handleAnswer = useCallback((optionId: string) => {
    if (isTransitioning) return;

    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: optionId,
    }));

    // Auto-advance after selection with slight delay
    setIsTransitioning(true);
    setSlideDirection('left');

    setTimeout(() => {
      if (currentStep < totalSteps - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        // Calculate recommendations when all questions answered
        const newAnswers = { ...answers, [currentQuestion.id]: optionId };
        const recs = calculateRecommendations(newAnswers);
        setRecommendations(recs);
        setShowResults(true);
      }
      setIsTransitioning(false);
    }, 300);
  }, [currentStep, totalSteps, answers, currentQuestion, isTransitioning]);

  // Navigation handlers
  const goBack = useCallback(() => {
    if (isTransitioning || currentStep === 0) return;
    setIsTransitioning(true);
    setSlideDirection('right');
    setTimeout(() => {
      setCurrentStep(prev => prev - 1);
      setIsTransitioning(false);
    }, 300);
  }, [currentStep, isTransitioning]);

  const goToStep = useCallback((step: number) => {
    if (isTransitioning || step === currentStep) return;
    setShowResults(false);
    setIsTransitioning(true);
    setSlideDirection(step > currentStep ? 'left' : 'right');
    setTimeout(() => {
      setCurrentStep(step);
      setIsTransitioning(false);
    }, 300);
  }, [currentStep, isTransitioning]);

  const startOver = useCallback(() => {
    setIsTransitioning(true);
    setSlideDirection('right');
    setTimeout(() => {
      setAnswers({});
      setCurrentStep(0);
      setShowResults(false);
      setRecommendations([]);
      setIsTransitioning(false);
    }, 300);
  }, []);

  // Get label for an answer
  const getAnswerLabel = (questionId: string, answerId: string): string => {
    const question = QUESTIONS.find(q => q.id === questionId);
    const option = question?.options.find(o => o.id === answerId);
    return option?.label || answerId;
  };

  return (
    <div className="w-full h-full max-w-5xl mx-auto px-4 sm:px-8 flex flex-col justify-center">
      {/* Inject keyframes */}
      <style>{keyframeDefinitions}</style>
      <style>{`
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(50px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(-50px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideOutLeft {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(-50px); }
        }
        @keyframes slideOutRight {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(50px); }
        }
        @keyframes countUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4); }
          50% { box-shadow: 0 0 20px 5px rgba(59, 130, 246, 0.2); }
        }
      `}</style>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-12 items-start">
        {/* Mobile compact header */}
        <div className="lg:hidden text-center mb-2">
          <div className="mono text-[9px] text-blue-500 mb-1 tracking-[0.3em] font-medium uppercase opacity-50">
            Discovery
          </div>
          <h2 className="serif text-2xl font-medium tracking-tight">
            Find Your Service.
          </h2>
        </div>

        {/* Left - Info Section (hidden on mobile) */}
        <div className="hidden lg:block lg:col-span-4 text-left">
          <div className="mono text-[9px] text-blue-500 mb-4 tracking-[0.5em] font-medium uppercase opacity-50">
            Discovery
          </div>
          <h2 className="serif text-5xl md:text-6xl font-medium mb-6 tracking-tight">
            Find Your Service.
          </h2>
          <div className="h-px w-24 bg-gradient-to-r from-blue-500/50 to-transparent mb-6" />
          <p className="text-gray-500 text-sm serif italic leading-relaxed mb-8 max-w-xs">
            Answer a few questions to discover which services best match your needs.
          </p>

          {/* Progress Indicator */}
          <div className="p-4 bg-white/[0.02] border border-white/[0.05] mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="mono text-[10px] sm:text-[8px] text-gray-600 uppercase tracking-widest">
                Progress
              </div>
              <div className="mono text-[10px] sm:text-xs text-blue-400">
                {showResults ? 'Complete' : `${currentStep + 1} of ${totalSteps}`}
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-500 ease-out"
                style={{ width: showResults ? '100%' : `${progress}%` }}
              />
            </div>
          </div>

          {/* Selected Answers Pills */}
          {Object.keys(answers).length > 0 && (
            <div className="flex flex-wrap gap-2 justify-center lg:justify-start">
              {Object.entries(answers).map(([questionId, answerId], index) => (
                <button
                  key={questionId}
                  onClick={() => goToStep(QUESTIONS.findIndex(q => q.id === questionId))}
                  className="group flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 border border-blue-500/20
                           hover:border-blue-500/40 hover:bg-blue-500/20 transition-all duration-200 rounded-sm"
                  style={{
                    animation: shouldAnimate ? `countUp 0.3s ease-out ${index * 0.05}s forwards` : 'none',
                    opacity: shouldAnimate ? 0 : 1,
                  }}
                >
                  <span className="mono text-[8px] text-blue-400 group-hover:text-blue-300">
                    {getAnswerLabel(questionId, answerId)}
                  </span>
                  <CheckCircle2 className="w-2.5 h-2.5 text-blue-500/50" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right - Questionnaire Panel */}
        <div className="lg:col-span-8">
          <div className="relative bg-[#0a0a0a] border border-white/[0.08] overflow-hidden min-h-0 sm:min-h-[400px] lg:min-h-[500px]">
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/[0.02] to-transparent pointer-events-none" />

            {/* Header */}
            <div className="relative z-10 px-4 sm:px-6 py-3 sm:py-4 border-b border-white/[0.05] bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="flex gap-1 sm:gap-1.5">
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-red-500/40" />
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-yellow-500/40" />
                  <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-green-500/40" />
                </div>
                <div className="flex items-center gap-2">
                  <Search className="w-3 h-3 text-gray-600" />
                  <span className="mono text-[10px] sm:text-[9px] text-gray-600 tracking-widest uppercase">
                    zedigital://service-finder
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                <span className="mono text-[10px] sm:text-[8px] text-blue-500/60 uppercase">Active</span>
              </div>
            </div>

            {/* Content Area */}
            <div className="relative z-10 p-3 sm:p-6 lg:p-8">
              {!showResults ? (
                /* Question View */
                <div
                  key={currentStep}
                  style={{
                    animation: shouldAnimate
                      ? `${slideDirection === 'left' ? 'slideInLeft' : 'slideInRight'} 0.3s ease-out forwards`
                      : 'none',
                    opacity: isTransitioning ? 0 : 1,
                  }}
                >
                  {/* Question */}
                  <div className="mb-3 sm:mb-8">
                    <div className="mono text-[9px] sm:text-[10px] text-blue-500/50 mb-1 sm:mb-2 tracking-wider">
                      QUESTION {currentStep + 1}
                    </div>
                    <h3 className="text-lg sm:text-2xl lg:text-3xl font-medium text-white">
                      {currentQuestion.question}
                    </h3>
                  </div>

                  {/* Options Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 sm:gap-4">
                    {currentQuestion.options.map((option, index) => {
                      const isSelected = answers[currentQuestion.id] === option.id;
                      return (
                        <button
                          key={option.id}
                          onClick={() => handleAnswer(option.id)}
                          disabled={isTransitioning}
                          className={`group relative text-left p-2.5 sm:p-5 border transition-all duration-300 min-h-0 sm:min-h-[72px]
                                    ${isSelected
                                      ? 'bg-blue-500/10 border-blue-500/50'
                                      : 'bg-white/[0.02] border-white/[0.08] hover:border-blue-500/30 hover:bg-white/[0.04]'
                                    }
                                    disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]`}
                          style={{
                            animation: shouldAnimate
                              ? `fadeInUp ${ANIMATION_DURATIONS.normal}s ${ANIMATION_EASINGS.smooth} ${0.1 + index * 0.05}s forwards`
                              : 'none',
                            opacity: shouldAnimate ? 0 : 1,
                          }}
                        >
                          {/* Selection indicator */}
                          <div className={`absolute top-2 right-2 sm:top-3 sm:right-3 w-4 h-4 rounded-full border transition-all duration-200
                                        ${isSelected
                                          ? 'bg-blue-500 border-blue-500'
                                          : 'border-gray-600 group-hover:border-blue-500/50'
                                        }`}>
                            {isSelected && (
                              <CheckCircle2 className="w-4 h-4 text-white" />
                            )}
                          </div>

                          <h4 className={`font-medium text-xs sm:text-base mb-1 sm:mb-1.5 pr-6 sm:pr-8 transition-colors duration-200
                                        ${isSelected ? 'text-blue-400' : 'text-gray-200 group-hover:text-white'}`}>
                            {option.label}
                          </h4>
                          <p className="hidden sm:block text-xs text-gray-500 leading-relaxed pr-6">
                            {option.description}
                          </p>

                          {/* Hover glow effect */}
                          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent" />
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Navigation */}
                  <div className="flex items-center justify-between mt-3 sm:mt-8 pt-3 sm:pt-4 border-t border-white/[0.05]">
                    <button
                      onClick={goBack}
                      disabled={currentStep === 0 || isTransitioning}
                      className="flex items-center gap-2 mono text-[10px] sm:text-xs text-gray-500 hover:text-white
                               transition-colors disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-wider"
                    >
                      <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4" />
                      Back
                    </button>

                    <button
                      onClick={startOver}
                      className="flex items-center gap-2 mono text-[10px] sm:text-xs text-gray-600 hover:text-gray-400
                               transition-colors uppercase tracking-wider"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Start Over
                    </button>
                  </div>
                </div>
              ) : (
                /* Results View */
                <div
                  style={{
                    animation: shouldAnimate ? 'slideInLeft 0.4s ease-out forwards' : 'none',
                  }}
                >
                  <div className="mb-6 sm:mb-8">
                    <div className="flex items-center gap-2 mono text-[9px] sm:text-[10px] text-green-500/70 mb-2 tracking-wider">
                      <Sparkles className="w-3 h-3" />
                      RECOMMENDATIONS
                    </div>
                    <h3 className="text-xl sm:text-2xl lg:text-3xl font-medium text-white">
                      Your Matched Services
                    </h3>
                    <p className="text-gray-500 text-xs sm:text-sm mt-2">
                      Based on your answers, here are our recommended services:
                    </p>
                  </div>

                  {/* Recommendation Cards */}
                  <div className="space-y-3 sm:space-y-4">
                    {recommendations.slice(0, 3).map((rec, index) => (
                      <div
                        key={rec.service.id}
                        className={`relative p-4 sm:p-5 border transition-all duration-300
                                  ${index === 0
                                    ? 'bg-blue-500/10 border-blue-500/30'
                                    : 'bg-white/[0.02] border-white/[0.08]'
                                  }`}
                        style={{
                          animation: shouldAnimate
                            ? `fadeInUp ${ANIMATION_DURATIONS.normal}s ${ANIMATION_EASINGS.smooth} ${0.1 + index * 0.1}s forwards`
                            : 'none',
                          opacity: shouldAnimate ? 0 : 1,
                        }}
                      >
                        {/* Top match badge */}
                        {index === 0 && (
                          <div className="absolute -top-2 left-4 px-2 py-0.5 bg-blue-500 text-white mono text-[8px] uppercase tracking-wider">
                            Best Match
                          </div>
                        )}

                        <div className="flex items-start gap-4">
                          {/* Icon */}
                          <div className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center
                                        ${index === 0 ? 'text-blue-400' : 'text-gray-500'}`}>
                            {SERVICE_ICONS[rec.service.icon]}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <h4 className={`font-semibold text-sm sm:text-base uppercase tracking-wider
                                            ${index === 0 ? 'text-white' : 'text-gray-300'}`}>
                                {rec.service.title}
                              </h4>
                              {/* Match percentage */}
                              <div className={`mono text-xs sm:text-sm font-medium
                                            ${index === 0 ? 'text-blue-400' : 'text-gray-500'}`}>
                                {rec.matchPercentage}%
                              </div>
                            </div>

                            {/* Reasons */}
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {rec.reasons.slice(0, 2).map((reason, i) => (
                                <span
                                  key={i}
                                  className="inline-block px-2 py-0.5 bg-white/[0.05] text-[9px] sm:text-[10px] text-gray-400"
                                >
                                  {reason}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-3 h-1 bg-white/[0.05] rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-1000 ease-out
                                      ${index === 0 ? 'bg-blue-500' : 'bg-gray-600'}`}
                            style={{
                              width: shouldAnimate ? `${rec.matchPercentage}%` : '0%',
                              transitionDelay: `${0.3 + index * 0.1}s`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 sm:mt-8 pt-4 border-t border-white/[0.05]">
                    <button
                      onClick={startOver}
                      className="flex items-center gap-2 mono text-[10px] sm:text-xs text-gray-500 hover:text-white
                               transition-colors uppercase tracking-wider"
                    >
                      <RotateCcw className="w-3 h-3 sm:w-4 sm:h-4" />
                      Start Over
                    </button>

                    <button
                      onClick={() => navigateToSection(4)}
                      className="group flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-blue-500/20 border border-blue-500/30
                               hover:bg-blue-500/30 hover:border-blue-500/50 transition-all duration-300 cursor-pointer"
                      style={{
                        animation: shouldAnimate ? 'pulseGlow 2s ease-in-out infinite' : 'none',
                      }}
                    >
                      <span className="mono text-xs sm:text-sm text-blue-400 group-hover:text-blue-300 uppercase tracking-wider">
                        Get Started
                      </span>
                      <ArrowRight className="w-4 h-4 text-blue-400 group-hover:text-blue-300 group-hover:translate-x-1 transition-all duration-200" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServiceFinder;
