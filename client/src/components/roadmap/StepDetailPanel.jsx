import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import DOMPurify from 'dompurify';

const STATUS_LABELS = {
  completed: { label: 'Completed', class: 'bg-emerald-50 text-emerald-700' },
  in_progress: { label: 'In Progress', class: 'bg-csub-blue/10 text-csub-blue' },
  not_started: { label: 'Not Started', class: 'bg-gray-100 text-gray-500' },
  waived: { label: 'Waived', class: 'bg-slate-100 text-slate-500' },
  locked: { label: 'Locked', class: 'bg-gray-100 text-gray-500' },
};

export default function StepDetailPanel({ step, stepNumber, totalSteps, completedAt, onClose, onNavigate, hasPrev, hasNext }) {
  const panelRef = useRef(null);
  const links = step.links ? (typeof step.links === 'string' ? JSON.parse(step.links) : step.links) : [];
  const isHtmlContent = step.guide_content && /<[a-z][\s\S]*>/i.test(step.guide_content);
  const statusConfig = STATUS_LABELS[step.status] || STATUS_LABELS.not_started;

  // Trap focus and handle escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate('prev');
      if (e.key === 'ArrowRight' && hasNext) onNavigate('next');
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose, onNavigate, hasPrev, hasNext]);

  // Focus panel on open
  useEffect(() => {
    panelRef.current?.focus();
  }, [step.id]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Panel */}
      <motion.div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Step ${stepNumber}: ${step.title}`}
        initial={{ y: '100%', opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 350 }}
        className="relative bg-white w-full sm:max-w-lg sm:rounded-xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto focus:outline-none"
      >
        {/* Status accent bar */}
        <div className={`h-1.5 ${
          step.status === 'completed' ? 'bg-gradient-to-r from-csub-gold to-amber-300' :
          step.status === 'in_progress' ? 'bg-gradient-to-r from-csub-blue to-blue-400' :
          'bg-gray-200'
        } sm:rounded-t-xl`} />

        {/* Header */}
        <div className="px-5 sm:px-6 pt-5 pb-4">
          {/* Nav + close */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-1">
              <button
                onClick={() => onNavigate('prev')}
                disabled={!hasPrev}
                className="p-1.5 rounded-lg text-gray-400 hover:text-csub-blue hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Previous step"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="font-body text-xs text-gray-400 font-medium px-1">
                {stepNumber} of {totalSteps}
              </span>
              <button
                onClick={() => onNavigate('next')}
                disabled={!hasNext}
                className="p-1.5 rounded-lg text-gray-400 hover:text-csub-blue hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Next step"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-csub-blue-dark hover:bg-gray-100 transition-colors"
              aria-label="Close details"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Step header */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center">
              <span className="text-2xl" aria-hidden="true">{step.icon}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-lg sm:text-xl font-bold text-csub-blue-dark uppercase tracking-wide">
                {step.title}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <span className={`inline-flex items-center gap-1 text-xs font-body font-semibold rounded-full px-2.5 py-0.5 ${statusConfig.class}`}>
                  {step.status === 'in_progress' && (
                    <span className="w-1.5 h-1.5 bg-csub-blue rounded-full animate-pulse" aria-hidden="true" />
                  )}
                  {statusConfig.label}
                </span>
                {step.deadline && (
                  <span className="text-xs font-body font-medium text-amber-700 bg-amber-50 rounded-full px-2.5 py-0.5">
                    {step.deadline}
                  </span>
                )}
                {completedAt && (
                  <span className="text-xs font-body text-gray-400">
                    Completed {new Date(completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100 mx-5 sm:mx-6" />

        {/* Content */}
        <div className="px-5 sm:px-6 py-5 space-y-5">
          {/* Description */}
          <p className="font-body text-sm text-csub-gray leading-relaxed">
            {step.description}
          </p>

          {/* Guide content */}
          {step.guide_content && (
            <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100/50">
              <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 text-csub-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                How to Complete This Step
              </h3>
              {isHtmlContent ? (
                <div
                  className="prose prose-sm max-w-none font-body text-sm text-csub-gray leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(step.guide_content) }}
                />
              ) : (
                <div className="font-body text-sm text-csub-gray leading-relaxed whitespace-pre-wrap">
                  {step.guide_content}
                </div>
              )}
            </div>
          )}

          {/* Locked reason */}
          {step.status === 'locked' && step.lockedReason && (
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
              <p className="font-body text-sm text-gray-500 flex items-start gap-2">
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                {step.lockedReason}
              </p>
            </div>
          )}

          {/* Action links — only show for old-format steps (non-HTML guide content) */}
          {!isHtmlContent && links.length > 0 && step.status !== 'locked' && (
            <div>
              <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide mb-3">
                Helpful Links
              </h3>
              <div className="space-y-2">
                {links.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-white hover:bg-csub-blue/5 hover:border-csub-blue/20 transition-all font-body text-sm text-csub-blue font-semibold group"
                  >
                    <svg className="w-4 h-4 text-csub-blue/50 group-hover:text-csub-blue transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Waived note */}
          {step.status === 'waived' && (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
              <p className="font-body text-sm text-slate-500">
                This step has been waived by your admissions counselor. No action is needed from you.
              </p>
            </div>
          )}

          {/* Step-specific contact */}
          {(() => {
            const contact = step.contact_info
              ? (typeof step.contact_info === 'string' ? JSON.parse(step.contact_info) : step.contact_info)
              : null;
            if (!contact || !contact.name) return null;
            return (
              <div>
                <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide mb-2">
                  Need Help With This Step?
                </h3>
                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <svg className="w-4 h-4 text-csub-blue flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <div>
                    <p className="font-body text-sm font-semibold text-csub-blue-dark">{contact.name}</p>
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="font-body text-xs text-csub-blue hover:underline block">
                        {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`} className="font-body text-xs text-csub-blue hover:underline block">
                        {contact.phone}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 pb-6 pt-2">
          {/* Primary action for in-progress */}
          {step.status === 'in_progress' && !isHtmlContent && links.length > 0 && (
            <a
              href={links[0].url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider text-sm px-6 py-3.5 rounded-xl shadow transition-colors mb-3"
            >
              {links[0].label || 'Get Started'}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          )}

          <button
            onClick={onClose}
            className="w-full font-body text-sm font-semibold text-csub-gray hover:text-csub-blue-dark py-2 transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
