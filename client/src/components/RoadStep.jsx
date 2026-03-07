import { motion } from 'framer-motion';

export default function RoadStep({ step, index, completed, onToggle, side }) {
  const isLeft = side === 'left';

  return (
    <motion.div
      className="road-sign"
      initial={{ opacity: 0, scale: 0.6, y: 20 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{
        type: 'spring',
        stiffness: 150,
        damping: 15,
        delay: index * 0.05,
      }}
      onClick={() => onToggle(step.id)}
      role="button"
      tabIndex={0}
      aria-label={`${step.title} - ${completed ? 'Completed' : 'Not completed'}. Click to toggle.`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle(step.id);
        }
      }}
    >
      {/* Sign post */}
      <div className="sign-post" />

      {/* Sign card */}
      <div className={`sign-card ${completed ? 'completed' : ''}`}>
        {/* Step number badge */}
        <div className="step-badge">{index + 1}</div>

        {/* Icon & title row */}
        <div className="flex items-start gap-2 mb-1">
          <span className="text-xl flex-shrink-0 mt-0.5">{step.icon}</span>
          <h3 className="font-display text-sm font-bold leading-tight text-white">
            {step.title}
          </h3>
        </div>

        {/* Deadline tag */}
        {step.deadline && (
          <span className="inline-block bg-csub-gold/20 text-csub-gold-light text-xs font-bold rounded-full px-2 py-0.5 mb-1 font-body">
            {step.deadline}
          </span>
        )}

        {/* Description */}
        <p className="text-[11px] text-blue-100/80 leading-snug font-body hidden md:block">
          {step.tip || step.description}
        </p>

        {/* Completion indicator */}
        <div className="flex items-center gap-1.5 mt-2">
          <motion.div
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs
              ${completed
                ? 'bg-green-400 border-green-400 text-white'
                : 'border-white/40 text-transparent'
              }`}
            animate={completed ? { scale: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.3 }}
          >
            {completed ? '✓' : ''}
          </motion.div>
          <span className="text-[11px] font-body text-white/60">
            {completed ? 'Done!' : 'Click to complete'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
