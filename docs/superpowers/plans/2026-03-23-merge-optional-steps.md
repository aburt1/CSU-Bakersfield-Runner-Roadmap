# Merge Optional Steps Into Single Roadmap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the separate "Optional Opportunities" section and interleave optional steps inline with required steps in one unified roadmap.

**Architecture:** Replace the split-and-derive approach in `useProgress.js` with a single-pass algorithm that assigns statuses to all steps in sort order. Update `RoadmapPage.jsx` to use one merged list and remove the optional section. Clean up `ProgressSummary.jsx` to drop optional-specific props.

**Tech Stack:** React, Vite (HMR)

**Spec:** `docs/superpowers/specs/2026-03-23-merge-optional-steps-design.md`

---

### Task 1: Rewrite useProgress hook to produce a single merged list

**Files:**
- Modify: `client/src/hooks/useProgress.js`

- [ ] **Step 1: Replace the useMemo block and status derivation**

Replace lines 35-61 (both `deriveStepStatuses` and `deriveOptionalStepStatuses`) and lines 142-163 with the single-pass merge algorithm. The new `useMemo` produces one `allSteps` array with correct statuses for both required and optional steps.

```js
// Replace lines 35-61 with:
/**
 * Single-pass status derivation for all steps (required + optional merged).
 * Required steps follow progression: first incomplete = in_progress, rest = not_started.
 * Optional steps skip progression: completed/waived from progress, otherwise not_started.
 */
function deriveAllStepStatuses(steps, progressMap) {
  let foundCurrent = false;
  return steps.map((step) => {
    const progress = progressMap.get(step.id);

    if (step.is_optional === 1) {
      // Optional: no progression, just completed/waived/not_started
      if (progress) return { ...step, status: progress.status || 'completed' };
      return { ...step, status: 'not_started' };
    }

    // Required: progression chain
    if (progress) return { ...step, status: progress.status || 'completed' };
    if (!foundCurrent) {
      foundCurrent = true;
      return { ...step, status: 'in_progress' };
    }
    return { ...step, status: 'not_started' };
  });
}
```

- [ ] **Step 2: Update the useMemo block**

Replace lines 142-155 with:

```js
  const allSteps = useMemo(() => {
    const applicable = steps.filter((step) => stepApplies(step, studentTags));
    return deriveAllStepStatuses(applicable, progressMap);
  }, [steps, studentTags, progressMap]);
```

- [ ] **Step 3: Update derived counts and return value**

Replace lines 157-183 with:

```js
  const requiredOnly = allSteps.filter((s) => s.is_optional !== 1);
  const totalSteps = requiredOnly.length;
  const doneCount = requiredOnly.filter((s) => s.status === 'completed' || s.status === 'waived').length;
  const percentage = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;
  const currentStep = requiredOnly.find((s) => s.status === 'in_progress') || null;
  const allComplete = totalSteps > 0 && doneCount === totalSteps;

  return {
    steps: allSteps,
    completedDates,
    studentTags,
    term,
    loading,
    error,
    totalSteps,
    completedCount: doneCount,
    percentage,
    currentStep,
    allComplete,
    retry: fetchProgress,
  };
```

- [ ] **Step 4: Verify the app still compiles**

Run: Check dev server for build errors (Vite HMR will report in browser console).
Expected: No build errors. The page may have runtime issues until Task 2 is done.

- [ ] **Step 5: Commit**

```bash
git add client/src/hooks/useProgress.js
git commit -m "refactor: merge optional and required steps into single list in useProgress"
```

---

### Task 2: Update RoadmapPage to use single merged list

**Files:**
- Modify: `client/src/pages/RoadmapPage.jsx`

- [ ] **Step 1: Update destructured imports from useProgress**

Replace lines 17-33:

```jsx
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
    term,
    retry,
  } = useProgress();
```

- [ ] **Step 2: Replace filter memos with single filteredSteps**

Replace lines 95-108 with:

```jsx
  const filteredSteps = useMemo(() => {
    if (!showOnlyIncomplete) return steps;
    return steps.filter((s) => s.status !== 'completed' && s.status !== 'waived');
  }, [steps, showOnlyIncomplete]);

  const selectedStepList = useMemo(() => {
    if (!selectedStep) return [];
    return filteredSteps;
  }, [selectedStep, filteredSteps]);
```

- [ ] **Step 3: Remove optional props from ProgressSummary call**

Replace lines 244-252 with:

```jsx
      <ProgressSummary
        completedCount={completedCount}
        totalSteps={totalSteps}
        percentage={percentage}
        currentStepTitle={currentStep?.title}
        allComplete={allComplete}
      />
```

- [ ] **Step 4: Update roadmap view to use filteredSteps**

Replace lines 322-334 (the required steps view) with:

```jsx
        {viewMode === 'timeline' ? (
          <RoadmapTimeline
            steps={filteredSteps}
            completedDates={completedDates}
            onSelectStep={setSelectedStep}
          />
        ) : (
          <ListView
            steps={filteredSteps}
            completedDates={completedDates}
            onSelectStep={setSelectedStep}
          />
        )}
```

- [ ] **Step 5: Remove the Optional Opportunities section**

Delete lines 336-370 (the entire `{optionalTotalSteps > 0 && (` block).

- [ ] **Step 6: Update the filtered empty state check**

Replace line 373:

```jsx
        {showOnlyIncomplete && filteredSteps.length === 0 && (
```

- [ ] **Step 7: Verify the app compiles and renders**

Check dev server — no build errors. The roadmap should render with all steps in one list.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/RoadmapPage.jsx
git commit -m "feat: merge optional steps into single roadmap view"
```

---

### Task 3: Clean up ProgressSummary

**Files:**
- Modify: `client/src/components/roadmap/ProgressSummary.jsx`

- [ ] **Step 1: Remove optional props and display block**

Remove `optionalCompletedCount` and `optionalTotalSteps` from the props destructure (lines 9-10). Remove the optional counter block (lines 60-64).

New file content:

```jsx
import { motion } from 'framer-motion';

export default function ProgressSummary({
  completedCount,
  totalSteps,
  percentage,
  currentStepTitle,
  allComplete,
}) {
  return (
    <div className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
        {/* Progress text */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wider">
              Your Progress
            </span>
            <span
              className="font-body text-xs font-semibold text-white bg-csub-blue rounded-full px-2.5 py-0.5"
              aria-label={`${percentage} percent complete`}
            >
              {percentage}%
            </span>
          </div>
          <span className="font-body text-sm text-csub-gray">
            <span className="font-semibold text-csub-blue-dark">{completedCount}</span> of {totalSteps} steps
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100} aria-label={`${completedCount} of ${totalSteps} steps completed`}>
          <motion.div
            className="h-full rounded-full"
            style={{
              background: allComplete
                ? 'linear-gradient(90deg, #003594, #FFC72C)'
                : 'linear-gradient(90deg, #003594, #0052CC)',
            }}
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>

        {/* Current step hint */}
        <div aria-live="polite" aria-atomic="true">
          {currentStepTitle && !allComplete && (
            <p className="font-body text-xs text-csub-gray mt-1.5">
              Next up: <span className="font-semibold text-csub-blue-dark">{currentStepTitle}</span>
            </p>
          )}
          {allComplete && (
            <p className="font-body text-xs text-csub-blue font-semibold mt-1.5">
              All steps completed — you're all set!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify no build errors**

Check dev server — clean compilation, no console errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/roadmap/ProgressSummary.jsx
git commit -m "refactor: remove optional step props from ProgressSummary"
```

---

### Task 4: End-to-end verification

- [ ] **Step 1: Visual check — single unified list**

Load student roadmap. Verify one continuous list with optional steps interleaved by sort order. No separate "Optional Opportunities" section.

- [ ] **Step 2: Verify optional badge**

Optional steps should display the blue "Optional" pill badge.

- [ ] **Step 3: Verify progress bar counts required only**

Progress bar percentage and "X of Y steps" should reflect required steps only.

- [ ] **Step 4: Verify progression skips optional steps**

The "in progress" marker should be on the first incomplete required step, not on any optional step.

- [ ] **Step 5: Verify detail panel navigation**

Click a step, use prev/next arrows. Navigation should traverse all steps (required + optional) in order.

- [ ] **Step 6: Verify optional step toggle**

Open an optional step's detail panel. The mark-complete button should work. Completing it should not change the progress percentage.

- [ ] **Step 7: Verify incomplete filter**

Toggle "Incomplete only" checkbox. Both required and optional completed steps should be hidden. When all are filtered, "All caught up!" message appears.
