import React from 'react';
import { motion } from 'framer-motion';

interface Props {
  completedCount: number;
  totalSteps: number;
  percentage: number;
  currentStepTitle?: string;
  allComplete: boolean;
}

export default function ProgressSummary({
  completedCount,
  totalSteps,
  percentage,
  currentStepTitle,
  allComplete,
}: Props): React.ReactElement {
  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        {/* Progress text */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wider">
              Your Progress
            </span>
            <span
              className="font-body text-xs font-semibold text-white bg-csub-blue rounded-full px-2.5 py-0.5"
              aria-label={`${percentage} percent complete`}
            >
              {percentage}%
            </span>
          </div>
          <span className="font-body text-sm text-csub-gray">
            <span className="font-semibold text-csub-blue-dark">{completedCount}</span> of {totalSteps} steps
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100} aria-label={`${completedCount} of ${totalSteps} steps completed`}>
          <motion.div
            className="h-full rounded-full"
            style={{
              background: allComplete
                ? 'linear-gradient(90deg, #003594, #FFC72C)'
                : 'linear-gradient(90deg, #003594, #0052CC)',
            }}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>

        {/* Current step hint */}
        <div aria-live="polite" aria-atomic="true">
          {currentStepTitle && !allComplete && (
            <p className="font-body text-xs text-csub-gray mt-1.5">
              Next up: <span className="font-semibold text-csub-blue-dark">{currentStepTitle}</span>
            </p>
          )}
          {allComplete && (
            <p className="font-body text-xs text-csub-blue font-semibold mt-1.5">
              All steps completed — you're all set!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
