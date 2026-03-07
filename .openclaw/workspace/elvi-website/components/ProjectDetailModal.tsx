import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Project } from '../types';
import { X, ArrowUpRight, ChevronLeft, ChevronRight, ExternalLink, Github } from 'lucide-react';

interface ProjectDetailModalProps {
  project: Project;
  onClose: () => void;
}

const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({ project, onClose }) => {
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const allImages = [project.image, ...(project.gallery || [])];

  useEffect(() => {
    setCurrentImageIndex(0);
    setImageLoaded(false);
    setTimeout(() => closeButtonRef.current?.focus(), 100);
  }, [project]);

  const handleClose = useCallback(() => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      setIsAnimatingOut(false);
      onClose();
    }, 400);
  }, [onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); handleClose(); return; }
      if (allImages.length > 1) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); setCurrentImageIndex(prev => prev > 0 ? prev - 1 : allImages.length - 1); setImageLoaded(false); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); setCurrentImageIndex(prev => prev < allImages.length - 1 ? prev + 1 : 0); setImageLoaded(false); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, allImages.length]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  };

  return (
    <div
      ref={modalRef}
      className={`fixed inset-0 z-[200] flex items-end justify-center transition-all duration-400 ease-out
        ${isAnimatingOut ? 'bg-black/0' : 'bg-black/80 backdrop-blur-md'}`}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        className={`relative w-full h-[95vh] bg-[#0a0a0a] border-t transform transition-all duration-500 ease-out overflow-hidden
          ${isAnimatingOut ? 'translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
        style={{
          borderColor: 'var(--border)',
          transitionTimingFunction: isAnimatingOut ? 'cubic-bezier(0.4, 0, 1, 1)' : 'cubic-bezier(0, 0, 0.2, 1)',
        }}
      >
        {/* Close Button */}
        <button
          ref={closeButtonRef}
          onClick={handleClose}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 z-50 w-10 h-10 sm:w-12 sm:h-12
            flex items-center justify-center
            bg-white/5 border text-white/60
            hover:bg-white/10 hover:text-white
            transition-all duration-300 group"
          style={{ borderColor: 'var(--border)' }}
          aria-label="Close modal"
        >
          <X className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
        </button>

        <div className="h-full overflow-y-auto overscroll-contain">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8 sm:py-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8 sm:mb-12">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-code text-[10px] sm:text-xs uppercase tracking-[0.3em]" style={{ color: 'var(--accent-2)' }}>
                    {project.category}
                  </span>
                  <span className="w-1 h-1 rounded-full bg-white/20" />
                  <span className="font-code text-[10px] sm:text-xs text-white/40 tracking-wider">
                    {project.year}
                  </span>
                </div>
                <h2 id="modal-title" className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight uppercase">
                  {project.title}
                </h2>
                <div className="mt-3 font-code text-[10px] sm:text-xs text-white/30 uppercase tracking-wider">
                  Client: {project.client}
                </div>
              </div>

              <div className="flex gap-3">
                {project.liveUrl && (
                  <a href={project.liveUrl} target="_blank" rel="noopener noreferrer" className="brutal-btn-cyan brutal-btn">
                    <span className="font-code text-[10px] sm:text-xs uppercase tracking-wider">Live Site</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {project.githubUrl && (
                  <a href={project.githubUrl} target="_blank" rel="noopener noreferrer" className="brutal-btn" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'var(--border)', color: 'rgba(255,255,255,0.6)' }}>
                    <span className="font-code text-[10px] sm:text-xs uppercase tracking-wider">GitHub</span>
                    <Github className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            {/* Hero Image */}
            <div className="relative mb-10 sm:mb-16">
              <div className="relative aspect-[16/9] overflow-hidden bg-[#080808] border" style={{ borderColor: 'var(--border)' }}>
                <div className={`absolute inset-0 bg-gradient-to-br from-[#ff003c10] to-[#00f3ff10] transition-opacity duration-500 ${imageLoaded ? 'opacity-0' : 'opacity-100'}`} />
                <img
                  src={allImages[currentImageIndex]}
                  alt={`${project.title} - Image ${currentImageIndex + 1}`}
                  onLoad={() => setImageLoaded(true)}
                  className={`w-full h-full object-cover transition-all duration-700 ${imageLoaded ? 'opacity-100 blur-0 scale-100' : 'opacity-0 blur-lg scale-105'}`}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/60 via-transparent to-transparent" />
              </div>

              {allImages.length > 1 && (
                <>
                  <button onClick={() => { setCurrentImageIndex(prev => prev > 0 ? prev - 1 : allImages.length - 1); setImageLoaded(false); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-black/50 backdrop-blur-sm border text-white/60 hover:text-white hover:bg-black/70 transition-all duration-300"
                    style={{ borderColor: 'var(--border)' }}
                    aria-label="Previous image">
                    <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                  <button onClick={() => { setCurrentImageIndex(prev => prev < allImages.length - 1 ? prev + 1 : 0); setImageLoaded(false); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-black/50 backdrop-blur-sm border text-white/60 hover:text-white hover:bg-black/70 transition-all duration-300"
                    style={{ borderColor: 'var(--border)' }}
                    aria-label="Next image">
                    <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {allImages.map((_, i) => (
                      <button key={i} onClick={() => { setCurrentImageIndex(i); setImageLoaded(false); }}
                        className={`w-2 h-2 transition-all duration-300 ${i === currentImageIndex ? 'w-6' : ''}`}
                        style={{ background: i === currentImageIndex ? 'var(--accent)' : 'rgba(255,255,255,0.3)' }}
                        aria-label={`Go to image ${i + 1}`} />
                    ))}
                  </div>
                  <div className="absolute top-4 left-4 font-code text-[10px] sm:text-xs text-white/50 bg-black/50 backdrop-blur-sm px-3 py-1.5">
                    {currentImageIndex + 1} / {allImages.length}
                  </div>
                </>
              )}
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
              <div className="lg:col-span-2">
                <h3 className="font-code text-[10px] sm:text-xs uppercase tracking-[0.3em] mb-4" style={{ color: 'var(--accent-2)', opacity: 0.7 }}>
                  About the Project
                </h3>
                <p className="text-base sm:text-lg md:text-xl text-gray-300 leading-relaxed font-code">
                  {project.description}
                </p>
                <div className="mt-8 pt-8" style={{ borderTop: '1px solid var(--border)' }}>
                  <h3 className="font-code text-[10px] sm:text-xs uppercase tracking-[0.3em] mb-4" style={{ color: 'var(--accent-2)', opacity: 0.7 }}>
                    Key Features
                  </h3>
                  <ul className="space-y-3">
                    {['Responsive design optimized for all device sizes', 'Performance-first architecture for fast load times', 'Scalable infrastructure ready for growth'].map((text, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <ArrowUpRight className="w-4 h-4 mt-1 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                        <span className="text-sm text-gray-400 font-code">{text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="font-code text-[10px] sm:text-xs uppercase tracking-[0.3em] mb-4" style={{ color: 'var(--accent-2)', opacity: 0.7 }}>
                  Technologies Used
                </h3>
                <div className="flex flex-wrap gap-2">
                  {project.technologies.map((tech, i) => (
                    <span key={i} className="tech-tag">{tech}</span>
                  ))}
                </div>
                <div className="mt-8 pt-8 space-y-4" style={{ borderTop: '1px solid var(--border)' }}>
                  {[{ label: 'Year', value: project.year }, { label: 'Client', value: project.client }, { label: 'Category', value: project.category }].map(item => (
                    <div key={item.label}>
                      <h4 className="font-code text-[9px] text-white/30 uppercase tracking-wider mb-1">{item.label}</h4>
                      <p className="text-sm text-white/70 font-code">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="h-8" />
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#0a0a0a] to-transparent pointer-events-none" />
      </div>
    </div>
  );
};

export default ProjectDetailModal;
