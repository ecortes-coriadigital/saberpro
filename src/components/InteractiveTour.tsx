import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

export interface TourStep {
  targetId: string;
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  actionBeforeStep?: () => void; // Optional hook (e.g. to switch tabs)
}

interface InteractiveTourProps {
  steps: TourStep[];
  onComplete: () => void;
  isOpen: boolean;
}

export const InteractiveTour: React.FC<InteractiveTourProps> = ({ steps, onComplete, isOpen }) => {
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const currentStep = steps[currentStepIdx];

  // Recalculate coordinates of the active element
  const updateCoords = () => {
    if (!isOpen || !currentStep) return;

    // Optional action before highlighting (e.g., switching tabs)
    if (currentStep.actionBeforeStep) {
      currentStep.actionBeforeStep();
    }

    // Give a brief delay for any tab transitions or rendering to settle
    setTimeout(() => {
      const element = document.getElementById(currentStep.targetId);
      if (element) {
        // Scroll the target element into view smoothly and center it
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Wait for smooth scroll animation to finish before reading position
        setTimeout(() => {
          const rect = element.getBoundingClientRect();
          setCoords({
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          });
        }, 350);
      } else {
        setCoords(null);
      }
    }, 50);
  };

  // Run updates on step change or window resize
  useEffect(() => {
    updateCoords();
  }, [currentStepIdx, isOpen]);

  useEffect(() => {
    window.addEventListener('resize', updateCoords);
    window.addEventListener('scroll', updateCoords, true);
    return () => {
      window.removeEventListener('resize', updateCoords);
      window.removeEventListener('scroll', updateCoords, true);
    };
  }, [currentStepIdx, isOpen]);

  if (!isOpen || steps.length === 0) return null;

  const handleNext = () => {
    if (currentStepIdx < steps.length - 1) {
      setCurrentStepIdx(prev => prev + 1);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    if (currentStepIdx > 0) {
      setCurrentStepIdx(prev => prev - 1);
    }
  };

  // Tooltip bubble positioning
  const getTooltipStyle = () => {
    if (!coords) {
      // Centered fallback if element is not found
      return {
        position: 'fixed' as const,
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '320px',
        zIndex: 100000
      };
    }

    const margin = 16;
    const tooltipWidth = 320;
    const estimatedHeight = 220; // Estimated height for auto-flipping
    const padding = 16;

    let pos = currentStep.position || 'bottom';
    
    // Auto-flip based on space availability
    if (typeof window !== 'undefined') {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      if (pos === 'top' && coords.top - margin - estimatedHeight < padding) {
        // Not enough space at top, flip to bottom
        pos = 'bottom';
      } else if (pos === 'bottom' && coords.top + coords.height + margin + estimatedHeight > windowHeight - padding) {
        // Not enough space at bottom, flip to top
        pos = 'top';
      } else if (pos === 'left' && coords.left - margin - tooltipWidth < padding) {
        // Not enough space at left, flip to right
        pos = 'right';
      } else if (pos === 'right' && coords.left + coords.width + margin + tooltipWidth > windowWidth - padding) {
        // Not enough space at right, flip to left
        pos = 'left';
      }
    }

    // Calculate initial coordinates based on position
    let top = coords.top + coords.height + margin;
    let left = coords.left + coords.width / 2;
    let transform = 'translateX(-50%)';

    if (pos === 'top') {
      top = coords.top - margin;
      left = coords.left + coords.width / 2;
      transform = 'translate(-50%, -100%)';
    } else if (pos === 'right') {
      top = coords.top + coords.height / 2;
      left = coords.left + coords.width + margin;
      transform = 'translateY(-50%)';
    } else if (pos === 'left') {
      top = coords.top + coords.height / 2;
      left = coords.left - margin;
      transform = 'translate(-100%, -50%)';
    }

    // Keep tooltip within horizontal and vertical viewport boundaries
    if (typeof window !== 'undefined') {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      if (pos === 'top' || pos === 'bottom') {
        const minLeft = tooltipWidth / 2 + padding;
        const maxLeft = windowWidth - tooltipWidth / 2 - padding;
        left = Math.max(minLeft, Math.min(maxLeft, left));
      } else if (pos === 'right') {
        left = Math.max(padding, Math.min(windowWidth - tooltipWidth - padding, left));
      } else if (pos === 'left') {
        left = Math.max(tooltipWidth + padding, Math.min(windowWidth - padding, left));
      }

      // Vertical bounds correction
      if (pos === 'top') {
        top = Math.max(estimatedHeight + padding, top);
      } else if (pos === 'bottom') {
        top = Math.min(windowHeight - estimatedHeight - padding, Math.max(padding, top));
      } else {
        const minTop = estimatedHeight / 2 + padding;
        const maxTop = windowHeight - estimatedHeight / 2 - padding;
        top = Math.max(minTop, Math.min(maxTop, top));
      }
    }

    return {
      position: 'fixed' as const,
      top: `${top}px`,
      left: `${left}px`,
      transform,
      width: `${tooltipWidth}px`,
      zIndex: 100000,
      transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    };
  };

  return (
    <>
      {/* Spotlight Mask overlay around coordinates */}
      {coords ? (
        <div 
          className="tour-overlay-spotlight"
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            height: `${coords.height}px`,
            borderRadius: '8px',
            boxShadow: '0 0 0 9999px rgba(10, 15, 30, 0.75)',
            border: '2px solid var(--color-primary)',
            outline: 'none',
            pointerEvents: 'none',
            zIndex: 99999,
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            animation: 'tourPulse 2s infinite ease-in-out'
          }}
        />
      ) : (
        // Plain full dark overlay if element is not in DOM
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(10, 15, 30, 0.75)',
            zIndex: 99999
          }}
        />
      )}

      {/* Floating Tooltip Bubble wrapper to avoid transform conflict */}
      <div 
        style={getTooltipStyle()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Animated Inner Card */}
        <div 
          ref={tooltipRef}
          className="animate-fade-in"
          style={{
            background: '#1e293b', // premium solid dark slate
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '16px', // premium rounded corners
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
            padding: '1.25rem',
            color: '#f8fafc',
            width: '100%',
            position: 'relative'
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ 
              fontSize: '0.7rem', 
              textTransform: 'uppercase', 
              letterSpacing: '0.05em', 
              color: '#ff9040', 
              fontWeight: 800,
              backgroundColor: 'rgba(255, 81, 0, 0.15)',
              padding: '4px 10px',
              borderRadius: '9999px',
              display: 'inline-flex',
              alignItems: 'center'
            }}>
              Paso {currentStepIdx + 1} de {steps.length}
            </span>
            <button 
              onClick={onComplete}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}
              title="Omitir guía"
              onMouseEnter={(e) => e.currentTarget.style.color = '#ffffff'}
              onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
            >
              <X size={16} />
            </button>
          </div>

          {/* Title & Description */}
          <h4 style={{ margin: '0 0 0.5rem 0', fontWeight: 800, fontSize: '1.05rem', color: '#ffffff' }}>
            {currentStep.title}
          </h4>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            {currentStep.content}
          </p>

          {/* Controls Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '0.85rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <button 
              onClick={onComplete}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: '#94a3b8', 
                cursor: 'pointer', 
                fontSize: '0.75rem', 
                fontWeight: 600,
                padding: '0.35rem 0.65rem',
                borderRadius: '8px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#94a3b8';
                e.currentTarget.style.background = 'none';
              }}
            >
              Omitir
            </button>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {currentStepIdx > 0 && (
                <button 
                  onClick={handlePrev}
                  style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.25rem', 
                    background: 'rgba(255, 255, 255, 0.08)', 
                    border: '1px solid rgba(255, 255, 255, 0.1)', 
                    color: '#e2e8f0', 
                    cursor: 'pointer',
                    padding: '0.35rem 0.75rem', 
                    fontSize: '0.75rem', 
                    borderRadius: '8px',
                    fontWeight: 600,
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  }}
                >
                  <ArrowLeft size={12} />
                  Atrás
                </button>
              )}

              <button 
                onClick={handleNext}
                style={{ 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '0.25rem', 
                  background: 'linear-gradient(135deg, #ff5100, #ff7b00)', 
                  border: 'none', 
                  color: '#ffffff', 
                  cursor: 'pointer',
                  padding: '0.35rem 0.85rem', 
                  fontSize: '0.75rem', 
                  fontWeight: 700,
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(255, 81, 0, 0.25)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 81, 0, 0.35)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 81, 0, 0.25)';
                }}
              >
                {currentStepIdx === steps.length - 1 ? 'Terminar' : 'Siguiente'}
                {currentStepIdx < steps.length - 1 && <ArrowRight size={12} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
