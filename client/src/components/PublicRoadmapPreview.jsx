import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import TimelineStep from './roadmap/TimelineStep';
import HelpSection from './roadmap/HelpSection';

export default function PublicRoadmapPreview({ onLogin }) {
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    fetch('/api/steps')
      .then((r) => r.json())
      .then((data) => {
        setSteps(data.sort((a, b) => a.sort_order - b.sort_order));
      })
      .catch(() => {
        setFetchError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const publicSteps = steps.filter((s) => s.is_public === 1);
  const lockedSteps = steps.filter((s) => s.is_public !== 1);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoggingIn(true);
    try {
      await onLogin(loginName, loginEmail);
    } catch {
      setLoginError('Login failed. Make sure the server is running.');
    } finally {
      setLoggingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-csub-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-csub-blue font-display text-lg font-semibold uppercase tracking-wider">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  // Compact inline login form (reused in multiple places)
  const loginForm = (
    <div className="ml-12 sm:ml-14 my-4 p-4 bg-csub-blue/5 rounded-xl border border-csub-blue/10">
      <p className="font-body text-sm font-semibold text-csub-blue-dark mb-3">
        Activated your CSUB account? Sign in to track your progress.
      </p>
      <form onSubmit={handleLogin} className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[120px]">
          <label className="block font-body text-xs font-semibold text-csub-blue-dark/70 mb-1">Name</label>
          <input
            type="text"
            required
            value={loginName}
            onChange={(e) => setLoginName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block font-body text-xs font-semibold text-csub-blue-dark/70 mb-1">Email</label>
          <input
            type="email"
            required
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            placeholder="jdoe@csub.edu"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={loggingIn}
          className="px-5 py-2 bg-csub-blue hover:bg-csub-blue-dark text-white rounded-lg font-body text-sm font-semibold transition-colors duration-200 disabled:opacity-50 whitespace-nowrap"
        >
          {loggingIn ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
      {loginError && (
        <p className="text-red-600 text-sm font-body mt-2">{loginError}</p>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Skip link */}
      <a href="#public-steps" className="skip-link">Skip to steps</a>

      {/* Header */}
      <header className="bg-csub-blue-dark text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10 text-center">
          <p className="font-body text-csub-gold text-sm font-semibold tracking-wide mb-2">
            Admissions Checklist
          </p>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-wide">
            Road to Becoming a{' '}
            <span className="text-csub-gold">Roadrunner</span>
          </h1>
          <p className="font-body text-white/70 text-sm sm:text-base mt-3 max-w-lg mx-auto">
            Follow these steps to complete your admissions journey at CSUB. Start with the first steps below.
          </p>
        </div>
      </header>

      <main id="public-steps" className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
        {/* Error/empty state */}
        {fetchError || steps.length === 0 ? (
          <section className="mt-8">
            <div className="text-center py-8">
              <p className="font-body text-csub-gray text-sm">
                {fetchError
                  ? "We couldn't load the admissions checklist right now. Please check back soon."
                  : 'No steps available yet. Check back soon!'}
              </p>
            </div>
            {loginForm}
          </section>
        ) : (
          <>
            {/* Continuous timeline */}
            <section className="mt-8">
              <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wider mb-4">
                Your Admissions Steps
              </h2>

              <ol className="relative" role="list">
                {/* Timeline spine */}
                <div
                  className="absolute left-5 sm:left-6 top-4 bottom-4 w-0.5 bg-gray-200"
                  aria-hidden="true"
                />

                {/* Public steps — shown as not_started */}
                {publicSteps.map((step, i) => (
                  <TimelineStep
                    key={step.id}
                    step={{ ...step, status: 'preview' }}
                    index={i}
                    isLast={false}
                    onSelect={() => {}}
                  />
                ))}
              </ol>

              {/* Inline login bar — between public and locked */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              >
                {loginForm}
              </motion.div>

              {/* Locked steps — shown as locked with fade */}
              {lockedSteps.length > 0 && (
                <div className="relative">
                  <ol className="relative" role="list">
                    <div
                      className="absolute left-5 sm:left-6 top-4 bottom-4 w-0.5 bg-gray-200"
                      aria-hidden="true"
                    />
                    {lockedSteps.map((step, i) => (
                      <TimelineStep
                        key={step.id}
                        step={{ ...step, status: 'locked' }}
                        index={publicSteps.length + i}
                        isLast={i === lockedSteps.length - 1}
                        onSelect={() => {}}
                      />
                    ))}
                  </ol>
                  {/* Fade-out gradient */}
                  <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none" />
                </div>
              )}
            </section>
          </>
        )}

        {/* Help footer — same as authenticated roadmap */}
        <HelpSection />
      </main>
    </div>
  );
}
