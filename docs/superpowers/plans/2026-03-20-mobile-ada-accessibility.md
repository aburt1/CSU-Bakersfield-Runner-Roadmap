# Mobile & ADA Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all student-facing pages mobile-friendly and WCAG 2.1 AA compliant without changing the visual design.

**Architecture:** CSS-first approach for Tailwind/CSS animations, with `window.matchMedia('(prefers-reduced-motion: reduce)')` for JS-driven animations (Framer Motion, canvas-confetti). Manual focus traps in modals. Semantic HTML fixes for form labels and ARIA attributes.

**Tech Stack:** React, Tailwind CSS, Framer Motion, canvas-confetti, DOMPurify

**Spec:** `docs/superpowers/specs/2026-03-20-mobile-ada-accessibility-design.md`

---

### Task 1: Global CSS — Reduced Motion & Screen Reader Utility

**Files:**
- Modify: `client/src/index.css:84-90` (insert before print styles)

- [ ] **Step 1: Add `prefers-reduced-motion` rule and `.sr-only` class**

Insert before the `/* Print styles */` comment (line 84):

```css
/* Reduce motion for users with vestibular disorders.
   Uses 0.01ms (not 0s) so animationend events still fire. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* Screen-reader-only content (supplements Tailwind's sr-only for non-utility usage) */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

- [ ] **Step 2: Verify CSS parses correctly**

Run: `cd /Users/aburt1/Desktop/roadmap/CSUB-admissions/client && npx vite build --mode development 2>&1 | head -20`
Expected: No CSS parse errors

- [ ] **Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "feat(a11y): add prefers-reduced-motion rule and sr-only utility"
```

---

### Task 2: Loading Spinner Accessibility — App.jsx, RoadmapPage.jsx, PublicRoadmapPreview.jsx

**Files:**
- Modify: `client/src/App.jsx:11-13`
- Modify: `client/src/pages/RoadmapPage.jsx:108-110`
- Modify: `client/src/components/PublicRoadmapPreview.jsx:47-49`

- [ ] **Step 1: Add `role="status"` and sr-only label to App.jsx spinner**

In `App.jsx`, change the spinner container (line 11-16):

```jsx
<div className="min-h-screen flex items-center justify-center bg-white" role="status" aria-label="Loading">
  <div className="text-center">
    <div className="w-8 h-8 border-4 border-csub-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" aria-hidden="true" />
    <p className="text-csub-blue font-display text-lg font-semibold uppercase tracking-wider">
      Loading...
    </p>
  </div>
</div>
```

- [ ] **Step 2: Add `role="status"` to RoadmapPage.jsx spinner**

In `RoadmapPage.jsx`, change the spinner container (line 108):

```jsx
<div className="min-h-screen flex items-center justify-center bg-gray-50" role="status" aria-label="Loading your roadmap">
```

And add `aria-hidden="true"` to the spinner div (line 110):

```jsx
<div className="w-10 h-10 border-4 border-csub-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" aria-hidden="true" />
```

- [ ] **Step 3: Add `role="status"` to PublicRoadmapPreview.jsx spinner**

In `PublicRoadmapPreview.jsx`, change the spinner container (line 47):

```jsx
<div className="min-h-screen flex items-center justify-center bg-gray-50" role="status" aria-label="Loading">
```

And add `aria-hidden="true"` to the spinner div (line 49):

```jsx
<div className="w-10 h-10 border-4 border-csub-blue border-t-transparent rounded-full animate-spin mx-auto mb-4" aria-hidden="true" />
```

- [ ] **Step 4: Commit**

```bash
git add client/src/App.jsx client/src/pages/RoadmapPage.jsx client/src/components/PublicRoadmapPreview.jsx
git commit -m "feat(a11y): add role=status and aria-labels to loading spinners"
```

---

### Task 3: Form Label Associations — PublicRoadmapPreview.jsx

**Files:**
- Modify: `client/src/components/PublicRoadmapPreview.jsx:64-97`

- [ ] **Step 1: Add `htmlFor`/`id` pairs to labels and inputs, and `role="alert"` to error**

Change the name label+input (lines 66-74):

```jsx
<label htmlFor="login-name" className="block font-body text-xs font-semibold text-csub-blue-dark/70 mb-1">Name</label>
<input
  id="login-name"
  type="text"
  required
  value={loginName}
  onChange={(e) => setLoginName(e.target.value)}
  placeholder="Jane Doe"
  className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
/>
```

Change the email label+input (lines 77-85):

```jsx
<label htmlFor="login-email" className="block font-body text-xs font-semibold text-csub-blue-dark/70 mb-1">Email</label>
<input
  id="login-email"
  type="email"
  required
  value={loginEmail}
  onChange={(e) => setLoginEmail(e.target.value)}
  placeholder="jdoe@csub.edu"
  className="w-full px-3 py-2 rounded-lg border border-gray-300 font-body text-sm focus:outline-none focus:ring-2 focus:ring-csub-blue focus:border-transparent"
/>
```

Add `aria-describedby` to the form element (line 64) when error is present:

```jsx
<form onSubmit={handleLogin} className="flex flex-wrap items-end gap-3" aria-describedby={loginError ? 'login-error' : undefined}>
```

Change the error message (lines 95-97):

```jsx
{loginError && (
  <p id="login-error" role="alert" className="text-red-600 text-sm font-body mt-2">{loginError}</p>
)}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/PublicRoadmapPreview.jsx
git commit -m "feat(a11y): associate form labels with inputs and add role=alert to errors"
```

---

### Task 4: Touch Targets & Checkbox — RoadmapPage.jsx

**Files:**
- Modify: `client/src/pages/RoadmapPage.jsx:242,248-276`

- [ ] **Step 1: Increase checkbox size**

Change line 242 from:

```jsx
className="w-3.5 h-3.5 rounded border-gray-300 text-csub-blue focus:ring-csub-blue"
```

to:

```jsx
className="w-5 h-5 rounded border-gray-300 text-csub-blue focus:ring-csub-blue"
```

- [ ] **Step 2: Increase view toggle button touch targets**

Change both toggle buttons (lines 251 and 266) from `p-1.5` to `p-2.5`:

```jsx
className={`p-2.5 rounded-md transition-colors ${
  viewMode === 'timeline' ? 'bg-white shadow-sm text-csub-blue' : 'text-gray-400 hover:text-gray-600'
}`}
```

```jsx
className={`p-2.5 rounded-md transition-colors ${
  viewMode === 'list' ? 'bg-white shadow-sm text-csub-blue' : 'text-gray-400 hover:text-gray-600'
}`}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/RoadmapPage.jsx
git commit -m "feat(a11y): increase touch targets for checkbox and view toggles to 44px"
```

---

### Task 5: TimelineStep — ARIA & Touch Targets

**Files:**
- Modify: `client/src/components/roadmap/TimelineStep.jsx:78-82,102,122`

- [ ] **Step 1: Replace `aria-expanded` with `aria-haspopup`**

Change line 102 from:

```jsx
aria-expanded="false"
```

to:

```jsx
aria-haspopup="dialog"
```

- [ ] **Step 2: Replace `text-[10px]` with `text-xs`**

Change line 80 from:

```jsx
<span className="text-[10px] sm:text-xs">{index + 1}</span>
```

to:

```jsx
<span className="text-xs">{index + 1}</span>
```

Change line 122 from:

```jsx
<span className="inline-flex mt-1 text-[10px] font-body font-semibold text-csub-blue bg-csub-blue/10 rounded-full px-2 py-0.5">
```

to:

```jsx
<span className="inline-flex mt-1 text-xs font-body font-semibold text-csub-blue bg-csub-blue/10 rounded-full px-2 py-0.5">
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/roadmap/TimelineStep.jsx
git commit -m "feat(a11y): fix aria-haspopup, font sizes, and touch targets on timeline steps"
```

---

### Task 6: ListView — Font Sizes & Touch Targets

**Files:**
- Modify: `client/src/components/roadmap/ListView.jsx:51,65`

- [ ] **Step 1: Replace `text-[10px]` with `text-xs`**

Change line 51 from:

```jsx
{config.icon || <span className="text-[10px]">{index + 1}</span>}
```

to:

```jsx
{config.icon || <span className="text-xs">{index + 1}</span>}
```

Change line 65 from:

```jsx
<span className="inline-flex mt-1 text-[10px] font-body font-semibold text-csub-blue bg-csub-blue/10 rounded-full px-2 py-0.5">
```

to:

```jsx
<span className="inline-flex mt-1 text-xs font-body font-semibold text-csub-blue bg-csub-blue/10 rounded-full px-2 py-0.5">
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/roadmap/ListView.jsx
git commit -m "feat(a11y): replace text-[10px] with text-xs in list view"
```

---

### Task 7: DeadlineCountdown — Font Size

**Files:**
- Modify: `client/src/components/roadmap/DeadlineCountdown.jsx:36`

- [ ] **Step 1: Replace `text-[10px]` with `text-xs`**

Change line 36 from:

```jsx
className={`inline-flex items-center text-[10px] font-body font-semibold rounded-full px-2 py-0.5 border ${styles[info.level]}`}
```

to:

```jsx
className={`inline-flex items-center text-xs font-body font-semibold rounded-full px-2 py-0.5 border ${styles[info.level]}`}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/roadmap/DeadlineCountdown.jsx
git commit -m "feat(a11y): replace text-[10px] with text-xs in deadline countdown"
```

---

### Task 8: StepDetailPanel — Focus Trap

**Files:**
- Modify: `client/src/components/roadmap/StepDetailPanel.jsx:30-44,75-79`

- [ ] **Step 1: Add focus trap to the keydown handler**

Replace the existing `useEffect` (lines 31-44) with:

```jsx
useEffect(() => {
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft' && hasPrev) onNavigate('prev');
    if (e.key === 'ArrowRight' && hasNext) onNavigate('next');

    // Focus trap: keep Tab within the dialog
    if (e.key === 'Tab' && panelRef.current) {
      const focusable = panelRef.current.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener('keydown', handleKeyDown);
  document.body.style.overflow = 'hidden';

  return () => {
    document.removeEventListener('keydown', handleKeyDown);
    document.body.style.overflow = '';
  };
}, [onClose, onNavigate, hasPrev, hasNext]);
```

- [ ] **Step 2: Add `aria-hidden` to the status accent bar**

Change lines 75-79 from:

```jsx
<div className={`h-1.5 ${
  step.status === 'completed' ? 'bg-gradient-to-r from-csub-gold to-amber-300' :
  step.status === 'in_progress' ? 'bg-gradient-to-r from-csub-blue to-blue-400' :
  'bg-gray-200'
} sm:rounded-t-xl`} />
```

to:

```jsx
<div aria-hidden="true" className={`h-1.5 ${
  step.status === 'completed' ? 'bg-gradient-to-r from-csub-gold to-amber-300' :
  step.status === 'in_progress' ? 'bg-gradient-to-r from-csub-blue to-blue-400' :
  'bg-gray-200'
} sm:rounded-t-xl`} />
```

- [ ] **Step 3: Increase nav button touch targets**

Change the prev/next buttons (lines 89, 102) from `p-1.5` to `p-2.5`:

```jsx
className="p-2.5 rounded-lg text-gray-400 hover:text-csub-blue hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
```

And the close button (line 112):

```jsx
className="p-2.5 rounded-lg text-gray-400 hover:text-csub-blue-dark hover:bg-gray-100 transition-colors"
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/roadmap/StepDetailPanel.jsx
git commit -m "feat(a11y): add focus trap, aria-hidden accent bar, increase button touch targets"
```

---

### Task 9: Celebration — Motion, Dialog A11y, Focus Trap, Keyboard Dismiss

**Files:**
- Modify: `client/src/components/Celebration.jsx:1-130`

- [ ] **Step 1: Add reduced-motion check, dialog a11y, focus trap, and Escape handler**

Replace the full component with:

```jsx
import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

/* Inline SVG shield in CSUB blue/gold — resembles the university crest shape */
function CsubShield() {
  return (
    <svg width="80" height="96" viewBox="0 0 80 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Shield body */}
      <path
        d="M40 2 L76 16 L76 52 C76 72 60 88 40 94 C20 88 4 72 4 52 L4 16 Z"
        fill="#003594"
        stroke="#FFC72C"
        strokeWidth="3"
      />
      {/* Rising sun rays */}
      <g opacity="0.3">
        <line x1="40" y1="58" x2="20" y2="38" stroke="#FFC72C" strokeWidth="1.5" />
        <line x1="40" y1="58" x2="28" y2="32" stroke="#FFC72C" strokeWidth="1.5" />
        <line x1="40" y1="58" x2="40" y2="28" stroke="#FFC72C" strokeWidth="1.5" />
        <line x1="40" y1="58" x2="52" y2="32" stroke="#FFC72C" strokeWidth="1.5" />
        <line x1="40" y1="58" x2="60" y2="38" stroke="#FFC72C" strokeWidth="1.5" />
      </g>
      {/* Sun arc */}
      <path
        d="M18 62 Q40 42 62 62"
        fill="#FFC72C"
        opacity="0.9"
      />
      {/* Horizon line */}
      <line x1="14" y1="62" x2="66" y2="62" stroke="#FFC72C" strokeWidth="2" />
      {/* Checkmark */}
      <path
        d="M28 48 L36 56 L54 34"
        stroke="#FFC72C"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export default function Celebration({ onClose }) {
  const dialogRef = useRef(null);
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Confetti animation — skip if user prefers reduced motion
  useEffect(() => {
    if (prefersReducedMotion) return;

    const duration = 3000;
    const end = Date.now() + duration;
    const csubColors = ['#003594', '#FFC72C', '#ffffff'];

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: csubColors,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: csubColors,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();
  }, []);

  // Focus trap + keyboard dismiss
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <motion.div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Celebration — all steps complete"
      initial={prefersReducedMotion ? false : { opacity: 0 }}
      animate={prefersReducedMotion ? false : { opacity: 1 }}
      exit={prefersReducedMotion ? undefined : { opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-csub-blue-dark/60 backdrop-blur-sm focus:outline-none"
      onClick={onClose}
    >
      <motion.div
        initial={prefersReducedMotion ? false : { scale: 0.8, opacity: 0 }}
        animate={prefersReducedMotion ? false : { scale: 1, opacity: 1 }}
        exit={prefersReducedMotion ? undefined : { scale: 0.8, opacity: 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 200, damping: 18 }}
        className="bg-white rounded-2xl p-8 md:p-12 max-w-md mx-4 text-center shadow-2xl border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Shield crest */}
        <div className="flex justify-center mb-6">
          <motion.div
            initial={prefersReducedMotion ? false : { y: -20 }}
            animate={prefersReducedMotion ? false : { y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : { delay: 0.2, type: 'spring' }}
          >
            <CsubShield />
          </motion.div>
        </div>

        <h2 className="font-display text-3xl font-bold text-csub-blue-dark uppercase tracking-wide mb-2">
          Congratulations!
        </h2>

        <div className="w-16 h-0.5 bg-csub-gold mx-auto my-4" aria-hidden="true" />

        <p className="font-body text-base text-csub-gray mb-1">
          All steps complete. You are officially ready for
        </p>
        <p className="font-display text-xl font-bold text-csub-blue uppercase tracking-wider mb-6">
          Your first day at CSU Bakersfield
        </p>

        <p className="font-display text-csub-gold text-lg font-bold uppercase tracking-widest mb-8">
          Go Runners!
        </p>

        <button
          onClick={onClose}
          className="bg-csub-blue text-white font-display font-bold uppercase tracking-wider py-3 px-10 rounded
                     hover:bg-csub-blue-dark transition-colors shadow-lg
                     hover:shadow-xl active:scale-95 transform text-sm"
        >
          Continue
        </button>
      </motion.div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/Celebration.jsx
git commit -m "feat(a11y): add reduced-motion, dialog role, focus trap, Escape key to celebration"
```

---

### Task 10: RoadrunnerMascot — Decorative & Motion

**Files:**
- Modify: `client/src/components/RoadrunnerMascot.jsx:1-63`

- [ ] **Step 1: Add `aria-hidden` and conditional motion**

Replace the component with:

```jsx
import { motion } from 'framer-motion';

const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function RoadrunnerMascot({ className = '' }) {
  const Wrapper = prefersReducedMotion ? 'div' : motion.div;
  const motionProps = prefersReducedMotion
    ? {}
    : {
        animate: { y: [0, -6, 0], rotate: [0, -3, 0, 3, 0] },
        transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
      };

  return (
    <Wrapper className={`inline-block ${className}`} {...motionProps} aria-hidden="true">
      <svg
        width="48"
        height="48"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Body */}
        <ellipse cx="30" cy="36" rx="16" ry="14" fill="#003594" />
        {/* Belly */}
        <ellipse cx="30" cy="40" rx="10" ry="9" fill="#FFC72C" />
        {/* Head */}
        <circle cx="44" cy="24" r="10" fill="#003594" />
        {/* Eye */}
        <circle cx="47" cy="22" r="4" fill="white" />
        <circle cx="48" cy="21.5" r="2" fill="#1a1a1a" />
        <circle cx="49" cy="20.5" r="0.8" fill="white" />
        {/* Beak */}
        <polygon points="54,23 64,21 54,25" fill="#FFC72C" />
        {/* Crest/head feathers */}
        <path
          d="M 40,16 Q 42,8 48,12 Q 44,10 44,16"
          fill="#003594"
          stroke="#003594"
          strokeWidth="1"
        />
        <path
          d="M 43,14 Q 46,7 50,10 Q 47,9 46,14"
          fill="#0047B3"
          stroke="#0047B3"
          strokeWidth="1"
        />
        {/* Tail feathers */}
        <path d="M 14,30 Q 4,24 8,32 Q 2,30 10,36" fill="#0047B3" />
        <path d="M 14,33 Q 6,30 10,36" fill="#003594" />
        {/* Legs */}
        <line x1="26" y1="48" x2="22" y2="58" stroke="#FFC72C" strokeWidth="3" strokeLinecap="round" />
        <line x1="34" y1="48" x2="36" y2="58" stroke="#FFC72C" strokeWidth="3" strokeLinecap="round" />
        {/* Feet */}
        <path d="M 18,57 L 22,58 L 18,60" stroke="#FFC72C" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M 32,57 L 36,58 L 32,60" stroke="#FFC72C" strokeWidth="2" strokeLinecap="round" fill="none" />
        {/* Wing */}
        <ellipse cx="24" cy="34" rx="8" ry="5" fill="#0047B3" transform="rotate(-15, 24, 34)" />
      </svg>
    </Wrapper>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/RoadrunnerMascot.jsx
git commit -m "feat(a11y): add aria-hidden and reduced-motion support to mascot"
```

---

### Task 11: CurrentStepCallout — Aria Label

**Files:**
- Modify: `client/src/components/roadmap/CurrentStepCallout.jsx:61-63`

- [ ] **Step 1: Add `aria-label` to the "View details" button**

Change lines 61-63 from:

```jsx
<button
  onClick={onViewDetails}
  className="inline-flex items-center gap-1.5 font-body text-sm font-semibold text-csub-blue hover:text-csub-blue-dark transition-colors"
>
```

to:

```jsx
<button
  onClick={onViewDetails}
  aria-label={`View details for ${step.title}`}
  className="inline-flex items-center gap-1.5 font-body text-sm font-semibold text-csub-blue hover:text-csub-blue-dark transition-colors"
>
```

- [ ] **Step 2: Add `aria-hidden` to decorative accent bar**

Change line 17 from:

```jsx
<div className="h-1.5 bg-gradient-to-r from-csub-blue to-csub-gold" />
```

to:

```jsx
<div className="h-1.5 bg-gradient-to-r from-csub-blue to-csub-gold" aria-hidden="true" />
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/roadmap/CurrentStepCallout.jsx
git commit -m "feat(a11y): add descriptive aria-label to current step view details button"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Build to check for errors**

Run: `cd /Users/aburt1/Desktop/roadmap/CSUB-admissions/client && npx vite build`
Expected: Build completes with no errors

- [ ] **Step 2: Start dev server and verify in browser**

Run: `cd /Users/aburt1/Desktop/roadmap/CSUB-admissions && npm run dev`

Manual checks:
1. Open http://localhost:3000 in Chrome DevTools mobile emulator (iPhone SE)
2. Verify touch targets are visually larger (checkbox, view toggles, nav buttons)
3. Enable "Reduce motion" in macOS System Settings > Accessibility > Display
4. Reload — confirm no spinning, pulsing, or sliding animations
5. Tab through the roadmap page — confirm visible focus rings
6. Click a step to open StepDetailPanel — Tab should cycle within the modal
7. Press Escape — panel should close
8. Check login form labels are visible and associated (inspect in DevTools)

- [ ] **Step 3: Take screenshots to verify visual consistency**

Use preview tools to screenshot the roadmap in both mobile and desktop viewports. Confirm layout is unchanged except for slightly larger touch targets.
