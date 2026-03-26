import React from 'react';
import DeadlineCountdown from './DeadlineCountdown.jsx';
import type { StepWithStatus, StepStatus } from '../../types/api.js';

interface StatusConfigEntry {
  badgeClass: string;
  badgeLabel: string;
  iconClass: string;
  icon: string | null;
}

const STATUS_CONFIG: Record<string, StatusConfigEntry> = {
  completed: {
    badgeClass: 'bg-emerald-50 text-emerald-700',
    badgeLabel: 'Completed',
    iconClass: 'bg-csub-gold border-csub-gold text-csub-blue-dark',
    icon: '\u2713',
  },
  in_progress: {
    badgeClass: 'bg-csub-blue/10 text-csub-blue',
    badgeLabel: 'In Progress',
    iconClass: 'bg-csub-blue border-csub-blue text-white',
    icon: null,
  },
  not_started: {
    badgeClass: 'bg-gray-100 text-gray-500',
    badgeLabel: 'Not Started',
    iconClass: 'bg-white border-gray-300 text-gray-400',
    icon: null,
  },
  waived: {
    badgeClass: 'bg-slate-100 text-slate-500',
    badgeLabel: 'Waived',
    iconClass: 'bg-slate-100 border-slate-300 text-slate-400',
    icon: '\u2014',
  },
  locked: {
    badgeClass: 'bg-gray-100 text-gray-500',
    badgeLabel: 'Locked',
    iconClass: 'bg-gray-100 border-gray-300 text-gray-400',
    icon: null,
  },
};

interface Props {
  steps: StepWithStatus[];
  completedDates: Record<number, string | null>;
  onSelectStep: (step: StepWithStatus) => void;
}

export default function ListView({ steps, completedDates, onSelectStep }: Props): React.ReactElement {
  return (
    <ul className="space-y-2" aria-label="Admissions steps list">
      {steps.map((step, index) => {
        const config = STATUS_CONFIG[step.status] || STATUS_CONFIG.not_started;

        return (
          <li key={step.id}>
            <button
              onClick={() => onSelectStep(step)}
              className="w-full text-left flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200 hover:shadow-md hover:border-csub-blue/20 transition-all focus:outline-none focus:ring-2 focus:ring-csub-blue focus:ring-offset-2 group"
              aria-label={`Step ${index + 1}, ${step.title}, ${config.badgeLabel}`}
            >
              {/* Status circle */}
              <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 ${config.iconClass}`}>
                {config.icon || <span className="text-xs">{index + 1}</span>}
              </div>

              {/* Icon */}
              <span className="text-lg flex-shrink-0" aria-hidden="true">{step.icon}</span>

              {/* Title + description */}
              <div className="flex-1 min-w-0">
                <p className={`font-display text-sm font-bold uppercase tracking-wide leading-tight ${
                  step.status === 'completed' || step.status === 'in_progress' ? 'text-csub-blue-dark' : 'text-gray-500'
                }`}>
                  {step.title}
                </p>
                {step.is_optional === 1 && (
                  <span className="inline-flex mt-1 text-xs font-body font-semibold text-csub-blue bg-csub-blue/10 rounded-full px-2 py-0.5">
                    Optional
                  </span>
                )}
              </div>

              {/* Badges */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                {step.deadline && (
                  <span className="hidden sm:inline text-xs font-body font-medium text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
                    {step.deadline}
                  </span>
                )}
                <DeadlineCountdown deadlineDate={step.deadline_date} status={step.status} />
                <span className={`hidden sm:inline text-xs font-body font-semibold rounded-full px-2.5 py-0.5 ${config.badgeClass}`}>
                  {config.badgeLabel}
                </span>
              </div>

              {/* Chevron */}
              <svg className="w-4 h-4 text-gray-300 group-hover:text-csub-blue transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
