import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

/* Inline SVG shield in CSUB blue/gold — resembles the university crest shape */
function CsubShield(): React.ReactElement {
  return (
    <svg width="80" height="96" viewBox="0 0 80 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Shield body */}
      <path
        d="M40 2 L76 16 L76 52 C76 72 60 88 40 94 C20 88 4 72 4 52 L4 16 Z"
        fill="#003594"
        stroke="#FFC72C"
        strokeWidth="3"
      />
      {/* Rising sun rays */}
      <g opacity="0.3">
        <line x1="40" y1="58" x2="20" y2="38" stroke="#FFC72C" strokeWidth="1.5" />
        <line x1="40" y1="58" x2="28" y2="32" stroke="#FFC72C" strokeWidth="1.5" />
        <line x1="40" y1="58" x2="40" y2="28" stroke="#FFC72C" strokeWidth="1.5" />
        <line x1="40" y1="58" x2="52" y2="32" stroke="#FFC72C" strokeWidth="1.5" />
        <line x1="40" y1="58" x2="60" y2="38" stroke="#FFC72C" strokeWidth="1.5" />
      </g>
      {/* Sun arc */}
      <path
        d="M18 62 Q40 42 62 62"
        fill="#FFC72C"
        opacity="0.9"
      />
      {/* Horizon line */}
      <line x1="14" y1="62" x2="66" y2="62" stroke="#FFC72C" strokeWidth="2" />
      {/* Checkmark */}
      <path
        d="M28 48 L36 56 L54 34"
        stroke="#FFC72C"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

interface Props {
  onClose: () => void;
}

export default function Celebration({ onClose }: Props): React.ReactElement {
  const dialogRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Confetti animation — skip if user prefers reduced motion
  useEffect(() => {
    if (prefersReducedMotion) return;

    const duration = 3000;
    const end = Date.now() + duration;
    const csubColors = ['#003594', '#FFC72C', '#ffffff'];

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: csubColors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: csubColors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();
  }, []);

  // Focus trap + keyboard dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Celebration — all steps complete"
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={prefersReducedMotion ? false : { opacity: 1 }}
      exit={prefersReducedMotion ? undefined : { opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-csub-blue-dark/60 backdrop-blur-sm focus:outline-none"
      onClick={onClose}
    >
      <motion.div
        initial={prefersReducedMotion ? false : { scale: 0.8, opacity: 0 }}
        animate={prefersReducedMotion ? false : { scale: 1, opacity: 1 }}
        exit={prefersReducedMotion ? undefined : { scale: 0.8, opacity: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 18 }}
        className="bg-white rounded-2xl p-8 md:p-12 max-w-md mx-4 text-center shadow-2xl border border-gray-100"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {/* Shield crest */}
        <div className="flex justify-center mb-6">
          <motion.div
            initial={prefersReducedMotion ? false : { y: -20 }}
            animate={prefersReducedMotion ? false : { y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.2, type: 'spring' }}
          >
            <CsubShield />
          </motion.div>
        </div>

        <h2 className="font-display text-3xl font-bold text-csub-blue-dark uppercase tracking-wide mb-2">
          Congratulations!
        </h2>

        <div className="w-16 h-0.5 bg-csub-gold mx-auto my-4" aria-hidden="true" />

        <p className="font-body text-base text-csub-gray mb-1">
          All steps complete. You are officially ready for
        </p>
        <p className="font-display text-xl font-bold text-csub-blue uppercase tracking-wider mb-6">
          Your first day at CSU Bakersfield
        </p>

        <p className="font-display text-csub-gold text-lg font-bold uppercase tracking-widest mb-8">
          Go Runners!
        </p>

        <button
          onClick={onClose}
          className="bg-csub-blue text-white font-display font-bold uppercase tracking-wider py-3 px-10 rounded
                     hover:bg-csub-blue-dark transition-colors shadow-lg
                     hover:shadow-xl active:scale-95 transform text-sm"
        >
          Continue
        </button>
      </motion.div>
    </motion.div>
  );
}
