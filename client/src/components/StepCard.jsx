import { motion } from 'framer-motion';

export default function StepCard({ step, index, completed, side, onClickDetail }) {
  const hasDetail = step.guide_content || step.links;

  return (
    <div
      className={`group relative w-full ${hasDetail ? 'cursor-pointer' : ''}`}
      role="listitem"
      aria-label={`Step ${index + 1}: ${step.title}${completed ? ' - Complete' : ''}`}
      onClick={onClickDetail ? () => onClickDetail(step) : undefined}
      tabIndex={onClickDetail ? 0 : undefined}
      onKeyDown={onClickDetail ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClickDetail(step);
        }
      } : undefined}
    >
      {/* Card */}
      <div
        className={`relative bg-white rounded-lg border p-5 transition-all duration-200
          ${hasDetail ? 'hover:shadow-md' : ''}
          ${completed
            ? 'border-csub-gold shadow-sm'
            : 'border-gray-200 shadow-sm'
          }
        `}
      >
        {/* Gold top accent when completed */}
        {completed && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-csub-gold rounded-t-lg" />
        )}

        {/* Icon + Title row */}
        <div className="flex items-start gap-3 mb-2">
          <span className="text-2xl flex-shrink-0" aria-hidden="true">{step.icon}</span>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-semibold leading-tight text-csub-blue-dark uppercase tracking-wide">
              {step.title}
            </h3>
            {step.deadline && (
              <span className="inline-block mt-1 bg-csub-gold-light text-csub-blue-dark text-xs font-semibold rounded px-2 py-0.5 font-body">
                {step.deadline}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-csub-gray leading-relaxed font-body mb-3">
          {step.tip || step.description}
        </p>

        {/* Completion status + Learn more */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <motion.div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors
                ${completed
                  ? 'bg-csub-gold border-csub-gold text-csub-blue-dark'
                  : 'border-gray-300 text-transparent'
                }`}
              animate={completed ? { scale: [1, 1.2, 1] } : {}}
              transition={{ duration: 0.3 }}
              aria-hidden="true"
            >
              {completed ? '✓' : ''}
            </motion.div>
            <span className={`text-xs font-body font-semibold ${completed ? 'text-csub-blue' : 'text-gray-400'}`}>
              {completed ? 'Completed' : 'Pending'}
            </span>
          </div>
          {hasDetail && (
            <span className="text-xs font-body text-csub-blue/60 group-hover:text-csub-blue transition-colors">
              Learn more →
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
