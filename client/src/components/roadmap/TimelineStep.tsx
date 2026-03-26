import React from 'react';
import { motion } from 'framer-motion';
import DeadlineCountdown from './DeadlineCountdown.jsx';
import type { StepWithStatus, LinkItem } from '../../types/api.js';

interface StatusConfigEntry {
  nodeClass: string;
  icon: React.ReactNode;
  badgeClass: string;
  badgeLabel: string;
  cardClass: string;
}

const STATUS_CONFIG: Record<string, StatusConfigEntry> = {
  completed: {
    nodeClass: 'bg-csub-gold border-csub-gold text-csub-blue-dark',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
    badgeClass: 'bg-emerald-50 text-emerald-700',
    badgeLabel: 'Completed',
    cardClass: 'border-csub-gold/40 bg-white',
  },
  in_progress: {
    nodeClass: 'bg-csub-blue border-csub-blue text-white ring-4 ring-csub-blue/20',
    icon: null, // shows number
    badgeClass: 'bg-csub-blue/10 text-csub-blue',
    badgeLabel: 'In Progress',
    cardClass: 'border-csub-blue/30 bg-white shadow-md',
  },
  not_started: {
    nodeClass: 'bg-white border-gray-300 text-gray-400',
    icon: null,
    badgeClass: 'bg-gray-100 text-gray-500',
    badgeLabel: 'Not Started',
    cardClass: 'border-gray-200 bg-white',
  },
  waived: {
    nodeClass: 'bg-gray-100 border-gray-300 text-gray-400',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
      </svg>
    ),
    badgeClass: 'bg-slate-100 text-slate-500',
    badgeLabel: 'Waived',
    cardClass: 'border-gray-200 bg-gray-50',
  },
  preview: {
    nodeClass: 'bg-white border-csub-blue text-csub-blue',
    icon: null,
    badgeClass: '',
    badgeLabel: '',
    cardClass: 'border-gray-200 bg-white',
  },
  locked: {
    nodeClass: 'bg-gray-100 border-gray-300 text-gray-400',
    icon: (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
    badgeClass: 'bg-gray-100 text-gray-500',
    badgeLabel: 'Locked',
    cardClass: 'border-gray-200 bg-gray-50 opacity-75',
  },
};

interface Props {
  step: StepWithStatus;
  index: number;
  completedAt?: string | null;
  isLast: boolean;
  onSelect: () => void;
}

export default function TimelineStep({ step, index, completedAt, isLast, onSelect }: Props): React.ReactElement {
  const config = STATUS_CONFIG[step.status] || STATUS_CONFIG.not_started;
  const links: LinkItem[] = step.links ? (typeof step.links === 'string' ? JSON.parse(step.links) : step.links) : [];
  const primaryAction = step.status === 'in_progress' && links.length > 0 ? links[0] : null;
  const isActive = step.status === 'in_progress';

  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-20px' }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
      className={`relative pl-14 sm:pl-16 ${isLast ? 'pb-0' : 'pb-8'}`}
      aria-label={`Step ${index + 1}, ${step.title}, ${config.badgeLabel}${step.deadline ? `, due ${step.deadline}` : ''}`}
    >
      {/* Timeline node */}
      <div className="absolute left-3 sm:left-3.5 top-1 z-10">
        <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${config.nodeClass}`}>
          {config.icon || (
            <span className="text-xs">{index + 1}</span>
          )}
        </div>
      </div>

      {/* Filled spine for completed steps */}
      {step.status === 'completed' && !isLast && (
        <div
          className="absolute left-5 sm:left-6 top-5 sm:top-6 bottom-0 w-0.5 bg-csub-gold z-[1]"
          aria-hidden="true"
        />
      )}

      {/* Card */}
      <button
        onClick={step.status === 'locked' ? undefined : onSelect}
        disabled={step.status === 'locked'}
        className={`w-full text-left rounded-xl border p-4 sm:p-5 transition-all duration-200 group
          ${step.status === 'locked' ? 'cursor-default' : 'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-csub-blue focus:ring-offset-2'}
          ${config.cardClass}
          ${isActive ? 'ring-1 ring-csub-blue/20' : ''}
        `}
        aria-haspopup="dialog"
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <span className="text-xl sm:text-2xl flex-shrink-0 mt-0.5" aria-hidden="true">
            {step.icon}
          </span>

          <div className="flex-1 min-w-0">
            {/* Title row */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className={`font-display text-sm sm:text-base font-bold uppercase tracking-wide leading-tight ${
                  step.status === 'completed' ? 'text-csub-blue-dark' :
                  step.status === 'in_progress' ? 'text-csub-blue-dark' :
                  'text-gray-600'
                }`}>
                  {step.title}
                </h3>
                {step.is_optional === 1 && (
                  <span className="inline-flex mt-1 text-xs font-body font-semibold text-csub-blue bg-csub-blue/10 rounded-full px-2 py-0.5">
                    Optional
                  </span>
                )}
              </div>

              {/* View details arrow */}
              <svg
                className="w-4 h-4 text-gray-300 group-hover:text-csub-blue transition-colors flex-shrink-0 mt-0.5"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>

            {/* Description */}
            <p className={`font-body text-xs sm:text-sm leading-relaxed mt-1 ${
              step.status === 'locked' || step.status === 'waived' ? 'text-gray-400' : 'text-csub-gray'
            }`}>
              {step.description}
            </p>

            {/* Meta row: badges, deadline, action */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {/* Status badge */}
              {config.badgeLabel && (
                <span className={`inline-flex items-center gap-1 text-xs font-body font-semibold rounded-full px-2.5 py-0.5 ${config.badgeClass}`}>
                  {step.status === 'in_progress' && (
                    <span className="w-1.5 h-1.5 bg-csub-blue rounded-full animate-pulse" aria-hidden="true" />
                  )}
                  {config.badgeLabel}
                </span>
              )}

              {/* Deadline */}
              {step.deadline && (
                <span className="text-xs font-body font-medium text-amber-700 bg-amber-50 rounded-full px-2.5 py-0.5">
                  {step.deadline}
                </span>
              )}

              {/* Deadline countdown */}
              <DeadlineCountdown deadlineDate={step.deadline_date} status={step.status} />

              {/* Completed date */}
              {step.status === 'completed' && completedAt && (
                <span className="text-xs font-body text-gray-400">
                  {new Date(completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}

              {/* Spacer */}
              <div className="flex-1" />

              {/* Action CTA for in-progress step */}
              {primaryAction && (
                <a
                  href={primaryAction.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs font-display font-bold uppercase tracking-wider text-csub-blue hover:text-csub-blue-dark transition-colors"
                >
                  {primaryAction.label || 'Get Started'}
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
          </div>
        </div>
      </button>
    </motion.li>
  );
}
