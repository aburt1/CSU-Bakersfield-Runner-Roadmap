import { useState, useEffect, useRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../auth/AuthProvider';
import { useProgress } from '../hooks/useProgress';
import ProgressSummary from '../components/roadmap/ProgressSummary';
import CurrentStepCallout from '../components/roadmap/CurrentStepCallout';
import RoadmapTimeline from '../components/roadmap/RoadmapTimeline';
import ListView from '../components/roadmap/ListView';
import StepDetailPanel from '../components/roadmap/StepDetailPanel';
import HelpSection from '../components/roadmap/HelpSection';
import CompletionBanner from '../components/roadmap/CompletionBanner';
import Celebration from '../components/Celebration';
import HighContrastToggle from '../components/HighContrastToggle';

export default function RoadmapPage() {
  const { user, token, logout } = useAuth();
  const {
    steps,
    requiredSteps,
    optionalSteps,
    completedDates,
    loading,
    error,
    totalSteps,
    completedCount,
    percentage,
    currentStep,
    allComplete,
    optionalTotalSteps,
    optionalCompletedCount,
    term,
    retry,
  } = useProgress();

  const [selectedStep, setSelectedStep] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationShown, setCelebrationShown] = useState(false);
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' | 'list'
  const [showOnlyIncomplete, setShowOnlyIncomplete] = useState(false);
  const [updatingOptionalStepId, setUpdatingOptionalStepId] = useState(null);

  // API check polling — trigger background checks and poll for results
  useEffect(() => {
    if (loading || !token || steps.length === 0) return;

    let intervalId = null;
    let stopped = false;

    fetch('/api/roadmap/run-api-checks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (stopped || data.status !== 'started') return;

        const startTime = Date.now();
        intervalId = setInterval(async () => {
          if (Date.now() - startTime > 30000) {
            clearInterval(intervalId);
            return;
          }
          try {
            const res = await fetch('/api/roadmap/check-status', {
              headers: { Authorization: `Bearer ${token}` },
            });
            const poll = await res.json();
            if (poll.checkedSteps?.length > 0) retry();
            if (poll.status === 'complete') clearInterval(intervalId);
          } catch {
            clearInterval(intervalId);
          }
        }, 2000);
      })
      .catch(() => {});

    return () => {
      stopped = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [loading, token, steps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show celebration once when all complete
  useEffect(() => {
    if (allComplete && !celebrationShown) {
      setShowCelebration(true);
      setCelebrationShown(true);
    }
  }, [allComplete, celebrationShown]);

  const mainRef = useRef(null);
  const firstName = user?.displayName?.split(' ')[0] || 'Student';

  // Filter steps
  const filteredRequiredSteps = useMemo(() => {
    if (!showOnlyIncomplete) return requiredSteps;
    return requiredSteps.filter((s) => s.status !== 'completed' && s.status !== 'waived');
  }, [requiredSteps, showOnlyIncomplete]);

  const filteredOptionalSteps = useMemo(() => {
    if (!showOnlyIncomplete) return optionalSteps;
    return optionalSteps.filter((s) => s.status !== 'completed' && s.status !== 'waived');
  }, [optionalSteps, showOnlyIncomplete]);

  const selectedStepList = useMemo(() => {
    if (!selectedStep) return [];
    return selectedStep.is_optional === 1 ? filteredOptionalSteps : filteredRequiredSteps;
  }, [selectedStep, filteredOptionalSteps, filteredRequiredSteps]);

  const handleOptionalStepStatusChange = async (step, status) => {
    setUpdatingOptionalStepId(step.id);
    try {
      const res = await fetch(`/api/steps/${step.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        throw new Error('Unable to update optional step');
      }

      await retry();
      if (showOnlyIncomplete && status === 'completed') {
        setSelectedStep(null);
      } else {
        setSelectedStep((prev) => (
          prev && prev.id === step.id
            ? {
                ...prev,
                status: status === 'completed' ? 'completed' : 'not_started',
              }
            : prev
        ));
      }
    } catch {
      // ignore for now
    } finally {
      setUpdatingOptionalStepId(null);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" role="status" aria-label="Loading your roadmap">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-csub-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" aria-hidden="true" />
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
                {term?.name || 'Admissions'}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold uppercase tracking-wide">
                Welcome, {firstName}
              </h1>
              <p className="font-body text-white/70 text-sm mt-1">
                Your step-by-step guide to becoming a Roadrunner
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0 mt-1">
              <HighContrastToggle />
              <span className="text-white/30">·</span>
              <button
                onClick={logout}
                className="font-body text-sm text-white/60 hover:text-white transition-colors"
                aria-label="Sign out"
              >
                Sign out
              </button>
            </div>
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
        optionalCompletedCount={optionalCompletedCount}
        optionalTotalSteps={optionalTotalSteps}
      />

      <main id="main-content" className="max-w-4xl mx-auto px-4 sm:px-6 pb-16">
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

        {/* ===== View Controls ===== */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wider">
              Your Roadmap
            </h2>
            <div className="flex-1 h-px bg-gray-200 hidden sm:block" style={{ minWidth: '2rem' }} />
          </div>

          <div className="flex items-center gap-3">
            {/* Filter */}
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showOnlyIncomplete}
                onChange={(e) => setShowOnlyIncomplete(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-csub-blue focus:ring-csub-blue"
              />
              <span className="font-body text-xs text-csub-gray">Incomplete only</span>
            </label>

            {/* View toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('timeline')}
                className={`p-2.5 rounded-md transition-colors ${
                  viewMode === 'timeline' ? 'bg-white shadow-sm text-csub-blue' : 'text-gray-400 hover:text-gray-600'
                }`}
                aria-label="Timeline view"
                title="Timeline view"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  <circle cx="4" cy="6" r="1" fill="currentColor" />
                  <circle cx="4" cy="12" r="1" fill="currentColor" />
                  <circle cx="4" cy="18" r="1" fill="currentColor" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2.5 rounded-md transition-colors ${
                  viewMode === 'list' ? 'bg-white shadow-sm text-csub-blue' : 'text-gray-400 hover:text-gray-600'
                }`}
                aria-label="List view"
                title="List view"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* ===== D. Roadmap View ===== */}
        {viewMode === 'timeline' ? (
          <RoadmapTimeline
            steps={filteredRequiredSteps}
            completedDates={completedDates}
            onSelectStep={setSelectedStep}
          />
        ) : (
          <ListView
            steps={filteredRequiredSteps}
            completedDates={completedDates}
            onSelectStep={setSelectedStep}
          />
        )}

        {optionalTotalSteps > 0 && (
          <section className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wider">
                  Optional Opportunities
                </h2>
                <div className="flex-1 h-px bg-gray-200 hidden sm:block" style={{ minWidth: '2rem' }} />
              </div>
              <span className="font-body text-xs text-csub-gray">
                {optionalCompletedCount} of {optionalTotalSteps} completed
              </span>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 mb-4">
              <p className="font-body text-sm text-csub-gray">
                These steps are optional, but you can mark them complete here to keep track of your progress.
              </p>
            </div>

            {viewMode === 'timeline' ? (
              <RoadmapTimeline
                steps={filteredOptionalSteps}
                completedDates={completedDates}
                onSelectStep={setSelectedStep}
              />
            ) : (
              <ListView
                steps={filteredOptionalSteps}
                completedDates={completedDates}
                onSelectStep={setSelectedStep}
              />
            )}
          </section>
        )}

        {/* Filtered empty state */}
        {showOnlyIncomplete && filteredRequiredSteps.length === 0 && filteredOptionalSteps.length === 0 && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🎉</div>
            <p className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide">
              All caught up!
            </p>
            <p className="font-body text-sm text-csub-gray mt-1">
              No incomplete steps remaining.
            </p>
          </div>
        )}

        {/* ===== E. Help Section ===== */}
        <HelpSection />
      </main>

      {/* Step Detail Panel */}
      <AnimatePresence>
        {selectedStep && (
          <StepDetailPanel
            step={selectedStep}
            stepNumber={selectedStepList.findIndex((s) => s.id === selectedStep.id) + 1}
            totalSteps={selectedStepList.length}
            completedAt={completedDates[selectedStep.id]}
            onClose={() => setSelectedStep(null)}
            onNavigate={(direction) => {
              const idx = selectedStepList.findIndex((s) => s.id === selectedStep.id);
              const next = direction === 'next' ? selectedStepList[idx + 1] : selectedStepList[idx - 1];
              if (next) setSelectedStep(next);
            }}
            hasPrev={selectedStepList.findIndex((s) => s.id === selectedStep.id) > 0}
            hasNext={selectedStepList.findIndex((s) => s.id === selectedStep.id) < selectedStepList.length - 1}
            onOptionalStepStatusChange={selectedStep.is_optional === 1 ? (status) => handleOptionalStepStatusChange(selectedStep, status) : null}
            updatingOptionalStep={updatingOptionalStepId === selectedStep.id}
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
