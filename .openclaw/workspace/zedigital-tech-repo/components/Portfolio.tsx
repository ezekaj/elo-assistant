import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { PROJECTS } from '../constants';
import { Project } from '../types';
import { ArrowUpRight, Github, ExternalLink, X, ChevronLeft, ChevronRight } from 'lucide-react';
import ProjectDetailModal from './ProjectDetailModal';

// GitHub profile URL
const GITHUB_PROFILE_URL = 'https://github.com/ezekaj';

// Filter categories
const FILTER_CATEGORIES = ['All', 'Web', 'AI'] as const;
type FilterCategory = typeof FILTER_CATEGORIES[number];

// Number of projects to show per page (compact grid)
const PROJECTS_PER_PAGE = 6;

const Portfolio: React.FC = () => {
  // Filter state
  const [activeFilter, setActiveFilter] = useState<FilterCategory>('All');
  const [isFiltering, setIsFiltering] = useState(false);
  const [displayedFilter, setDisplayedFilter] = useState<FilterCategory>('All');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(0);

  // Handle filter change with smooth transition
  const handleFilterChange = useCallback((newFilter: FilterCategory) => {
    if (newFilter === activeFilter) return;

    // Start fade out
    setIsFiltering(true);
    setActiveFilter(newFilter);
    setCurrentPage(0); // Reset to first page on filter change

    // After fade out completes, update displayed filter and fade in
    setTimeout(() => {
      setDisplayedFilter(newFilter);
      setIsFiltering(false);
    }, 300);
  }, [activeFilter]);

  // Filter projects based on displayed filter (for smooth transitions)
  const filteredProjects = useMemo(() => {
    if (displayedFilter === 'All') return PROJECTS;
    return PROJECTS.filter(p => p.category === displayedFilter);
  }, [displayedFilter]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE);
  const paginatedProjects = useMemo(() => {
    const start = currentPage * PROJECTS_PER_PAGE;
    return filteredProjects.slice(start, start + PROJECTS_PER_PAGE);
  }, [filteredProjects, currentPage]);

  // Modal state
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleProjectClick = useCallback((project: Project) => {
    setSelectedProject(project);
    setIsModalOpen(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    // Don't clear selectedProject immediately to allow exit animation
    setTimeout(() => setSelectedProject(null), 500);
  }, []);

  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(prev => prev - 1);
    }
  };

  return (
    <>
      {/* Main container - fits within viewport */}
      <div className="w-full h-full max-w-6xl mx-auto px-4 sm:px-6 flex flex-col justify-center">
        {/* Compact Header */}
        <div className="text-center mb-4 sm:mb-6">
          <div className="flex items-center justify-center gap-4 mb-2">
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-blue-500/40" />
            <span className="mono text-[10px] sm:text-[11px] text-blue-400 tracking-[0.25em] uppercase">Portfolio</span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-blue-500/40" />
          </div>
          <h2 className="serif text-2xl sm:text-4xl font-medium tracking-tight italic text-white">
            Our Work
          </h2>
        </div>

        {/* Filter + GitHub Row */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 mb-4 sm:mb-6">
          {FILTER_CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => handleFilterChange(category)}
              className={`mono text-[9px] sm:text-[10px] px-3 sm:px-4 py-1.5 sm:py-2 uppercase tracking-wider
                transition-all duration-300
                ${activeFilter === category
                  ? 'text-blue-400 bg-blue-500/10 border border-blue-500/30'
                  : 'text-white/40 hover:text-white/70 border border-white/[0.05] hover:border-white/15 bg-white/[0.02]'
                }`}
            >
              {category}
            </button>
          ))}

          {/* GitHub Link */}
          <a
            href={GITHUB_PROFILE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 border border-white/[0.05]
              hover:border-blue-500/30 hover:bg-blue-500/5 transition-all duration-300 group ml-2"
          >
            <Github className="w-3.5 h-3.5 text-gray-500 group-hover:text-blue-400 transition-colors" />
            <span className="mono text-[9px] sm:text-[10px] text-gray-500 group-hover:text-blue-400 uppercase tracking-wider">
              GitHub
            </span>
          </a>
        </div>

        {/* Projects Grid - Compact 3x2 layout */}
        <div className={`transition-all duration-300 ${isFiltering ? 'opacity-0 scale-98' : 'opacity-100 scale-100'}`}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {paginatedProjects.map((project, index) => (
              <CompactProjectCard
                key={project.id}
                project={project}
                index={index}
                onProjectClick={handleProjectClick}
              />
            ))}
          </div>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-center gap-3 sm:gap-4 mt-3 sm:mt-6">
          <button
            onClick={handlePrevPage}
            disabled={currentPage === 0}
            className={`p-2 border transition-all duration-300
              ${currentPage === 0
                ? 'border-white/5 text-white/20 cursor-not-allowed'
                : 'border-white/10 text-white/60 hover:border-blue-500/30 hover:text-blue-400 hover:bg-blue-500/5'}`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Page Indicators */}
          <div className="flex items-center gap-2">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i)}
                className={`page-dot w-2 h-2 rounded-full transition-all duration-300
                  ${i === currentPage
                    ? 'bg-blue-500 w-6'
                    : 'bg-white/20 hover:bg-white/40'}`}
              />
            ))}
          </div>

          <button
            onClick={handleNextPage}
            disabled={currentPage >= totalPages - 1}
            className={`p-2 border transition-all duration-300
              ${currentPage >= totalPages - 1
                ? 'border-white/5 text-white/20 cursor-not-allowed'
                : 'border-white/10 text-white/60 hover:border-blue-500/30 hover:text-blue-400 hover:bg-blue-500/5'}`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Count */}
          <span className="mono text-[9px] text-white/30 ml-2">
            {currentPage * PROJECTS_PER_PAGE + 1}-{Math.min((currentPage + 1) * PROJECTS_PER_PAGE, filteredProjects.length)} / {filteredProjects.length}
          </span>
        </div>
      </div>

      {/* Project Detail Modal */}
      <ProjectDetailModal
        project={selectedProject}
        isOpen={isModalOpen}
        onClose={handleModalClose}
      />
    </>
  );
};

// Compact Project Card - Small, fits in grid without scrolling
const CompactProjectCard: React.FC<{ project: Project; index: number; onProjectClick: (project: Project) => void }> = ({ project, index, onProjectClick }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [cardRect, setCardRect] = useState<DOMRect | null>(null);

  const handleExpand = () => {
    if (cardRef.current) {
      setCardRect(cardRef.current.getBoundingClientRect());
    }
    setIsExpanded(true);
  };

  return (
    <>
      <div
        ref={cardRef}
        onClick={handleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleExpand(); } }}
        className="group relative bg-[#0a0a0a] border border-white/[0.06] overflow-hidden cursor-pointer
          hover:border-blue-500/30 transition-all duration-300"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        {/* Image */}
        <div className="relative aspect-[16/10] overflow-hidden">
          {/* Blur placeholder */}
          <div className={`absolute inset-0 bg-gradient-to-br from-blue-900/20 to-gray-900/40 transition-opacity duration-500
            ${imageLoaded ? 'opacity-0' : 'opacity-100'}`} />

          <img
            src={project.image}
            alt={project.title}
            loading="lazy"
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23111" width="400" height="300"/%3E%3C/svg%3E';
              setImageLoaded(true);
            }}
            className={`w-full h-full object-cover transition-all duration-500
              ${imageLoaded ? 'opacity-60 blur-0' : 'opacity-0 blur-sm'}
              grayscale group-hover:grayscale-0 group-hover:opacity-80 group-hover:scale-105`}
          />

          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/40 to-transparent" />

          {/* Category Badge */}
          <div className="absolute top-2 left-2">
            <span className="mono text-[8px] sm:text-[9px] px-2 py-0.5 bg-black/60 border border-white/10 text-blue-400/80 uppercase tracking-wider">
              {project.category}
            </span>
          </div>

          {/* Year Badge */}
          <div className="absolute top-2 right-2">
            <span className="mono text-[8px] sm:text-[9px] text-white/40">
              {project.year}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-2.5 sm:p-3">
          <h3 className="text-xs sm:text-sm font-medium text-white group-hover:text-blue-400 transition-colors line-clamp-1">
            {project.title}
          </h3>
          <p className="mono text-[8px] sm:text-[9px] text-gray-500 mt-1 line-clamp-1">
            {project.technologies.slice(0, 3).join(' • ')}
          </p>
        </div>

        {/* Hover Arrow */}
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <ArrowUpRight className="w-3.5 h-3.5 text-blue-500" />
        </div>
      </div>

      {/* Expanded Overlay */}
      <ExpandedCardOverlay
        project={project}
        isVisible={isExpanded}
        onClose={() => setIsExpanded(false)}
        onViewDetails={() => {
          setIsExpanded(false);
          onProjectClick(project);
        }}
        originRect={cardRect}
      />
    </>
  );
};


// Expanded Card Overlay - Shows when card is expanded
const ExpandedCardOverlay: React.FC<{
  project: Project;
  isVisible: boolean;
  onClose: () => void;
  onViewDetails: () => void;
  originRect: DOMRect | null;
}> = ({ project, isVisible, onClose, onViewDetails, originRect }) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    if (isVisible) {
      // Start animation after a small delay
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
      // Lock body scroll
      document.body.style.overflow = 'hidden';
    } else {
      setIsAnimating(false);
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isVisible]);

  if (!isVisible && !isAnimating) return null;

  // Use portal to render outside of overflow-hidden containers
  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9999] transition-all duration-300"
        style={{
          backgroundColor: isAnimating ? 'rgba(0, 0, 0, 0.9)' : 'rgba(0, 0, 0, 0)',
          backdropFilter: isAnimating ? 'blur(16px)' : 'blur(0px)',
        }}
        onClick={onClose}
      />

      {/* Expanded Card */}
      <div
        className="fixed z-[10000] left-1/2 top-1/2 w-[90vw] max-w-2xl max-h-[85vh] overflow-y-auto
          bg-[#0a0a0a] border border-white/10 shadow-2xl shadow-blue-500/20
          transition-all duration-500 ease-out"
        style={{
          transform: isAnimating
            ? 'translate(-50%, -50%) scale(1)'
            : 'translate(-50%, -50%) scale(0.9)',
          opacity: isAnimating ? 1 : 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 rounded-full bg-black/50 border border-white/10
            hover:bg-white/10 hover:border-blue-500/50 transition-all duration-300 group"
        >
          <X className="w-4 h-4 text-gray-400 group-hover:text-white" />
        </button>

        {/* Image */}
        <div className="relative aspect-video overflow-hidden">
          <img
            src={project.image}
            alt={project.title}
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"%3E%3Crect fill="%23111" width="400" height="300"/%3E%3Ctext fill="%23333" x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="monospace" font-size="14"%3EImage unavailable%3C/text%3E%3C/svg%3E';
              setImageLoaded(true);
            }}
            className={`w-full h-full object-cover transition-all duration-700
              ${imageLoaded ? 'opacity-70 blur-0' : 'opacity-0 blur-md'}
              hover:opacity-90`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />

          {/* Year Badge */}
          <div className="absolute top-4 left-4">
            <span className="mono text-xs text-blue-400/80 tracking-[0.2em] font-light bg-black/50 px-3 py-1 border border-blue-500/30">
              {project.year}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 sm:p-8">
          {/* Category */}
          <div className="mono text-[10px] text-blue-500/70 uppercase tracking-[0.3em] mb-2">
            {project.category} {project.featured && '• Featured'}
          </div>

          {/* Title */}
          <h3 className="serif text-2xl sm:text-3xl font-medium text-white mb-4">
            {project.title}
          </h3>

          {/* Description */}
          <p className="text-sm text-gray-400 leading-relaxed mb-6">
            {project.description}
          </p>

          {/* Technologies */}
          <div className="mb-6">
            <div className="mono text-[9px] text-gray-600 uppercase tracking-wider mb-2">Technologies</div>
            <div className="flex flex-wrap gap-2">
              {project.technologies.map((tech, i) => (
                <span
                  key={i}
                  className="mono text-[10px] px-3 py-1.5 bg-blue-500/10 text-blue-400/80 uppercase tracking-wider border border-blue-500/20"
                >
                  {tech}
                </span>
              ))}
            </div>
          </div>

          {/* Client */}
          <div className="mono text-[10px] text-gray-500 uppercase tracking-wider mb-6">
            Client: <span className="text-gray-400">{project.client}</span>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onViewDetails}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-500/10 border border-blue-500/30
                hover:bg-blue-500/20 hover:border-blue-500/50 transition-all duration-300 group"
            >
              <span className="mono text-[10px] text-blue-400 uppercase tracking-wider">View Full Details</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-blue-500 group-hover:rotate-45 transition-transform" />
            </button>

            {project.githubUrl && (
              <a
                href={project.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 bg-white/[0.03] border border-white/[0.08]
                  hover:border-white/20 hover:bg-white/[0.06] transition-all duration-300 group"
              >
                <Github className="w-3.5 h-3.5 text-gray-500 group-hover:text-white" />
                <span className="mono text-[10px] text-gray-400 group-hover:text-white uppercase tracking-wider">GitHub</span>
              </a>
            )}

            {project.liveUrl && (
              <a
                href={project.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 bg-white/[0.03] border border-white/[0.08]
                  hover:border-green-500/30 hover:bg-green-500/10 transition-all duration-300 group"
              >
                <ExternalLink className="w-3.5 h-3.5 text-gray-500 group-hover:text-green-400" />
                <span className="mono text-[10px] text-gray-400 group-hover:text-green-400 uppercase tracking-wider">Live Site</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

export default Portfolio;
