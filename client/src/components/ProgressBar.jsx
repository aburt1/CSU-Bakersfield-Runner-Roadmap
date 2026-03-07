import { motion } from 'framer-motion';

export default function ProgressBar({ completed, total }) {
  const percentage = total > 0 ? (completed / total) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-csub-blue/10 px-4 py-3"
    >
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="font-display text-sm font-bold text-csub-blue">
            Your Progress
          </span>
          <span className="font-body text-sm font-bold text-csub-blue">
            {completed}/{total} steps
            {completed === total && total > 0 && ' 🎉'}
          </span>
        </div>
        <div className="h-3 bg-csub-blue/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: 'linear-gradient(90deg, #003594, #FFC72C)',
            }}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      </div>
    </motion.div>
  );
}
