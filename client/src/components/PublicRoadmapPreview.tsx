import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import TimelineStep from './roadmap/TimelineStep.jsx';
import StepDetailPanel from './roadmap/StepDetailPanel.jsx';
import HelpSection from './roadmap/HelpSection.jsx';
import { useAuth } from '../auth/AuthProvider.jsx';
import type { Step, StepWithStatus } from '../types/api.js';

interface Props {
  onLogin: (name: string, email: string) => Promise<void>;
}

export default function PublicRoadmapPreview({ onLogin }: Props): React.ReactElement {
  const { ssoLogin, ssoLoading, ssoError, isAzureAdConfigured } = useAuth();
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<boolean>(false);
  const [loginName, setLoginName] = useState<string>('');
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [loggingIn, setLoggingIn] = useState<boolean>(false);
  const [selectedStep, setSelectedStep] = useState<Step | null>(null);

  useEffect(() => {
    fetch('/api/steps')
      .then((r) => r.json())
      .then((data: Step[]) => {
        setSteps(data.sort((a, b) => a.sort_order - b.sort_order));
      })
      .catch(() => {
        setFetchError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const publicSteps = steps.filter((s) => s.is_public === 1);
  const lockedSteps = steps.filter((s) => s.is_public !== 1);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50" role="status" aria-label="Loading">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-csub-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" aria-hidden="true" />
          <p className="text-csub-blue font-display text-lg font-semibold uppercase tracking-wider">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  const devLoginForm = (
    <form onSubmit={handleLogin} className="flex flex-wrap items-end gap-3" aria-describedby={loginError ? 'login-error' : undefined}>
      <div className="flex-1 min-w-[120px]">
        <label htmlFor="login-name" className="block font-body text-xs font-semibold text-csub-blue-dark/70 mb-1">Name</label>
        <input
          id="login-name"
          type="text"
          required
          value={loginName}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLoginName(e.target.value)}
          placeholder="Jane Doe"
          className="w-full px-3 py-3 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
        />
      </div>
      <div className="flex-1 min-w-[160px]">
        <label htmlFor="login-email" className="block font-body text-xs font-semibold text-csub-blue-dark/70 mb-1">Email</label>
        <input
          id="login-email"
          type="email"
          required
          value={loginEmail}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLoginEmail(e.target.value)}
          placeholder="jdoe@csub.edu"
          className="w-full px-3 py-3 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
        />
      </div>
      <button
        type="submit"
        disabled={loggingIn}
        className="px-5 py-3 bg-csub-blue hover:bg-csub-blue-dark text-white rounded-lg font-body text-sm font-semibold transition-colors duration-200 disabled:opacity-50 whitespace-nowrap"
      >
        {loggingIn ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  );

  const showDevLogin = import.meta.env.VITE_ALLOW_DEV_LOGIN !== 'false';

  const loginForm = (
    <div className="p-5 sm:p-6 bg-white rounded-xl border-2 border-csub-blue/20 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <svg className="w-5 h-5 text-csub-blue flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
        <p className="font-display text-sm font-bold uppercase tracking-wider text-csub-blue-dark">
          {isAzureAdConfigured
            ? 'Sign in to track your progress'
            : 'Activated your account? Sign in below'}
        </p>
      </div>
      <p className="font-body text-xs text-csub-gray mb-4">
        Once you've completed the steps above, sign in to unlock your full admissions checklist.
      </p>

      {/* SSO Button — only when Azure AD is configured */}
      {isAzureAdConfigured && (
        <>
          <button
            type="button"
            onClick={ssoLogin}
            disabled={ssoLoading}
            className="w-full px-5 py-3 bg-csub-blue hover:bg-csub-blue-dark text-white rounded-lg font-body text-sm font-bold transition-colors duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {ssoLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" aria-hidden="true" />
                Signing in...
              </>
            ) : (
              'Sign in with CSUB Account'
            )}
          </button>
          {ssoError && (
            <p role="alert" className="text-red-600 text-sm font-body mt-2">{ssoError}</p>
          )}
        </>
      )}

      {/* Divider — shown when both SSO and dev login are visible */}
      {isAzureAdConfigured && showDevLogin && (
        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs font-body text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
      )}

      {/* Dev login form */}
      {showDevLogin && (
        <>
          {devLoginForm}
          {loginError && (
            <p id="login-error" role="alert" className="text-red-600 text-sm font-body mt-2">{loginError}</p>
          )}
        </>
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
            Welcome, Future Roadrunner!
          </p>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold uppercase tracking-wide">
            Road to Becoming a{' '}
            <span className="text-csub-gold">Roadrunner</span>
          </h1>
          <p className="font-body text-white/70 text-sm sm:text-base mt-3 max-w-lg mx-auto">
            Complete the first steps below to activate your account, then sign in to track your full admissions journey.
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
            {/* Phase 1: Get Started */}
            <section className="mt-8" aria-label="Get started steps">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wider">
                  Get Started
                </h2>
                <span className="font-body text-xs font-semibold text-csub-blue bg-csub-blue/10 rounded-full px-2.5 py-0.5">
                  {publicSteps.length} {publicSteps.length === 1 ? 'step' : 'steps'}
                </span>
              </div>
              <p className="font-body text-sm text-csub-gray mb-4">
                Complete these steps to activate your CSUB account.
              </p>

              <ol className="relative" role="list">
                {/* Timeline spine */}
                <div
                  className="absolute left-5 sm:left-6 top-4 bottom-4 w-0.5 bg-csub-blue/20"
                  aria-hidden="true"
                />

                {/* Public steps — shown as preview */}
                {publicSteps.map((step, i) => (
                  <TimelineStep
                    key={step.id}
                    step={{ ...step, status: 'preview' } as StepWithStatus}
                    index={i}
                    isLast={i === publicSteps.length - 1}
                    onSelect={() => setSelectedStep(step)}
                  />
                ))}
              </ol>
            </section>

            {/* Phase 2: Sign-in milestone */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="my-6"
            >
              {loginForm}
            </motion.div>

            {/* Phase 3: What's ahead preview */}
            {lockedSteps.length > 0 && (
              <section aria-label="Upcoming steps preview">
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wider">
                    What's Ahead
                  </h2>
                  <span className="font-body text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2.5 py-0.5">
                    {lockedSteps.length} more {lockedSteps.length === 1 ? 'step' : 'steps'}
                  </span>
                </div>
                <p className="font-body text-sm text-csub-gray mb-4">
                  Sign in to unlock these steps and track your progress.
                </p>

                <div className="relative">
                  <ol className="relative" role="list">
                    <div
                      className="absolute left-5 sm:left-6 top-4 bottom-4 w-0.5 bg-gray-200"
                      aria-hidden="true"
                    />
                    {lockedSteps.map((step, i) => (
                      <TimelineStep
                        key={step.id}
                        step={{ ...step, status: 'locked' } as StepWithStatus}
                        index={publicSteps.length + i}
                        isLast={i === lockedSteps.length - 1}
                        onSelect={() => {}}
                        compact
                      />
                    ))}
                  </ol>
                  {/* Fade-out gradient */}
                  <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none" />
                </div>
              </section>
            )}
          </>
        )}

        {/* Help footer — same as authenticated roadmap */}
        <HelpSection />
      </main>

      {/* Step Detail Panel — public steps only */}
      <AnimatePresence>
        {selectedStep && (
          <StepDetailPanel
            step={{ ...selectedStep, status: 'preview' } as StepWithStatus}
            stepNumber={publicSteps.findIndex((s) => s.id === selectedStep.id) + 1}
            totalSteps={publicSteps.length}
            onClose={() => setSelectedStep(null)}
            onNavigate={(direction) => {
              const idx = publicSteps.findIndex((s) => s.id === selectedStep.id);
              const next = direction === 'next' ? publicSteps[idx + 1] : publicSteps[idx - 1];
              if (next) setSelectedStep(next);
            }}
            hasPrev={publicSteps.findIndex((s) => s.id === selectedStep.id) > 0}
            hasNext={publicSteps.findIndex((s) => s.id === selectedStep.id) < publicSteps.length - 1}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
