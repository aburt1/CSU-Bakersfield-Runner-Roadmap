import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ProgressBar from './components/ProgressBar';
import Celebration from './components/Celebration';
import StepCard from './components/StepCard';
import StepDetail from './components/StepDetail';
import { useProgress } from './hooks/useProgress';
import { useAuth } from './auth/AuthProvider';

// Check if a step applies to a student based on tags
function stepApplies(step, studentTags) {
  const requiredTags = step.required_tags
    ? (typeof step.required_tags === 'string' ? JSON.parse(step.required_tags) : step.required_tags)
    : null;

  // No required tags = applies to everyone
  if (!requiredTags || requiredTags.length === 0) return true;

  // Student must have at least one of the required tags
  return requiredTags.some((tag) => studentTags.includes(tag));
}

export default function App() {
  const { user, loading: authLoading, devLogin, isAuthenticated } = useAuth();
  const { steps, completedSteps, studentTags, loading: progressLoading } = useProgress();
  const [showCelebration, setShowCelebration] = useState(false);
  const [detailStep, setDetailStep] = useState(null);
  const [loginName, setLoginName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginError, setLoginError] = useState('');

  // Filter steps based on student tags
  const applicableSteps = useMemo(
    () => steps.filter((step) => stepApplies(step, studentTags)),
    [steps, studentTags]
  );

  const totalSteps = applicableSteps.length;
  const completedCount = applicableSteps.filter((s) => completedSteps.has(s.id)).length;

  useEffect(() => {
    if (completedCount === totalSteps && totalSteps > 0) {
      setShowCelebration(true);
    }
  }, [completedCount, totalSteps]);

  // Loading state
  if (authLoading || (isAuthenticated && progressLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-csub-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-csub-blue font-display text-lg font-semibold uppercase tracking-wider">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // Auth gate
  if (!isAuthenticated) {
    const handleLogin = async (e) => {
      e.preventDefault();
      setLoginError('');
      try {
        await devLogin(loginName, loginEmail);
      } catch {
        setLoginError('Login failed. Make sure the server is running.');
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto px-6">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-csub-blue-dark uppercase tracking-wide mb-4">
            Road to Becoming a{' '}
            <span className="text-csub-gold">Roadrunner</span>
          </h1>
          <p className="font-body text-csub-gray mb-6 text-base">
            Sign in to track your admissions progress.
          </p>
          <form onSubmit={handleLogin} className="space-y-4 text-left">
            <div>
              <label className="block font-body text-sm font-semibold text-csub-blue-dark mb-1">Name</label>
              <input
                type="text"
                required
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
              />
            </div>
            <div>
              <label className="block font-body text-sm font-semibold text-csub-blue-dark mb-1">Email</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="jdoe@csub.edu"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
              />
            </div>
            {loginError && (
              <p className="text-red-600 text-sm font-body">{loginError}</p>
            )}
            <button
              type="submit"
              className="w-full bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold text-lg uppercase tracking-wider px-8 py-4 rounded-lg shadow-lg transition-colors duration-200"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50">
      {/* Title + User info */}
      <div className="pt-10 pb-6 px-4 text-center">
        <h1 className="font-display text-4xl md:text-5xl font-bold text-csub-blue-dark uppercase tracking-wide">
          Road to Becoming a{' '}
          <span className="text-csub-gold">Roadrunner</span>
        </h1>
        <p className="font-body text-csub-gray mt-3 text-base md:text-lg">
          {user?.displayName ? `Welcome, ${user.displayName}!` : 'Your step-by-step admissions checklist at CSU Bakersfield'}
        </p>
      </div>

      <ProgressBar completed={completedCount} total={totalSteps} />

      {/* Timeline */}
      <main className="relative max-w-3xl mx-auto px-4 pt-10 pb-24">
        {/* Clean road spine */}
        <div
          className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-3 rounded-full"
          style={{ background: 'linear-gradient(180deg, #001A70, #003594)' }}
        />
        {/* Gold center dash */}
        <div
          className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-px rounded-full pointer-events-none"
          style={{
            backgroundImage: 'repeating-linear-gradient(to bottom, #FFC72C 0px, #FFC72C 8px, transparent 8px, transparent 20px)',
            opacity: 0.5,
          }}
        />

        <div role="list" aria-label="Admissions steps">
          {applicableSteps.map((step, i) => {
            const isLeft = i % 2 === 0;
            const isCompleted = completedSteps.has(step.id);

            return (
              <motion.div
                key={step.id}
                role="listitem"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.04 }}
                className="relative mb-12 last:mb-0"
              >
                {/* Node */}
                <div className="absolute left-1/2 top-6 -translate-x-1/2 z-10">
                  <motion.div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-display font-bold transition-all duration-300 ${
                      isCompleted
                        ? 'text-csub-blue-dark shadow-lg'
                        : 'text-csub-blue shadow-md'
                    }`}
                    animate={isCompleted ? { scale: [1, 1.15, 1] } : {}}
                    transition={{ duration: 0.3 }}
                    style={{
                      background: isCompleted
                        ? 'linear-gradient(145deg, #FFC72C, #e6a800)'
                        : '#ffffff',
                      border: isCompleted ? '3px solid #e6a800' : '3px solid #003594',
                    }}
                  >
                    {isCompleted ? '✓' : i + 1}
                  </motion.div>
                </div>

                {/* Connector */}
                <div
                  className={`absolute top-[1.85rem] h-px ${
                    isLeft ? 'right-[calc(50%+0.8rem)] w-6' : 'left-[calc(50%+0.8rem)] w-6'
                  } bg-csub-blue/20`}
                />

                {/* Card */}
                <div className={`flex ${isLeft ? 'justify-start pr-[calc(50%+2.5rem)]' : 'justify-end pl-[calc(50%+2.5rem)]'}`}>
                  <StepCard
                    step={step}
                    index={i}
                    completed={isCompleted}
                    side={isLeft ? 'left' : 'right'}
                    onClickDetail={setDetailStep}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* End marker */}
        <div className="relative z-10 flex justify-center mt-8">
          <div className="w-12 h-12 rounded-full bg-csub-blue-dark flex items-center justify-center shadow-lg border-3 border-csub-gold">
            <span className="text-xl">🏫</span>
          </div>
        </div>

        {completedCount === totalSteps && totalSteps > 0 && (
          <motion.div
            className="relative z-10 text-center mt-6"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200 }}
          >
            <div className="inline-block bg-csub-blue text-white font-display font-bold text-lg uppercase tracking-wider px-8 py-4 rounded-lg shadow-lg">
              Welcome to CSUB, Runner!
            </div>
          </motion.div>
        )}
      </main>

      {/* Step detail modal */}
      <AnimatePresence>
        {detailStep && (
          <StepDetail
            step={detailStep}
            completed={completedSteps.has(detailStep.id)}
            onClose={() => setDetailStep(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCelebration && (
          <div className="fixed inset-0 z-50">
            <Celebration onClose={() => setShowCelebration(false)} />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
