# Merge Optional Steps Into Single Roadmap

## Problem

The student-facing roadmap renders two separate sections: required steps (with progression tracking) and an "Optional Opportunities" section below. This creates an unnecessary split that makes the roadmap feel fragmented. Optional steps should appear inline alongside required steps as one unified roadmap.

## Design

### Core Change

Remove the separate "Optional Opportunities" section. Interleave optional steps with required steps in a single list, ordered by `sort_order` (matching admin configuration).

### Progression Logic

- Required steps keep their progression chain: first incomplete required step = "in_progress", completed = "completed", future required = "not_started".
- Optional steps **do not participate in progression**. They are either "completed", "waived", or "not_started" — never "in_progress". The progression marker skips over them.
- Waived optional steps display as "waived" (matching current behavior from `deriveOptionalStepStatuses`).

### Progress Summary

- The main progress percentage and counter track **required steps only**.
- Optional step completions are not counted toward overall progress.
- Remove the optional progress counter line from `ProgressSummary`.

### Visual Treatment

- Optional steps retain their existing "Optional" badge (blue pill) so students can distinguish them from required steps.
- Optional steps retain the manual mark-complete/incomplete toggle in the detail panel.

## Merge Algorithm

The API already returns all steps sorted by `sort_order`. In `useProgress.js`, replace the current split-and-derive approach with a single-pass algorithm over the full `applicable` array:

```
let foundCurrent = false;
for each step in applicable (sorted by sort_order):
  if step.is_optional:
    status = progressMap has entry ? entry.status : 'not_started'
  else (required):
    if progressMap has entry:
      status = entry.status  (completed or waived)
    else if !foundCurrent:
      foundCurrent = true
      status = 'in_progress'
    else:
      status = 'not_started'
```

This produces one merged list with correct statuses. No separate `deriveStepStatuses` / `deriveOptionalStepStatuses` calls needed.

## Files to Modify

### `client/src/hooks/useProgress.js`

- Replace the `useMemo` block (lines ~142-155) with the single-pass merge algorithm above, producing one `allSteps` list.
- Remove `deriveOptionalStepStatuses` function (no longer called).
- Remove `optionalSteps`, `optionalTotalSteps`, `optionalCompletedCount` from the return value.
- Keep `requiredSteps` derived count variables (`totalSteps`, `doneCount`, `percentage`, `currentStep`, `allComplete`) — compute these from the merged list by filtering `is_optional !== 1`.

### `client/src/pages/RoadmapPage.jsx`

- Remove `filteredOptionalSteps` useMemo (line ~100-103). Replace `filteredRequiredSteps` with a single `filteredSteps` that applies `showOnlyIncomplete` to the merged `steps` list.
- Replace `selectedStepList` (line ~105-108) to use the single `filteredSteps` list instead of branching on `is_optional`.
- Remove the "Optional Opportunities" section (lines ~336-370).
- Feed `filteredSteps` to `RoadmapTimeline` / `ListView`.
- Update the empty state check (line ~373) to use `filteredSteps.length === 0` instead of checking both lists.
- Remove `optionalCompletedCount` and `optionalTotalSteps` props from the `ProgressSummary` call.
- Keep `handleOptionalStepStatusChange` — still needed for the detail panel toggle.

### `client/src/components/roadmap/ProgressSummary.jsx`

- Remove `optionalCompletedCount` and `optionalTotalSteps` props.
- Remove the optional progress counter block (lines 60-64).

### No Changes Needed

- `TimelineStep.jsx` — Already renders "Optional" badge when `step.is_optional === 1`.
- `StepDetailPanel.jsx` — Already handles optional step mark-complete button.
- `ListView.jsx` / `RoadmapTimeline.jsx` — Already accept any step array; no filtering logic inside.

## Verification

1. Load the student roadmap — should see one continuous list with optional steps interleaved by sort order.
2. Verify no separate "Optional Opportunities" section appears.
3. Verify optional steps show the "Optional" badge.
4. Verify the progress bar/counter only counts required steps.
5. Verify the "in progress" marker skips optional steps and lands on the next incomplete required step.
6. Open an optional step's detail panel — verify mark-complete toggle still works.
7. Complete an optional step — verify it doesn't change the progress percentage.
8. Use prev/next navigation in the detail panel — verify it traverses all steps (required + optional) in order.
9. Toggle "show incomplete only" filter — verify it applies to the single merged list correctly.
10. When all incomplete steps are filtered out, verify the "All caught up!" empty state appears.
