import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import TimelineStep from './roadmap/TimelineStep';

export default function PublicRoadmapPreview({ onLogin }) {
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
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
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const publicSteps = steps.filter((s) => s.is_public === 1);
  const lockedSteps = steps.filter((s) => s.is_public !== 1).slice(0, 4);

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
        {/* Public Steps Section */}
        {publicSteps.length > 0 && (
          <section className="mt-8">
            <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wider mb-4">
              Get Started
            </h2>
            <ol className="relative" role="list">
              {/* Timeline spine */}
              <div
                className="absolute left-5 sm:left-6 top-4 bottom-4 w-0.5 bg-gray-200"
                aria-hidden="true"
              />
              {publicSteps.map((step, i) => (
                <TimelineStep
                  key={step.id}
                  step={{ ...step, status: 'not_started' }}
                  index={i}
                  isLast={i === publicSteps.length - 1 && lockedSteps.length === 0}
                  onSelect={() => {}}
                />
              ))}
            </ol>
          </section>
        )}

        {/* Login CTA */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="my-8"
        >
          <div className="bg-white rounded-2xl border-2 border-csub-blue/20 shadow-lg p-6 sm:p-8">
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-csub-blue/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-csub-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="font-display text-xl font-bold text-csub-blue-dark uppercase tracking-wide">
                Activated Your Account?
              </h2>
              <p className="font-body text-csub-gray text-sm mt-1">
                Sign in to track your progress and see all remaining steps.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4 max-w-sm mx-auto">
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
                disabled={loggingIn}
                className="w-full bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold text-lg uppercase tracking-wider px-8 py-4 rounded-lg shadow-lg transition-colors duration-200 disabled:opacity-50"
              >
                {loggingIn ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </div>
        </motion.section>

        {/* Locked Steps Teaser */}
        {lockedSteps.length > 0 && (
          <section className="relative">
            <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wider mb-4">
              What's Next
            </h2>
            <ol className="relative" role="list">
              {/* Timeline spine */}
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
          </section>
        )}

        {/* Help footer */}
        <div className="text-center mt-12">
          <p className="font-body text-sm text-csub-gray">
            Questions? Contact{' '}
            <a href="mailto:admissions@csub.edu" className="text-csub-blue underline">admissions@csub.edu</a>{' '}
            or call <a href="tel:6616542160" className="text-csub-blue underline">(661) 654-2160</a>
          </p>
        </div>
      </main>
    </div>
  );
}
