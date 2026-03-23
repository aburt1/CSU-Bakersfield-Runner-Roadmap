# Analytics: Fix Chart Bugs + Student Drill-Down

## Problem

1. Multiple analytics charts show incorrect data because SQL queries join `student_progress` without filtering by completion status — counting all progress entries, not just completions.
2. Admins have no way to see which students make up each data point in the analytics charts. They need to click a bar/segment to see the student list.

## Bug Fix: Status Filter Missing from Analytics Queries

### Root Cause

In `server/routes/admin.js`, four analytics endpoints join or query `student_progress` without filtering `sp.status IN ('completed', 'waived')`:

1. **Step-completion** (line 722): `LEFT JOIN student_progress sp ON sp.step_id = s.id` — counts all progress, not just completions
2. **Bottleneck** (line 775): Same issue — `LEFT JOIN student_progress sp ON sp.step_id = s.id`
3. **Cohort-summary** (line 821): `SELECT student_id, COUNT(*) as done FROM student_progress sp` — counts all rows as "done"
4. **Completion-trend** (line 744): `SELECT DATE(sp.completed_at) ... FROM student_progress sp` — no status filter

### Fixes

- Lines 722, 775: Add `AND sp.status IN ('completed', 'waived')` to the JOIN condition
- Line 821: Add `WHERE sp.status IN ('completed', 'waived')` to the subquery
- Line 744: Add `AND sp.status IN ('completed', 'waived')` to the WHERE clause

### Files to Fix
- `server/routes/admin.js:722` — step-completion endpoint
- `server/routes/admin.js:744` — completion-trend endpoint
- `server/routes/admin.js:775` — bottleneck endpoint
- `server/routes/admin.js:821` — cohort-summary endpoint

## Student Drill-Down Feature

### New Backend Endpoint

`GET /api/admin/analytics/students`

A single flexible endpoint that returns a student list based on filter parameters. Capped at 200 rows to keep the panel performant — the response includes `total` so the UI can show "Showing 200 of 342 students" when capped.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `term_id` | Yes | Filter to term |
| `filter_type` | Yes | One of the filter types below |
| `filter_value` | Depends | Value for the filter (e.g. step ID, tag name) |

**Filter types:**

| filter_type | filter_value | Returns |
|-------------|-------------|---------|
| `step_completed` | step ID | Students who completed that step |
| `step_not_completed` | step ID | Students who have NOT completed that step |
| `cohort_bucket` | `0%`, `1-25%`, `26-50%`, `51-75%`, `76-100%` | Students in that completion % range (values match CohortDistributionChart bucket labels) |
| `tag` | tag name (e.g. `freshman`) | Students with that tag |
| `stalled` | `7-14 days`, `2-4 weeks`, `1-3 months`, `3+ months` | Students inactive for that duration (values match StalledStudentsChart bucket labels) |
| `deadline_risk` | step ID | Students who haven't completed a step with an upcoming deadline |
| `velocity_bucket` | `1-3 days`, `4-7 days`, `1-2 weeks`, `2-4 weeks`, `4+ weeks` | Students in that velocity range (values match CompletionVelocityChart bucket labels) |
| `trend_date` | ISO date string (e.g. `2026-03-20`) | Students who completed a step on that date |

**Bucket label mapping to day ranges (for backend query logic):**

Stalled buckets:
- `7-14 days` → 7-14 days inactive
- `2-4 weeks` → 15-28 days inactive
- `1-3 months` → 29-90 days inactive
- `3+ months` → 91+ days inactive (or no `last_completion_date`)

Velocity buckets:
- `1-3 days` → 0-3 days elapsed
- `4-7 days` → 4-7 days elapsed
- `1-2 weeks` → 8-14 days elapsed
- `2-4 weeks` → 15-28 days elapsed
- `4+ weeks` → 29+ days elapsed

**Response format:**

```json
{
  "title": "Students who completed Accepted!",
  "students": [
    {
      "id": 1,
      "display_name": "Jane Doe",
      "email": "jdoe@csub.edu",
      "emplid": "123456",
      "completed_count": 5,
      "total_steps": 16,
      "completion_pct": 31
    }
  ],
  "total": 42
}
```

The endpoint generates a human-readable `title` based on the filter type and value. `total` reflects the true count even when results are capped at 200.

### New Client Component: StudentDrillDown

A slide-out panel (right side, similar to existing step detail panels) showing:

- **Header**: Title describing the population (e.g. "Students who haven't completed Register for Classes")
- **Count badge**: "42 students" (or "Showing 200 of 342 students" when capped)
- **Scrollable student list**: Each row shows name, email, and completion % bar
- **Close button** (X) and click-outside-to-close
- **Empty state**: "No students match this filter"

The panel receives props: `{ open, onClose, termId, filterType, filterValue, api }`. It fetches the student list from the new endpoint when opened.

### Chart Updates

Each chart adds click handlers to its interactive elements. On click, it calls a callback like `onDrillDown({ filterType, filterValue })` which the parent `AnalyticsTab` uses to open the `StudentDrillDown` panel.

**AnalyticsTab** manages the drill-down state and renders the panel:

```jsx
const [drillDown, setDrillDown] = useState(null);
// ...
<StudentDrillDown
  open={!!drillDown}
  onClose={() => setDrillDown(null)}
  {...drillDown}
  termId={termId}
  api={api}
/>
```

Each chart passes its drill-down handler:

| Chart | Click target | filterType | filterValue | Title example |
|-------|-------------|------------|-------------|---------------|
| StepCompletionChart | Bar | `step_completed` | step ID | "Students who completed Accepted!" |
| BottleneckChart | Bar | `step_not_completed` | step ID | "Students who haven't completed Register for Classes" |
| CohortDistributionChart | Bar | `cohort_bucket` | bucket label (e.g. `26-50%`) | "Students at 26-50% completion" |
| CompletionTrendChart | Point | `trend_date` | raw ISO date | "Completions on Mar 20, 2026" |
| DeadlineRiskChart | Row | `deadline_risk` | step ID | "At-risk students for Attend Future Runner Day" |
| StalledStudentsChart | Bar | `stalled` | bucket label (e.g. `2-4 weeks`) | "Students stalled 2-4 weeks" |
| CohortComparisonChart | Bar | `tag` | tag name | "Freshman students" |
| CompletionVelocityChart | Bar | `velocity_bucket` | bucket label (e.g. `1-2 weeks`) | "Students completing in 1-2 weeks" |

### Chart-Specific Notes

**CompletionTrendChart**: The current data transformation discards the raw ISO date. Must preserve it by adding a `rawDate` field to `chartData` so the click handler can pass the ISO date as `filterValue`:
```js
const chartData = data.map((d) => ({
  date: new Date(d.date).toLocaleDateString(...),
  rawDate: d.date,  // preserve for drill-down
  completions: d.completions,
}));
```

**StepCompletionChart & BottleneckChart**: These receive `data` from `AnalyticsTab` (which includes `data.steps` with step `id`). Each bar maps to a step — the click handler passes `step.id` as `filterValue`. The `chartData` transformation must preserve `id`.

**DeadlineRiskChart, StalledStudentsChart, CohortComparisonChart, CompletionVelocityChart**: These fetch their own data. They accept an `onDrillDown` prop and attach click handlers. No changes to their data fetching.

### Files to Create

- `client/src/pages/admin/StudentDrillDown.jsx` — Slide-out panel component

### Files to Modify

- `server/routes/admin.js` — Fix 4 queries + add new `/analytics/students` endpoint
- `client/src/pages/admin/AnalyticsTab.jsx` — Add drill-down state, render panel, pass callbacks
- `client/src/pages/admin/charts/StepCompletionChart.jsx` — Preserve step ID, add bar click handler
- `client/src/pages/admin/charts/BottleneckChart.jsx` — Preserve step ID, add bar click handler
- `client/src/pages/admin/charts/CohortDistributionChart.jsx` — Add bar click handler
- `client/src/pages/admin/charts/CompletionTrendChart.jsx` — Preserve raw date, add point click handler
- `client/src/pages/admin/charts/DeadlineRiskChart.jsx` — Add row click handler
- `client/src/pages/admin/charts/StalledStudentsChart.jsx` — Add bar click handler
- `client/src/pages/admin/charts/CohortComparisonChart.jsx` — Add bar click handler
- `client/src/pages/admin/charts/CompletionVelocityChart.jsx` — Add bar click handler

## Verification

1. Load analytics tab — bottleneck chart should show non-zero bars reflecting actual completion rates
2. Step completion chart should show accurate percentages
3. Cohort distribution should reflect correct completion counts (with status filter fix)
4. Completion trend should only count completed/waived entries
5. Click a bar on the step completion chart — slide-out panel should appear with the correct student list
6. Click a bar on the bottleneck chart — should show students who HAVEN'T completed that step
7. Click a bar on cohort distribution — should show students in that % bucket
8. Click a point on completion trend — should show students who completed steps that day
9. Click a row on deadline risk — should show at-risk students for that step
10. Click a bar on stalled students — should show students in that inactivity bucket
11. Click a bar on cohort comparison — should show students with that tag
12. Click a bar on completion velocity — should show students in that velocity range
13. Close the panel (X button or click outside) — should return to charts view
14. Panel should show "No students match this filter" when the list is empty
15. Panel should show "Showing 200 of N students" when results exceed 200
