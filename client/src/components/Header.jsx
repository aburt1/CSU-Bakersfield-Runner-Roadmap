import { motion } from 'framer-motion';

export default function Header() {
  return (
    <motion.header
      initial={{ y: -60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 100, damping: 15 }}
      className="relative z-30 pt-6 pb-4 px-4 text-center"
    >
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          className="inline-block mb-2"
        >
          <span className="text-5xl">🐦</span>
        </motion.div>

        <h1 className="font-display text-3xl md:text-4xl font-bold text-csub-blue drop-shadow-sm">
          Road to Becoming a{' '}
          <span className="text-csub-gold drop-shadow-md">Roadrunner!</span>
        </h1>

        <p className="font-body text-csub-blue-dark/70 mt-2 text-base md:text-lg font-medium">
          Your admissions journey at CSU Bakersfield
        </p>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="h-1 w-32 mx-auto mt-3 rounded-full"
          style={{
            background: 'linear-gradient(90deg, #003594, #FFC72C, #003594)',
          }}
        />
      </div>
    </motion.header>
  );
}
