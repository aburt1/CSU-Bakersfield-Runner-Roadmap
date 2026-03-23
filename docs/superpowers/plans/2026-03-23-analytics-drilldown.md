# Analytics: Fix Chart Bugs + Student Drill-Down — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix incorrect analytics data caused by missing status filters, then add clickable student drill-down to all 8 analytics charts via a shared slide-out panel with pagination.

**Architecture:** Fix 4 SQL queries by adding `status IN ('completed', 'waived')` filters. Add a single flexible `/analytics/students` backend endpoint that handles all filter types with pagination. Create a shared `StudentDrillDown` slide-out panel component. Update each chart to pass an `onDrillDown` callback with filter context.

**Tech Stack:** React, Recharts, PostgreSQL, Express, framer-motion (for slide-out animation)

**Spec:** `docs/superpowers/specs/2026-03-23-analytics-drilldown-design.md`

---

### Task 1: Fix status filter bugs in analytics SQL queries

**Files:**
- Modify: `server/routes/admin.js:722,744,775,821`

- [ ] **Step 1: Fix step-completion endpoint (line 722)**

Change the LEFT JOIN on line 722 from:
```sql
LEFT JOIN student_progress sp ON sp.step_id = s.id
```
to:
```sql
LEFT JOIN student_progress sp ON sp.step_id = s.id AND sp.status IN ('completed', 'waived')
```

- [ ] **Step 2: Fix completion-trend endpoint (line 744-748)**

Add status filter to the WHERE clause. Change line 748 from:
```sql
WHERE sp.completed_at >= CURRENT_DATE - (${daysParam}::integer * INTERVAL '1 day')
```
to:
```sql
WHERE sp.status IN ('completed', 'waived') AND sp.completed_at >= CURRENT_DATE - (${daysParam}::integer * INTERVAL '1 day')
```

- [ ] **Step 3: Fix bottleneck endpoint (line 775)**

Change the LEFT JOIN on line 775 from:
```sql
LEFT JOIN student_progress sp ON sp.step_id = s.id
```
to:
```sql
LEFT JOIN student_progress sp ON sp.step_id = s.id AND sp.status IN ('completed', 'waived')
```

- [ ] **Step 4: Fix cohort-summary endpoint (line 821-824)**

Add a WHERE clause to the subquery. Change lines 821-824 from:
```sql
SELECT student_id, COUNT(*) as done
FROM student_progress sp
JOIN steps st ON st.id = sp.step_id AND st.is_active = 1 AND COALESCE(st.is_optional, 0) = 0 ${stepFilter}
GROUP BY student_id
```
to:
```sql
SELECT student_id, COUNT(*) as done
FROM student_progress sp
JOIN steps st ON st.id = sp.step_id AND st.is_active = 1 AND COALESCE(st.is_optional, 0) = 0 ${stepFilter}
WHERE sp.status IN ('completed', 'waived')
GROUP BY student_id
```

- [ ] **Step 5: Verify charts show correct data**

Load admin analytics tab. Bottleneck chart should now show non-zero bars. Step completion chart should show matching percentages.

- [ ] **Step 6: Commit**

```bash
git add server/routes/admin.js
git commit -m "fix: add status filter to analytics SQL queries"
```

---

### Task 2: Fix `api.get` to support query parameters

**Files:**
- Modify: `client/src/pages/admin/hooks/useAdminApi.js:25`

**Context:** The current `get` function only accepts a path string. Self-fetching charts (StalledStudentsChart, DeadlineRiskChart, etc.) pass params objects as a second argument, but they're silently dropped. The new StudentDrillDown component requires these params. Fix `get` to build query strings from an optional params object.

- [ ] **Step 1: Update the `get` function**

Change line 25 from:
```js
const get = useCallback((path) => request(path), [request]);
```
to:
```js
const get = useCallback((path, params) => {
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null)
    ).toString();
    if (qs) return request(`${path}?${qs}`);
  }
  return request(path);
}, [request]);
```

- [ ] **Step 2: Verify existing self-fetching charts still work**

Load the analytics tab — StalledStudentsChart, DeadlineRiskChart, CohortComparisonChart, CompletionVelocityChart should all render the same as before (now correctly passing term_id to the backend).

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/admin/hooks/useAdminApi.js
git commit -m "fix: support query params in useAdminApi get function"
```

---

### Task 3: Add `/analytics/students` backend endpoint

**Files:**
- Modify: `server/routes/admin.js` (add new endpoint after line ~927, before cohort-comparison)

- [ ] **Step 1: Add the endpoint**

Add the following endpoint to `server/routes/admin.js` after the stalled-students endpoint (after line 927):

```js
// GET /api/admin/analytics/students?term_id=&filter_type=&filter_value=&page=1&per_page=50
router.get('/analytics/students', async (req, res, next) => {
  try {
    const termId = req.query.term_id ? parseInt(req.query.term_id, 10) : null;
    const filterType = req.query.filter_type;
    const filterValue = req.query.filter_value;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page, 10) || 50));
    const offset = (page - 1) * perPage;

    if (!termId || !filterType) {
      return res.status(400).json({ error: 'term_id and filter_type are required' });
    }

    const totalActiveStepsResult = await req.db.queryOne(
      'SELECT COUNT(*) as count FROM steps WHERE is_active = 1 AND COALESCE(is_optional, 0) = 0 AND term_id = $1',
      [termId]
    );
    const totalActiveSteps = parseInt(totalActiveStepsResult.count);

    let studentQuery = '';
    let countQuery = '';
    let params = [];
    let countParams = [];
    let title = '';

    switch (filterType) {
      case 'step_completed': {
        const step = await req.db.queryOne('SELECT title FROM steps WHERE id = $1', [filterValue]);
        title = `Students who completed ${step?.title || 'this step'}`;
        params = [filterValue, termId, perPage, offset];
        countParams = [filterValue, termId];
        studentQuery = `
          SELECT st.id, st.display_name, st.email, st.emplid
          FROM students st
          JOIN student_progress sp ON sp.student_id = st.id AND sp.step_id = $1 AND sp.status IN ('completed', 'waived')
          WHERE st.term_id = $2
          ORDER BY st.display_name
          LIMIT $3 OFFSET $4`;
        countQuery = `
          SELECT COUNT(*) as count FROM students st
          JOIN student_progress sp ON sp.student_id = st.id AND sp.step_id = $1 AND sp.status IN ('completed', 'waived')
          WHERE st.term_id = $2`;
        break;
      }
      case 'step_not_completed': {
        const step = await req.db.queryOne('SELECT title FROM steps WHERE id = $1', [filterValue]);
        title = `Students who haven't completed ${step?.title || 'this step'}`;
        params = [filterValue, termId, perPage, offset];
        countParams = [filterValue, termId];
        studentQuery = `
          SELECT st.id, st.display_name, st.email, st.emplid
          FROM students st
          LEFT JOIN student_progress sp ON sp.student_id = st.id AND sp.step_id = $1 AND sp.status IN ('completed', 'waived')
          WHERE st.term_id = $2 AND sp.id IS NULL
          ORDER BY st.display_name
          LIMIT $3 OFFSET $4`;
        countQuery = `
          SELECT COUNT(*) as count FROM students st
          LEFT JOIN student_progress sp ON sp.student_id = st.id AND sp.step_id = $1 AND sp.status IN ('completed', 'waived')
          WHERE st.term_id = $2 AND sp.id IS NULL`;
        break;
      }
      case 'cohort_bucket': {
        title = `Students at ${filterValue} completion`;
        const bucketRanges = {
          '0%': [0, 0],
          '1-25%': [0, 0.25],
          '26-50%': [0.251, 0.50],
          '51-75%': [0.501, 0.75],
          '76-100%': [0.751, 1.0],
        };
        const range = bucketRanges[filterValue];
        if (!range) return res.status(400).json({ error: 'Invalid cohort_bucket value' });
        const [lo, hi] = range;
        params = [termId, termId, totalActiveSteps || 1, lo, hi, perPage, offset];
        countParams = [termId, termId, totalActiveSteps || 1, lo, hi];
        const bucketCondition = filterValue === '0%'
          ? 'HAVING COALESCE(SUM(CASE WHEN sp.status IN (\'completed\', \'waived\') THEN 1 ELSE 0 END), 0) = 0'
          : `HAVING (SUM(CASE WHEN sp.status IN ('completed', 'waived') THEN 1 ELSE 0 END)::float / $3) > $4
             AND (SUM(CASE WHEN sp.status IN ('completed', 'waived') THEN 1 ELSE 0 END)::float / $3) <= $5`;
        studentQuery = `
          SELECT st.id, st.display_name, st.email, st.emplid
          FROM students st
          LEFT JOIN student_progress sp ON sp.student_id = st.id
            AND sp.step_id IN (SELECT id FROM steps WHERE is_active = 1 AND COALESCE(is_optional, 0) = 0 AND term_id = $2)
          WHERE st.term_id = $1
          GROUP BY st.id, st.display_name, st.email, st.emplid
          ${bucketCondition}
          ORDER BY st.display_name
          LIMIT $6 OFFSET $7`;
        countQuery = `
          SELECT COUNT(*) as count FROM (
            SELECT st.id
            FROM students st
            LEFT JOIN student_progress sp ON sp.student_id = st.id
              AND sp.step_id IN (SELECT id FROM steps WHERE is_active = 1 AND COALESCE(is_optional, 0) = 0 AND term_id = $2)
            WHERE st.term_id = $1
            GROUP BY st.id
            ${bucketCondition}
          ) sub`;
        break;
      }
      case 'tag': {
        title = `${filterValue.charAt(0).toUpperCase() + filterValue.slice(1)} students`;
        const tagPattern = `%${filterValue}%`;
        params = [termId, tagPattern, perPage, offset];
        countParams = [termId, tagPattern];
        studentQuery = `
          SELECT st.id, st.display_name, st.email, st.emplid
          FROM students st
          WHERE st.term_id = $1 AND st.tags LIKE $2
          ORDER BY st.display_name
          LIMIT $3 OFFSET $4`;
        countQuery = `
          SELECT COUNT(*) as count FROM students st
          WHERE st.term_id = $1 AND st.tags LIKE $2`;
        break;
      }
      case 'stalled': {
        title = `Students stalled ${filterValue}`;
        const stalledRanges = {
          '7-14 days': [7, 14],
          '2-4 weeks': [15, 28],
          '1-3 months': [29, 90],
          '3+ months': [91, 99999],
        };
        const sRange = stalledRanges[filterValue];
        if (!sRange) return res.status(400).json({ error: 'Invalid stalled value' });
        const [minDays, maxDays] = sRange;
        params = [termId, minDays, maxDays, perPage, offset];
        countParams = [termId, minDays, maxDays];
        studentQuery = `
          SELECT st.id, st.display_name, st.email, st.emplid
          FROM students st
          LEFT JOIN student_progress sp ON sp.student_id = st.id
          WHERE st.term_id = $1
          GROUP BY st.id, st.display_name, st.email, st.emplid
          HAVING (
            COUNT(CASE WHEN sp.status = 'completed' THEN 1 END) = 0
            AND $2 <= (EXTRACT(DAY FROM NOW() - st.created_at))
            AND (EXTRACT(DAY FROM NOW() - st.created_at)) <= $3
          ) OR (
            MAX(sp.completed_at) IS NOT NULL
            AND $2 <= EXTRACT(DAY FROM NOW() - MAX(sp.completed_at))
            AND EXTRACT(DAY FROM NOW() - MAX(sp.completed_at)) <= $3
          )
          ORDER BY st.display_name
          LIMIT $4 OFFSET $5`;
        countQuery = `
          SELECT COUNT(*) as count FROM (
            SELECT st.id
            FROM students st
            LEFT JOIN student_progress sp ON sp.student_id = st.id
            WHERE st.term_id = $1
            GROUP BY st.id, st.created_at
            HAVING (
              COUNT(CASE WHEN sp.status = 'completed' THEN 1 END) = 0
              AND $2 <= (EXTRACT(DAY FROM NOW() - st.created_at))
              AND (EXTRACT(DAY FROM NOW() - st.created_at)) <= $3
            ) OR (
              MAX(sp.completed_at) IS NOT NULL
              AND $2 <= EXTRACT(DAY FROM NOW() - MAX(sp.completed_at))
              AND EXTRACT(DAY FROM NOW() - MAX(sp.completed_at)) <= $3
            )
          ) sub`;
        break;
      }
      case 'deadline_risk': {
        const step = await req.db.queryOne('SELECT title FROM steps WHERE id = $1', [filterValue]);
        title = `At-risk students for ${step?.title || 'this step'}`;
        params = [filterValue, termId, perPage, offset];
        countParams = [filterValue, termId];
        studentQuery = `
          SELECT st.id, st.display_name, st.email, st.emplid
          FROM students st
          LEFT JOIN student_progress sp ON sp.step_id = $1 AND sp.student_id = st.id AND sp.status IN ('completed', 'waived')
          WHERE st.term_id = $2 AND sp.id IS NULL
          ORDER BY st.display_name
          LIMIT $3 OFFSET $4`;
        countQuery = `
          SELECT COUNT(*) as count FROM students st
          LEFT JOIN student_progress sp ON sp.step_id = $1 AND sp.student_id = st.id AND sp.status IN ('completed', 'waived')
          WHERE st.term_id = $2 AND sp.id IS NULL`;
        break;
      }
      case 'velocity_bucket': {
        title = `Students completing in ${filterValue}`;
        const velRanges = {
          '1-3 days': [0, 3],
          '4-7 days': [4, 7],
          '1-2 weeks': [8, 14],
          '2-4 weeks': [15, 28],
          '4+ weeks': [29, 99999],
        };
        const vRange = velRanges[filterValue];
        if (!vRange) return res.status(400).json({ error: 'Invalid velocity_bucket value' });
        const [minD, maxD] = vRange;
        params = [termId, minD, maxD, perPage, offset];
        countParams = [termId, minD, maxD];
        studentQuery = `
          SELECT st.id, st.display_name, st.email, st.emplid
          FROM students st
          JOIN (
            SELECT sp.student_id,
              EXTRACT(DAY FROM MAX(sp.completed_at) - MIN(sp.completed_at)) as days_elapsed
            FROM student_progress sp
            WHERE sp.status = 'completed'
            GROUP BY sp.student_id
          ) vel ON vel.student_id = st.id AND vel.days_elapsed >= $2 AND vel.days_elapsed <= $3
          WHERE st.term_id = $1
          ORDER BY st.display_name
          LIMIT $4 OFFSET $5`;
        countQuery = `
          SELECT COUNT(*) as count FROM students st
          JOIN (
            SELECT sp.student_id,
              EXTRACT(DAY FROM MAX(sp.completed_at) - MIN(sp.completed_at)) as days_elapsed
            FROM student_progress sp
            WHERE sp.status = 'completed'
            GROUP BY sp.student_id
          ) vel ON vel.student_id = st.id AND vel.days_elapsed >= $2 AND vel.days_elapsed <= $3
          WHERE st.term_id = $1`;
        break;
      }
      case 'trend_date': {
        const dateStr = new Date(filterValue).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        title = `Completions on ${dateStr}`;
        params = [filterValue, termId, perPage, offset];
        countParams = [filterValue, termId];
        studentQuery = `
          SELECT DISTINCT st.id, st.display_name, st.email, st.emplid
          FROM students st
          JOIN student_progress sp ON sp.student_id = st.id AND DATE(sp.completed_at) = $1::date AND sp.status IN ('completed', 'waived')
          JOIN steps s ON s.id = sp.step_id AND COALESCE(s.is_optional, 0) = 0
          WHERE st.term_id = $2
          ORDER BY st.display_name
          LIMIT $3 OFFSET $4`;
        countQuery = `
          SELECT COUNT(DISTINCT st.id) as count
          FROM students st
          JOIN student_progress sp ON sp.student_id = st.id AND DATE(sp.completed_at) = $1::date AND sp.status IN ('completed', 'waived')
          JOIN steps s ON s.id = sp.step_id AND COALESCE(s.is_optional, 0) = 0
          WHERE st.term_id = $2`;
        break;
      }
      default:
        return res.status(400).json({ error: `Unknown filter_type: ${filterType}` });
    }

    const [students, totalResult] = await Promise.all([
      req.db.queryAll(studentQuery, params),
      req.db.queryOne(countQuery, countParams),
    ]);
    const total = parseInt(totalResult.count);

    // Enrich with completion counts
    const studentIds = students.map(s => s.id);
    let completionMap = {};
    if (studentIds.length > 0) {
      const placeholders = studentIds.map((_, i) => `$${i + 1}`).join(',');
      const completions = await req.db.queryAll(
        `SELECT student_id, COUNT(*) as done
         FROM student_progress
         WHERE student_id IN (${placeholders}) AND status IN ('completed', 'waived')
         GROUP BY student_id`,
        studentIds
      );
      completionMap = Object.fromEntries(completions.map(c => [c.student_id, parseInt(c.done)]));
    }

    res.json({
      title,
      students: students.map(s => ({
        ...s,
        completed_count: completionMap[s.id] || 0,
        total_steps: totalActiveSteps,
        completion_pct: totalActiveSteps > 0 ? Math.round(((completionMap[s.id] || 0) / totalActiveSteps) * 100) : 0,
      })),
      total,
      page,
      per_page: perPage,
    });
  } catch (err) { next(err); }
});
```

- [ ] **Step 2: Verify endpoint responds**

Navigate to admin, open browser dev tools Network tab, manually call `/api/admin/analytics/students?term_id=1&filter_type=step_completed&filter_value=1` — should return a JSON response with students.

- [ ] **Step 3: Commit**

```bash
git add server/routes/admin.js
git commit -m "feat: add /analytics/students endpoint for chart drill-down"
```

---

### Task 4: Create StudentDrillDown slide-out panel component

**Files:**
- Create: `client/src/pages/admin/StudentDrillDown.jsx`

- [ ] **Step 1: Create the component**

```jsx
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function StudentDrillDown({ open, onClose, filterType, filterValue, termId, api }) {
  const [students, setStudents] = useState([]);
  const [title, setTitle] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open || !filterType) return;
    setStudents([]);
    setPage(1);
    setLoading(true);
    api.get('/analytics/students', { term_id: termId, filter_type: filterType, filter_value: filterValue, page: 1, per_page: 50 })
      .then((data) => {
        setStudents(data.students);
        setTitle(data.title);
        setTotal(data.total);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, filterType, filterValue, termId, api]);

  const loadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const data = await api.get('/analytics/students', { term_id: termId, filter_type: filterType, filter_value: filterValue, page: nextPage, per_page: 50 });
      setStudents((prev) => [...prev, ...data.students]);
      setPage(nextPage);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  const hasMore = students.length < total;

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/30 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            ref={panelRef}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl z-50 flex flex-col"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-gray-200">
              <div className="pr-4">
                <h2 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide">
                  {title}
                </h2>
                <span className="font-body text-xs text-csub-gray mt-1 block">
                  {total} {total === 1 ? 'student' : 'students'}
                </span>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Student list */}
            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-csub-blue border-t-transparent rounded-full animate-spin" />
                </div>
              ) : students.length === 0 ? (
                <p className="font-body text-sm text-csub-gray text-center py-8">No students match this filter</p>
              ) : (
                <>
                  <div className="space-y-2">
                    {students.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-sm font-semibold text-csub-blue-dark truncate">{s.display_name}</p>
                          <p className="font-body text-xs text-csub-gray truncate">{s.email}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-csub-blue rounded-full"
                              style={{ width: `${s.completion_pct}%` }}
                            />
                          </div>
                          <span className="font-body text-xs text-csub-gray w-8 text-right">{s.completion_pct}%</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {hasMore && (
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="w-full mt-4 py-2.5 font-body text-sm font-semibold text-csub-blue border border-csub-blue/20 rounded-lg hover:bg-csub-blue/5 transition-colors disabled:opacity-50"
                    >
                      {loadingMore ? 'Loading...' : `Load more (${students.length} of ${total})`}
                    </button>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/pages/admin/StudentDrillDown.jsx
git commit -m "feat: create StudentDrillDown slide-out panel component"
```

---

### Task 5: Wire drill-down state in AnalyticsTab

**Files:**
- Modify: `client/src/pages/admin/AnalyticsTab.jsx`

- [ ] **Step 1: Add import and state**

Add import at the top (after existing imports):
```jsx
import StudentDrillDown from './StudentDrillDown';
```

Add state inside the component (after `const [loading, setLoading] = useState(true);`):
```jsx
const [drillDown, setDrillDown] = useState(null);
```

- [ ] **Step 2: Add `onDrillDown` prop to each chart**

Update each chart component in the JSX to pass the callback. Changes:

For `StepCompletionChart` (line 67):
```jsx
<StepCompletionChart data={stepCompletion} onDrillDown={setDrillDown} />
```

For `BottleneckChart` (line 105):
```jsx
<BottleneckChart data={bottlenecks} onDrillDown={setDrillDown} />
```

For `CohortDistributionChart` (line 115):
```jsx
<CohortDistributionChart data={cohort} onDrillDown={setDrillDown} />
```

For `CompletionTrendChart` (line 96):
```jsx
<CompletionTrendChart data={trend} onDrillDown={setDrillDown} />
```

For `DeadlineRiskChart` (line 126):
```jsx
<DeadlineRiskChart termId={termId} api={api} onDrillDown={setDrillDown} />
```

For `StalledStudentsChart` (line 131):
```jsx
<StalledStudentsChart termId={termId} api={api} onDrillDown={setDrillDown} />
```

For `CohortComparisonChart` (line 136):
```jsx
<CohortComparisonChart termId={termId} api={api} onDrillDown={setDrillDown} />
```

For `CompletionVelocityChart` (line 137):
```jsx
<CompletionVelocityChart termId={termId} api={api} onDrillDown={setDrillDown} />
```

- [ ] **Step 3: Render StudentDrillDown panel**

Add at the end of the component JSX, just before the closing `</div>`:

```jsx
      <StudentDrillDown
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        filterType={drillDown?.filterType}
        filterValue={drillDown?.filterValue}
        termId={termId}
        api={api}
      />
```

- [ ] **Step 4: Verify app compiles**

Check Vite dev server — no build errors.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/admin/AnalyticsTab.jsx
git commit -m "feat: wire drill-down state and panel in AnalyticsTab"
```

---

### Task 6: Add click handlers to StepCompletionChart and BottleneckChart

**Files:**
- Modify: `client/src/pages/admin/charts/StepCompletionChart.jsx`
- Modify: `client/src/pages/admin/charts/BottleneckChart.jsx`

- [ ] **Step 1: Update StepCompletionChart**

Add `onDrillDown` to props. Preserve step `id` in chartData. Add `onClick` to `Bar`. Replace the full component:

```jsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function StepCompletionChart({ data, onDrillDown }) {
  if (!data?.steps?.length) return <p className="font-body text-sm text-csub-gray text-center py-4">No data</p>;

  const chartData = data.steps.map((s) => ({
    id: s.id,
    name: s.title.length > 20 ? s.title.slice(0, 18) + '...' : s.title,
    fullTitle: s.title,
    pct: data.totalStudents > 0 ? Math.round((s.completed_count / data.totalStudents) * 100) : 0,
    count: s.completed_count,
    total: data.totalStudents,
  }));

  const handleClick = (entry) => {
    if (onDrillDown) onDrillDown({ filterType: 'step_completed', filterValue: entry.id });
  };

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={11} />
          <YAxis type="category" dataKey="name" width={140} fontSize={11} tick={{ fill: '#001A70' }} />
          <Tooltip
            formatter={(value, name, props) => [`${props.payload.count}/${props.payload.total} (${value}%)`, 'Completion']}
            labelFormatter={(label) => chartData.find(d => d.name === label)?.fullTitle || label}
          />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} onClick={(data) => handleClick(data)} className="cursor-pointer">
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.pct === 100 ? '#FFC72C' : '#003594'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: Update BottleneckChart**

Add `onDrillDown` to props. Preserve step `id` in chartData. Add `onClick` to `Bar`. Replace the full component:

```jsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function BottleneckChart({ data, onDrillDown }) {
  if (!data?.steps?.length) return <p className="font-body text-sm text-csub-gray text-center py-4">No data</p>;

  const chartData = data.steps.map((s) => ({
    id: s.id,
    name: s.title.length > 25 ? s.title.slice(0, 23) + '...' : s.title,
    fullTitle: s.title,
    pct: s.completion_pct,
    count: s.completed_count,
    total: data.totalStudents,
  }));

  const getColor = (pct) => {
    if (pct <= 25) return '#DC2626';
    if (pct <= 50) return '#F59E0B';
    return '#003594';
  };

  const handleClick = (entry) => {
    if (onDrillDown) onDrillDown({ filterType: 'step_not_completed', filterValue: entry.id });
  };

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" fontSize={10} interval={0} angle={-15} textAnchor="end" height={50} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={11} />
          <Tooltip
            formatter={(value, name, props) => [`${props.payload.count}/${props.payload.total} (${value}%)`, 'Completion']}
            labelFormatter={(label) => chartData.find(d => d.name === label)?.fullTitle || label}
          />
          <Bar dataKey="pct" radius={[4, 4, 0, 0]} onClick={(data) => handleClick(data)} className="cursor-pointer">
            {chartData.map((entry, i) => (
              <Cell key={i} fill={getColor(entry.pct)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Verify clicking a bar opens the panel**

Click a bar on Step Completion chart — panel should slide in with student list.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/charts/StepCompletionChart.jsx client/src/pages/admin/charts/BottleneckChart.jsx
git commit -m "feat: add drill-down click handlers to step completion and bottleneck charts"
```

---

### Task 7: Add click handlers to CohortDistributionChart and CompletionTrendChart

**Files:**
- Modify: `client/src/pages/admin/charts/CohortDistributionChart.jsx`
- Modify: `client/src/pages/admin/charts/CompletionTrendChart.jsx`

- [ ] **Step 1: Update CohortDistributionChart**

Add `onDrillDown` to props and `onClick` to `Bar`. Change the function signature and add handler:

```jsx
export default function CohortDistributionChart({ data, onDrillDown }) {
```

Add before the return:
```jsx
  const handleClick = (entry) => {
    if (onDrillDown) onDrillDown({ filterType: 'cohort_bucket', filterValue: entry.name });
  };
```

Change the `<Bar>` tag (line 37) to:
```jsx
<Bar dataKey="value" radius={[4, 4, 0, 0]} onClick={(data) => handleClick(data)} className="cursor-pointer">
```

- [ ] **Step 2: Update CompletionTrendChart**

Add `onDrillDown` to props. Preserve `rawDate` in chartData. Add `onClick` to `Line` dots. Replace full component:

```jsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function CompletionTrendChart({ data, onDrillDown }) {
  if (!data?.length) return <p className="font-body text-sm text-csub-gray text-center py-4">No data</p>;

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    rawDate: d.date,
    completions: d.completions,
  }));

  const handleClick = (point) => {
    if (onDrillDown && point?.payload?.rawDate) {
      onDrillDown({ filterType: 'trend_date', filterValue: point.payload.rawDate });
    }
  };

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" fontSize={11} />
          <YAxis fontSize={11} allowDecimals={false} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="completions"
            stroke="#003594"
            strokeWidth={2}
            dot={{ fill: '#FFC72C', r: 4, className: 'cursor-pointer' }}
            activeDot={{ r: 6, fill: '#FFC72C', onClick: (e, payload) => handleClick(payload) }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Verify both charts open drill-down panel on click**

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/charts/CohortDistributionChart.jsx client/src/pages/admin/charts/CompletionTrendChart.jsx
git commit -m "feat: add drill-down click handlers to cohort distribution and trend charts"
```

---

### Task 8: Add click handlers to DeadlineRiskChart and StalledStudentsChart

**Files:**
- Modify: `client/src/pages/admin/charts/DeadlineRiskChart.jsx`
- Modify: `client/src/pages/admin/charts/StalledStudentsChart.jsx`

- [ ] **Step 1: Update DeadlineRiskChart**

Add `onDrillDown` to props. Make each table row clickable. Change function signature:

```jsx
export default function DeadlineRiskChart({ termId, api, onDrillDown }) {
```

Replace the `<tr>` inside `tbody` (line 48) with:
```jsx
                <tr
                  key={step.id}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => onDrillDown && onDrillDown({ filterType: 'deadline_risk', filterValue: step.id })}
                >
```

- [ ] **Step 2: Update StalledStudentsChart**

Add `onDrillDown` to props. Preserve bucket labels. Add `onClick` to `Bar`. Change function signature:

```jsx
export default function StalledStudentsChart({ termId, api, onDrillDown }) {
```

Add before the return:
```jsx
  const handleClick = (entry) => {
    if (onDrillDown) onDrillDown({ filterType: 'stalled', filterValue: entry.bucket });
  };
```

Change the `<Bar>` tag (line 80) to:
```jsx
<Bar dataKey="student_count" fill="#DC2626" radius={[8, 8, 0, 0]} onClick={(data) => handleClick(data)} className="cursor-pointer" />
```

- [ ] **Step 3: Verify both charts work**

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/charts/DeadlineRiskChart.jsx client/src/pages/admin/charts/StalledStudentsChart.jsx
git commit -m "feat: add drill-down click handlers to deadline risk and stalled students charts"
```

---

### Task 9: Add click handlers to CohortComparisonChart and CompletionVelocityChart

**Files:**
- Modify: `client/src/pages/admin/charts/CohortComparisonChart.jsx`
- Modify: `client/src/pages/admin/charts/CompletionVelocityChart.jsx`

- [ ] **Step 1: Update CohortComparisonChart**

Add `onDrillDown` to props. Add `onClick` to `Bar`. Change function signature:

```jsx
export default function CohortComparisonChart({ termId, api, onDrillDown }) {
```

Add before the return:
```jsx
  const handleClick = (entry) => {
    if (onDrillDown) onDrillDown({ filterType: 'tag', filterValue: entry.tag });
  };
```

Change the `<Bar>` tag (line 59) to:
```jsx
<Bar dataKey="avg_completion_pct" fill="#003594" radius={[8, 8, 0, 0]} onClick={(data) => handleClick(data)} className="cursor-pointer" />
```

- [ ] **Step 2: Update CompletionVelocityChart**

Add `onDrillDown` to props. Add `onClick` to `Bar`. Change function signature:

```jsx
export default function CompletionVelocityChart({ termId, api, onDrillDown }) {
```

Add before the return:
```jsx
  const handleClick = (entry) => {
    if (onDrillDown) onDrillDown({ filterType: 'velocity_bucket', filterValue: entry.bucket });
  };
```

Change the `<Bar>` tag (line 60) to:
```jsx
<Bar dataKey="student_count" radius={[8, 8, 0, 0]} onClick={(data) => handleClick(data)} className="cursor-pointer">
```

- [ ] **Step 3: Verify both charts work**

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/admin/charts/CohortComparisonChart.jsx client/src/pages/admin/charts/CompletionVelocityChart.jsx
git commit -m "feat: add drill-down click handlers to cohort comparison and velocity charts"
```

---

### Task 10: End-to-end verification

- [ ] **Step 1: Verify bug fixes** — Bottleneck chart shows non-zero bars; step completion shows matching percentages
- [ ] **Step 2: Click StepCompletionChart bar** — Panel shows students who completed that step
- [ ] **Step 3: Click BottleneckChart bar** — Panel shows students who HAVEN'T completed that step
- [ ] **Step 4: Click CohortDistributionChart bar** — Panel shows students in that % bucket
- [ ] **Step 5: Click CompletionTrendChart point** — Panel shows students who completed steps on that day
- [ ] **Step 6: Click DeadlineRiskChart row** — Panel shows at-risk students for that step
- [ ] **Step 7: Click StalledStudentsChart bar** — Panel shows stalled students in that bucket
- [ ] **Step 8: Click CohortComparisonChart bar** — Panel shows students with that tag
- [ ] **Step 9: Click CompletionVelocityChart bar** — Panel shows students in that velocity bucket
- [ ] **Step 10: Test panel close** — X button and click-outside both close the panel
- [ ] **Step 11: Test empty state** — Panel shows "No students match this filter" when appropriate
- [ ] **Step 12: Test Load More** — If a filter has >50 students, "Load more" button appears and appends next page
