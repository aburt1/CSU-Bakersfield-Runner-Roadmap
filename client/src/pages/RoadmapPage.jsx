import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../auth/AuthProvider';
import { useProgress } from '../hooks/useProgress';
import ProgressSummary from '../components/roadmap/ProgressSummary';
import CurrentStepCallout from '../components/roadmap/CurrentStepCallout';
import RoadmapTimeline from '../components/roadmap/RoadmapTimeline';
import StepDetailPanel from '../components/roadmap/StepDetailPanel';
import HelpSection from '../components/roadmap/HelpSection';
import CompletionBanner from '../components/roadmap/CompletionBanner';
import Celebration from '../components/Celebration';

export default function RoadmapPage() {
  const { user, logout } = useAuth();
  const {
    steps,
    completedDates,
    loading,
    error,
    totalSteps,
    completedCount,
    percentage,
    currentStep,
    allComplete,
    retry,
  } = useProgress();

  const [selectedStep, setSelectedStep] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationShown, setCelebrationShown] = useState(false);

  // Show celebration once when all complete
  useEffect(() => {
    if (allComplete && !celebrationShown) {
      setShowCelebration(true);
      setCelebrationShown(true);
    }
  }, [allComplete, celebrationShown]);

  // Scroll to top when step detail closes
  const mainRef = useRef(null);

  const firstName = user?.displayName?.split(' ')[0] || 'Student';

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-csub-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-csub-blue font-display text-lg font-semibold uppercase tracking-wider">
            Loading your roadmap...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && steps.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
            </svg>
          </div>
          <h2 className="font-display text-xl font-bold text-csub-blue-dark uppercase tracking-wide mb-2">
            Something went wrong
          </h2>
          <p className="font-body text-csub-gray mb-6">{error}</p>
          <button
            onClick={retry}
            className="bg-csub-blue hover:bg-csub-blue-dark text-white font-display font-bold uppercase tracking-wider px-6 py-3 rounded-lg shadow transition-colors text-sm"
          >
            Try Again
          </button>
          <p className="font-body text-sm text-csub-gray mt-4">
            If this keeps happening, contact{' '}
            <a href="mailto:admissions@csub.edu" className="text-csub-blue underline">admissions@csub.edu</a>
          </p>
        </div>
      </div>
    );
  }

  // Empty state
  if (steps.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="font-display text-xl font-bold text-csub-blue-dark uppercase tracking-wide mb-2">
            No Checklist Available
          </h2>
          <p className="font-body text-csub-gray mb-6">
            Your admissions checklist hasn't been set up yet. This usually means your application is still being processed.
          </p>
          <p className="font-body text-sm text-csub-gray">
            Questions? Contact{' '}
            <a href="mailto:admissions@csub.edu" className="text-csub-blue underline">admissions@csub.edu</a>{' '}
            or call <a href="tel:6616542160" className="text-csub-blue underline">(661) 654-2160</a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" ref={mainRef}>
      {/* ===== A. Page Header ===== */}
      <header className="bg-csub-blue-dark text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-body text-csub-gold text-sm font-semibold tracking-wide mb-1">
                Fall 2026 Admissions
              </p>
              <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold uppercase tracking-wide">
                Welcome, {firstName}
              </h1>
              <p className="font-body text-white/70 text-sm mt-1">
                Your step-by-step guide to becoming a Roadrunner
              </p>
            </div>
            <button
              onClick={logout}
              className="font-body text-sm text-white/60 hover:text-white transition-colors flex-shrink-0 mt-1"
              aria-label="Sign out"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ===== B. Progress Summary (sticky) ===== */}
      <ProgressSummary
        completedCount={completedCount}
        totalSteps={totalSteps}
        percentage={percentage}
        currentStepTitle={currentStep?.title}
        allComplete={allComplete}
      />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
        {/* ===== F. Completion Banner ===== */}
        {allComplete && <CompletionBanner firstName={firstName} />}

        {/* ===== C. Current Step Callout ===== */}
        {currentStep && !allComplete && (
          <CurrentStepCallout
            step={currentStep}
            stepNumber={steps.findIndex((s) => s.id === currentStep.id) + 1}
            onViewDetails={() => setSelectedStep(currentStep)}
          />
        )}

        {/* ===== D. Roadmap Timeline ===== */}
        <RoadmapTimeline
          steps={steps}
          completedDates={completedDates}
          onSelectStep={setSelectedStep}
        />

        {/* ===== E. Help Section ===== */}
        <HelpSection />
      </main>

      {/* Step Detail Panel */}
      <AnimatePresence>
        {selectedStep && (
          <StepDetailPanel
            step={selectedStep}
            stepNumber={steps.findIndex((s) => s.id === selectedStep.id) + 1}
            totalSteps={totalSteps}
            completedAt={completedDates[selectedStep.id]}
            onClose={() => setSelectedStep(null)}
            onNavigate={(direction) => {
              const idx = steps.findIndex((s) => s.id === selectedStep.id);
              const next = direction === 'next' ? steps[idx + 1] : steps[idx - 1];
              if (next) setSelectedStep(next);
            }}
            hasPrev={steps.findIndex((s) => s.id === selectedStep.id) > 0}
            hasNext={steps.findIndex((s) => s.id === selectedStep.id) < steps.length - 1}
          />
        )}
      </AnimatePresence>

      {/* Celebration modal */}
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
