# Unified Term & Steps Admin Design

**Date:** 2026-03-19
**Status:** Draft

## Problem

The admin UI manages Terms and Steps in separate, disconnected tabs. Steps have a `term_id` foreign key but the UI doesn't enforce the relationship — new steps get `NULL` term_id, and there's no way to clone a term's steps to a new term. Admins must manually recreate steps each term.

## Goals

- Unify terms and steps management onto a single admin page
- Enable cloning a term's steps (with selection) to a new term
- Keep each term fully independent after cloning (no linking/syncing)
- Preserve existing CSUB design language and component styling

## Non-Goals

- Template system or shared step definitions across terms
- Syncing changes between terms
- Changing the student-facing roadmap UI
- Modifying the Students tab or other admin tabs

## Design

### Component Structure

**Merged into one:** `TermsTab` and `StepsTab` become a single `TermStepsTab` component, which replaces both tabs on the admin page. All other admin tabs (Students, etc.) remain unchanged.

**New components:**

- `TermBar` — Top bar with term pill tabs (chronological order), "+ New Term" button, and "Clone Term" button
- `TermHeader` — Inline detail bar below the tabs showing the selected term's name, date range, active/inactive status, with "Edit Term" and "Delete Term" actions
- `CloneTermModal` — Modal dialog for cloning a term with step selection checkboxes

**Modified components:**

- `StepForm` — Adds a hidden `term_id` field, auto-set from the currently selected term. All existing fields remain unchanged.

**Unchanged components:**

- `TagEditor`, `RichTextEditor` — No changes
- Step list card layout — Same styling and actions (edit, delete, duplicate)

### UI Layout

```
┌──────────────────────────────────────────────────┐
│ [Fall 2025] [Spring 2026] [Fall 2026]  +New Clone│  ← TermBar
├──────────────────────────────────────────────────┤
│ Fall 2025                                        │
│ Aug 18 — Dec 12, 2025 · Active    [Edit] [Delete]│  ← TermHeader
├──────────────────────────────────────────────────┤
│ 8 STEPS                              [+ Add Step]│
│ ┌──────────────────────────────────────────────┐ │
│ │ 📋 Apply to CSUB          Order: 1  Public   │ │  ← Existing step
│ │    Submit your application...          Edit   │ │     card style
│ └──────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────┐ │
│ │ 💰 Submit FAFSA            Order: 2  Public  │ │
│ │    Complete your financial aid...       Edit  │ │
│ └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Data Flow

1. `TermStepsTab` loads all terms on mount
2. Selected term ID stored in component state (defaults to the most recent term)
3. Steps fetched filtered by `term_id`
4. Creating/editing a step automatically associates it with the selected term
5. Switching terms re-fetches steps for the new selection

### UI Interactions

**Term selection:** Click a pill tab to switch. Active tab uses solid `csub-blue` background.

**New term:** "+ New Term" opens a modal or inline form for name + optional start/end dates. Creates a blank term with no steps.

**Edit term:** "Edit Term" button in the TermHeader replaces the display with inline editable fields (name, dates). Save/cancel buttons appear.

**Delete term:** "Delete Term" shows a confirmation dialog warning about the number of steps that will be deleted. Cascades to delete all steps in the term.

**Clone term:**
1. "Clone Term" opens CloneTermModal
2. Pick source term from dropdown (shows step count)
3. Enter new term name (required), start/end dates (optional)
4. Checkbox list of all steps from source term — all checked by default
5. "Select All / None" toggle link
6. "Clone X Steps" button creates the term and copies selected steps
7. Auto-switches to the newly created term

**Empty state:** When a term has zero steps, show: "No steps yet. Add one or clone from another term."

**Add step:** "+ Add Step" creates a step pre-bound to the selected term (term_id set automatically).

**Duplicate step:** Stays within the same term (existing behavior, now with explicit term_id).

### API Changes

**Existing endpoints (unchanged):**

- `GET /api/admin/terms` — list all terms
- `POST /api/admin/terms` — create term
- `PUT /api/admin/terms/:id` — update term
- `DELETE /api/admin/terms/:id` — delete term (add cascade delete for steps)
- `PUT /api/admin/steps/:id` — update step
- `DELETE /api/admin/steps/:id` — delete step

**Modified endpoints:**

- `GET /api/admin/steps?term_id=X` — Add optional `term_id` query parameter to filter steps. Returns all steps if omitted (backward compatible).
- `POST /api/admin/steps` — `term_id` becomes required when creating a step.

**New endpoint:**

- `POST /api/admin/terms/:id/clone`
  - Request body: `{ name: string, start_date?: string, end_date?: string, step_ids: number[] }`
  - Creates a new term with the given name and dates
  - Copies each selected step (new ID, new term_id, preserves: title, icon, description, deadline, deadline_date, guide_content, links, required_tags, sort_order, contact_info, is_public)
  - Student progress is NOT copied
  - Returns: `{ term: {...}, steps: [...] }`

### Database Changes

**No schema changes needed.** The `steps` table already has a `term_id` column referencing the `terms` table. The only change is enforcing that new steps always have a `term_id` set.

**Cascade delete:** When a term is deleted, all steps with that `term_id` are also deleted. Student progress records referencing deleted step IDs become orphaned but harmless (they simply won't resolve to a visible step).

### Migration Consideration

Existing steps with `NULL` term_id need to be handled. Options:
- Assign them to the first/default term on app startup
- Show them in a special "Unassigned" section until manually assigned
- Recommended: assign to the most recent term automatically, since there are likely few steps in the current dev state

## Files to Create/Modify

**New files:**
- `client/src/pages/admin/TermStepsTab.jsx` — unified tab component
- `client/src/pages/admin/TermBar.jsx` — term selector bar
- `client/src/pages/admin/TermHeader.jsx` — term detail/actions bar
- `client/src/pages/admin/CloneTermModal.jsx` — clone dialog

**Modified files:**
- `client/src/pages/admin/AdminPage.jsx` — replace Terms + Steps tabs with single TermSteps tab
- `client/src/pages/admin/StepForm.jsx` — add hidden term_id field
- `server/routes/admin.js` — add clone endpoint, add term_id filter to GET steps, add cascade delete

**Removed files:**
- `client/src/pages/admin/TermsTab.jsx` — functionality absorbed into TermStepsTab
- `client/src/pages/admin/StepsTab.jsx` — functionality absorbed into TermStepsTab
