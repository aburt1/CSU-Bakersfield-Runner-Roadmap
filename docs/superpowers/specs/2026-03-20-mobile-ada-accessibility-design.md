# Mobile & ADA Accessibility — Student-Facing Pages

## Context

The CSUB Admissions Roadmap needs to be mobile-friendly and ADA/WCAG compliant for student-facing pages. An audit revealed critical gaps: zero `prefers-reduced-motion` support across 124+ animations (including JS-driven Framer Motion and canvas-confetti), missing form label associations, no focus traps in modals, undersized touch targets, and missing ARIA attributes. The admin panel is out of scope.

## Scope

Student-facing pages only:
- `App.jsx` (loading spinner)
- `RoadmapPage.jsx` (main roadmap view)
- `PublicRoadmapPreview.jsx` (public login/preview)
- All components under `components/roadmap/*`
- Supporting components: `Celebration.jsx`, `RoadrunnerMascot.jsx`
- Global styles in `index.css`

## Approach

CSS-first fixes with minimal JSX changes. No layout redesigns. Keep the existing look. For JS-driven animations (Framer Motion, canvas-confetti), use `window.matchMedia('(prefers-reduced-motion: reduce)')` since the CSS rule only affects CSS animations/transitions.

---

## Changes by File

### 1. `client/src/index.css`

**Add `prefers-reduced-motion` media query:**
```css
/* 0.01ms instead of 0s to ensure animationend events still fire */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
This handles CSS animations (Tailwind `animate-spin`, `animate-pulse`, etc.). JS-driven animations need separate handling per component.

**Add `.sr-only` utility class:**
```css
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

### 2. `client/src/App.jsx`

- Loading spinner (line 13): Add `role="status"` and `aria-label="Loading"` to the spinner container

### 3. `client/src/components/PublicRoadmapPreview.jsx`

Labels already exist (lines 66, 77) but are not programmatically associated with inputs.

- Add `htmlFor` to each `<label>` and matching `id` to each `<input>` (e.g., `htmlFor="login-name"` / `id="login-name"`)
- Add `role="alert"` to the error message container (line 96)
- Add `aria-describedby="login-error"` to the form when error is present, and `id="login-error"` to the error `<p>`
- Loading spinner (line 49): Add `role="status"` and `aria-label="Loading"`

### 4. `client/src/pages/RoadmapPage.jsx`

- **Header**: Wrap user controls in flex that stacks gracefully on small screens
- **Loading spinner** (lines 106-117): Add `role="status"` and `aria-label="Loading your roadmap"`
- **View toggle buttons** (lines 249-276): Increase padding from `p-1.5` to `p-2.5` to meet 44px touch target. Aria-labels already exist — no change needed there.
- **Checkbox** (line 242): Increase from `w-3.5 h-3.5` to `w-5 h-5`

### 5. `client/src/components/roadmap/TimelineStep.jsx`

- Remove hardcoded `aria-expanded="false"` — replace with `aria-haspopup="dialog"` (the step detail is a separate modal overlay, not an expandable section)
- Replace `text-[10px]` with `text-xs` (12px, better readability)
- Ensure timeline node touch targets meet 44px minimum with padding

### 6. `client/src/components/roadmap/StepDetailPanel.jsx`

**Focus trap implementation (manual, no new dependency):**
- On mount, query all focusable elements inside the panel (`button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])`)
- On `Tab` keydown: if focus is on last focusable element, move to first. On `Shift+Tab`: if focus is on first, move to last.
- Note: guide content rendered via `dangerouslySetInnerHTML` may contain `<a>` tags — the focusable element query must run after render to capture these.
- Set initial focus to the panel container (current behavior, line 48) — this is valid per WCAG dialog guidance and avoids needing refs on specific buttons.
- Add `aria-hidden="true"` to decorative status accent bar (line 81).

### 7. `client/src/components/roadmap/ListView.jsx`

- Replace `text-[10px]` with `text-xs`
- Ensure button touch targets meet 44px minimum

### 8. `client/src/components/roadmap/DeadlineCountdown.jsx`

- Replace `text-[10px]` with `text-xs` (same fix as TimelineStep/ListView)

### 9. `client/src/components/roadmap/CurrentStepCallout.jsx`

- Add descriptive `aria-label` to the CTA button

### 10. `client/src/components/Celebration.jsx`

This is a full-screen modal overlay — needs both motion and dialog accessibility:

- **Motion**: Use `window.matchMedia('(prefers-reduced-motion: reduce)')` in the `useEffect` to skip the `canvas-confetti` animation entirely (CSS rule does NOT affect canvas-based JS animations)
- **Dialog a11y**: Add `role="dialog"`, `aria-modal="true"`, `aria-label="Celebration"` to the outer container
- **Focus trap**: Add Tab/Shift+Tab trap (same pattern as StepDetailPanel)
- **Keyboard dismiss**: Add `onKeyDown` handler for Escape key to call `onClose`
- **Decorative SVG**: Add `aria-hidden="true"` to CsubShield

### 11. `client/src/components/RoadrunnerMascot.jsx`

- Add `aria-hidden="true"` (purely decorative)
- Conditionally disable Framer Motion `animate` prop when `prefers-reduced-motion: reduce` is active, using `window.matchMedia`

### No Changes Needed

- `ProgressSummary.jsx` — already has `role="progressbar"`, `aria-live="polite"`, proper ARIA values
- `HelpSection.jsx` — already uses semantic grid layout

---

## Verification

1. Run the dev server (`npm run dev`)
2. Test with browser devtools mobile emulation (iPhone SE, Pixel 5)
3. Verify all touch targets are at least 44x44px
4. Enable "Reduce motion" in OS/browser settings — confirm:
   - No CSS animations play (spin, pulse)
   - No confetti on Celebration screen
   - No Framer Motion entrance animations
   - RoadrunnerMascot is static
5. Tab through the entire roadmap page — confirm logical focus order and visible focus rings
6. Open StepDetailPanel — confirm focus is trapped inside and Escape closes it
7. Open Celebration modal — confirm focus is trapped, Escape dismisses it
8. Use VoiceOver (macOS) to verify:
   - Form labels are announced when focusing inputs
   - Loading spinners are announced as "Loading"
   - Step buttons announce `aria-haspopup="dialog"`
   - Celebration modal is announced as a dialog
