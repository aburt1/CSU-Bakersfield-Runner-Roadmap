import { motion } from 'framer-motion';

export default function Header() {
  return (
    <>
      {/* Top blue bar — matches csub.edu nav */}
      <div className="bg-csub-blue text-white">
        <div className="max-w-5xl mx-auto px-4 py-2 flex items-center justify-between text-sm font-body">
          <span className="font-semibold tracking-wide">CSU Bakersfield</span>
          <div className="flex gap-4 text-white/80">
            <a href="https://www.csub.edu/admissions" className="hover:text-csub-gold transition-colors">Admissions</a>
            <a href="https://www.csub.edu" className="hover:text-csub-gold transition-colors">csub.edu</a>
          </div>
        </div>
      </div>

      {/* Gold accent line */}
      <div className="h-1 bg-csub-gold" />

      {/* Page header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white pt-10 pb-8 px-4 text-center border-b border-gray-100"
      >
        <div className="max-w-2xl mx-auto">
          <h1 className="font-display text-4xl md:text-5xl font-bold text-csub-blue-dark uppercase tracking-wide">
            Road to Becoming a{' '}
            <span className="text-csub-gold">Roadrunner</span>
          </h1>
          <p className="font-body text-csub-gray mt-3 text-base md:text-lg">
            Your step-by-step admissions checklist at CSU Bakersfield
          </p>
        </div>
      </motion.header>
    </>
  );
}
