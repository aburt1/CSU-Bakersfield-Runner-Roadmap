import { motion } from 'framer-motion';

export default function ProgressBar({ completed, total }) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-3"
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-display text-sm font-semibold text-csub-blue-dark uppercase tracking-wider">
            Your Progress
          </span>
          <span className="font-body text-sm font-semibold text-csub-gray">
            {completed} of {total} complete
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-csub-blue"
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      </div>
    </motion.div>
  );
}
