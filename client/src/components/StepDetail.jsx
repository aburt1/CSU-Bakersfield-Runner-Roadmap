import { motion } from 'framer-motion';
import DOMPurify from 'dompurify';

export default function StepDetail({ step, completed, onClose }) {
  if (!step) return null;

  const links = step.links ? (typeof step.links === 'string' ? JSON.parse(step.links) : step.links) : [];
  const isHtmlContent = step.guide_content && /<[a-z][\s\S]*>/i.test(step.guide_content);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <motion.div
        className="relative bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
      >
        {/* Header */}
        <div className={`px-6 pt-6 pb-4 border-b ${completed ? 'border-csub-gold' : 'border-gray-200'}`}>
          {completed && (
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-csub-gold rounded-t-xl" />
          )}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="text-3xl flex-shrink-0">{step.icon}</span>
              <div>
                <h2 className="font-display text-xl font-bold text-csub-blue-dark uppercase tracking-wide">
                  {step.title}
                </h2>
                {step.deadline && (
                  <span className="inline-block mt-1 bg-csub-gold-light text-csub-blue-dark text-xs font-semibold rounded px-2 py-0.5 font-body">
                    {step.deadline}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-csub-gray hover:text-csub-blue-dark transition-colors text-2xl leading-none flex-shrink-0 mt-1"
              aria-label="Close"
            >
              &times;
            </button>
          </div>

          {/* Status badge */}
          <div className="mt-3 flex items-center gap-2">
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold ${
              completed
                ? 'bg-csub-gold border-csub-gold text-csub-blue-dark'
                : 'border-gray-300 text-transparent'
            }`}>
              {completed ? '✓' : ''}
            </div>
            <span className={`text-sm font-body font-semibold ${completed ? 'text-csub-blue' : 'text-gray-400'}`}>
              {completed ? 'Completed' : 'Pending'}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Description */}
          <p className="font-body text-sm text-csub-gray leading-relaxed">
            {step.description}
          </p>

          {/* Guide content */}
          {step.guide_content && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide mb-2">
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

          {/* Links */}
          {!isHtmlContent && links.length > 0 && (
            <div>
              <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide mb-2">
                Helpful Links
              </h3>
              <div className="space-y-2">
                {links.map((link, i) => (
                  <a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-csub-blue/20 bg-csub-blue/5 hover:bg-csub-blue/10 transition-colors font-body text-sm text-csub-blue font-semibold"
                  >
                    <span>🔗</span>
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-6 py-3 rounded-lg shadow transition-colors duration-200 text-sm"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
