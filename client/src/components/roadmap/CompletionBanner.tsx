import React from 'react';
import { motion } from 'framer-motion';

interface Props {
  firstName: string;
}

export default function CompletionBanner({ firstName }: Props): React.ReactElement {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mt-6 mb-8"
      aria-label="All steps completed"
    >
      <div className="bg-gradient-to-br from-csub-blue-dark to-csub-blue rounded-xl p-6 sm:p-8 text-center text-white shadow-lg overflow-hidden relative">
        {/* Decorative gold accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-csub-gold via-amber-300 to-csub-gold" />

        <div className="relative z-10">
          <div className="text-4xl mb-3" aria-hidden="true">🎉</div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-wide mb-2">
            Congratulations, {firstName}!
          </h2>
          <p className="font-body text-white/80 text-sm sm:text-base max-w-md mx-auto mb-1">
            You've completed all required admissions steps.
          </p>
          <p className="font-display text-csub-gold text-lg font-bold uppercase tracking-widest">
            Welcome to CSUB, Runner!
          </p>
        </div>

        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: 'radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />
      </div>
    </motion.section>
  );
}
