import React from 'react';
import { motion } from 'framer-motion';
import type { StepWithStatus, LinkItem } from '../../types/api.js';

interface Props {
  step: StepWithStatus;
  stepNumber: number;
  onViewDetails: () => void;
}

export default function CurrentStepCallout({ step, stepNumber, onViewDetails }: Props): React.ReactElement {
  const links: LinkItem[] = step.links ? (typeof step.links === 'string' ? JSON.parse(step.links) : step.links) : [];
  const primaryAction = links.length > 0 ? links[0] : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-6 mb-8"
      aria-label="Current step"
    >
      <div className="bg-white rounded-xl border-2 border-csub-blue shadow-lg overflow-hidden">
        {/* Blue accent bar */}
        <div className="h-1.5 bg-gradient-to-r from-csub-blue to-csub-gold" aria-hidden="true" />

        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-4">
            {/* Step icon */}
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-csub-blue/10 flex items-center justify-center">
              <span className="text-2xl" aria-hidden="true">{step.icon}</span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 text-xs font-body font-bold text-csub-blue bg-csub-blue/10 rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 bg-csub-blue rounded-full animate-pulse" aria-hidden="true" />
                  Step {stepNumber} — Next Up
                </span>
                {step.deadline && (
                  <span className="text-xs font-body font-semibold text-amber-700 bg-amber-50 rounded-full px-2.5 py-0.5">
                    {step.deadline}
                  </span>
                )}
              </div>

              <h2 className="font-display text-lg sm:text-xl font-bold text-csub-blue-dark uppercase tracking-wide">
                {step.title}
              </h2>
              <p className="font-body text-sm text-csub-gray mt-1 leading-relaxed">
                {step.description}
              </p>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 mt-4">
                {primaryAction && (
                  <a
                    href={primaryAction.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider text-sm px-5 py-2.5 rounded-lg shadow transition-colors"
                  >
                    {step.actionLabel || primaryAction.label || 'Get Started'}
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </a>
                )}
                <button
                  onClick={onViewDetails}
                  aria-label={`View details for ${step.title}`}
                  className="inline-flex items-center gap-1.5 font-body text-sm font-semibold text-csub-blue hover:text-csub-blue-dark transition-colors"
                >
                  View details
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
