import { useEffect } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

export default function Celebration({ onClose }) {
  useEffect(() => {
    // Fire confetti!
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        exit={{ scale: 0, rotate: 10 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="bg-white rounded-3xl p-8 md:p-12 max-w-md mx-4 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-7xl mb-4">🏆</div>
        <h2 className="font-display text-3xl font-bold text-csub-blue mb-3">
          You Did It!
        </h2>
        <p className="font-body text-lg text-gray-600 mb-2">
          All steps complete! You are officially ready for your first day at
        </p>
        <p className="font-display text-2xl font-bold text-csub-gold mb-6">
          CSU Bakersfield!
        </p>
        <div className="text-5xl mb-6 animate-bounce-slow">🐦</div>
        <p className="font-body text-csub-blue font-bold text-lg mb-6">
          Go Runners!
        </p>
        <button
          onClick={onClose}
          className="bg-csub-blue text-white font-display font-bold py-3 px-8 rounded-full
                     hover:bg-csub-blue-dark transition-colors shadow-lg
                     hover:shadow-xl active:scale-95 transform"
        >
          Let&apos;s Go!
        </button>
      </motion.div>
    </motion.div>
  );
}
