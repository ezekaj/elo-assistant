import React, { useState, useCallback, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

// Section mapping for navigation
const NAV_SECTIONS = [
  { name: 'Home', index: 0 },
  { name: 'Services', index: 1 },
  { name: 'Work', index: 2 },
  { name: 'Contact', index: 4 },
] as const;

// Custom event for section navigation
export const navigateToSection = (sectionIndex: number) => {
  window.dispatchEvent(new CustomEvent('navigate-section', { detail: { sectionIndex } }));
};

interface NavbarProps {
  currentSection?: number;
  scrollProgress?: number;
}

const Navbar: React.FC<NavbarProps> = ({ currentSection = 0, scrollProgress = 0 }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Handle Escape key to close mobile menu
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileMenuOpen]);

  // Navigation items to display (excludes Home and Contact which have special handling)
  const navItems = NAV_SECTIONS.filter(s => ['Services', 'Work'].includes(s.name));

  const handleNavClick = useCallback((e: React.MouseEvent, sectionIndex: number) => {
    e.preventDefault();
    navigateToSection(sectionIndex);
    setMobileMenuOpen(false);
  }, []);

  const handleLogoClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    navigateToSection(0); // Navigate to Home
  }, []);

  const handleContactClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    navigateToSection(4); // Navigate to Contact
    setMobileMenuOpen(false);
  }, []);

  // Hide navbar when scrolled past Hero section
  const isHidden = scrollProgress > 0.05;

  // Check if a nav item is active
  const isActive = (sectionIndex: number) => currentSection === sectionIndex;

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-[100] py-6 sm:py-10 px-4 sm:px-12 flex justify-between items-center pointer-events-none transition-all duration-500"
        style={{
          transform: isHidden ? 'translateY(-100%)' : 'translateY(0)',
          opacity: isHidden ? 0 : 1,
        }}
      >
        {/* Scroll progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/5">
          <div
            className="h-full bg-blue-500/60 transition-transform duration-100 origin-left"
            style={{ transform: `scaleX(${scrollProgress})` }}
          />
        </div>
        {/* Logo */}
        <button
          onClick={handleLogoClick}
          className="pointer-events-auto group flex items-center space-x-2 sm:space-x-3 cursor-pointer bg-transparent border-none"
        >
          <img
            src="/logo.png"
            alt="Z.E Digital Tech"
            className="w-8 h-8 sm:w-10 sm:h-10 group-hover:brightness-125 transition-all"
            onError={(e) => {
              // Fallback to text if logo fails to load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <span className="text-sm sm:text-base font-bold tracking-tight text-white uppercase group-hover:tracking-wider transition-all">Z.E Digital</span>
        </button>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center space-x-8 lg:space-x-16 pointer-events-auto">
          {navItems.map((item) => (
            <button
              key={item.name}
              onClick={(e) => handleNavClick(e, item.index)}
              className={`text-[11px] uppercase tracking-[0.3em] font-bold transition-all duration-300 bg-transparent border-none cursor-pointer relative ${
                isActive(item.index)
                  ? 'text-white'
                  : 'text-gray-500 hover:text-white'
              }`}
            >
              {item.name}
              {/* Active indicator underline */}
              <span
                className={`absolute -bottom-1 left-0 h-[2px] bg-blue-500 transition-all duration-300 ${
                  isActive(item.index) ? 'w-full opacity-100' : 'w-0 opacity-0'
                }`}
              />
            </button>
          ))}
          <div className="h-px w-8 lg:w-12 bg-white/10"></div>
          <button
            onClick={handleContactClick}
            className={`text-[11px] uppercase tracking-[0.3em] font-bold transition-all duration-300 bg-transparent border-none cursor-pointer relative ${
              isActive(4)
                ? 'text-white'
                : 'text-blue-500 hover:text-white'
            }`}
          >
            Contact
            {/* Active indicator underline */}
            <span
              className={`absolute -bottom-1 left-0 h-[2px] bg-blue-500 transition-all duration-300 ${
                isActive(4) ? 'w-full opacity-100' : 'w-0 opacity-0'
              }`}
            />
          </button>
        </div>

        {/* Mobile Menu Button - 44x44px minimum for accessibility */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden pointer-events-auto w-11 h-11 flex items-center justify-center text-white rounded-lg hover:bg-white/5 active:bg-white/10 transition-colors"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[90] bg-[#030304]/95 backdrop-blur-sm md:hidden">
          <div className="flex flex-col items-center justify-center h-full space-y-8">
            {navItems.map((item) => (
              <button
                key={item.name}
                onClick={(e) => handleNavClick(e, item.index)}
                className={`text-sm uppercase tracking-[0.3em] font-bold transition-all duration-300 bg-transparent border-none cursor-pointer relative ${
                  isActive(item.index)
                    ? 'text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {/* Active indicator dot */}
                {isActive(item.index) && (
                  <span className="absolute -left-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500" />
                )}
                {item.name}
              </button>
            ))}
            <div className="h-px w-16 bg-white/10"></div>
            <button
              onClick={handleContactClick}
              className={`text-sm uppercase tracking-[0.3em] font-bold transition-all duration-300 bg-transparent border-none cursor-pointer relative ${
                isActive(4)
                  ? 'text-white'
                  : 'text-blue-500 hover:text-white'
              }`}
            >
              {/* Active indicator dot */}
              {isActive(4) && (
                <span className="absolute -left-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500" />
              )}
              Contact
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
