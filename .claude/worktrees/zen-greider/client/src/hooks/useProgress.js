import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';

const API_BASE = '/api';
const POLL_INTERVAL = 30000; // 30 seconds

// Check if a step applies to a student based on tags
function stepApplies(step, studentTags) {
  const requiredTags = step.required_tags
    ? (typeof step.required_tags === 'string' ? JSON.parse(step.required_tags) : step.required_tags)
    : null;
  const excludedTags = step.excluded_tags
    ? (typeof step.excluded_tags === 'string' ? JSON.parse(step.excluded_tags) : step.excluded_tags)
    : null;
  const requiredTagMode = step.required_tag_mode === 'all' ? 'all' : 'any';

  if (excludedTags && excludedTags.some((tag) => studentTags.includes(tag))) return false;

  if (!requiredTags || requiredTags.length === 0) return true;
  return requiredTagMode === 'all'
    ? requiredTags.every((tag) => studentTags.includes(tag))
    : requiredTags.some((tag) => studentTags.includes(tag));
}

/**
 * Derive rich status for each step based on progress data from server.
 * progressMap: Map<stepId, { status: 'completed'|'waived', completed_at }>
 *
 * Statuses:
 * - completed: student finished it
 * - waived: admin waived it
 * - in_progress: the current active step (first step not completed/waived)
 * - not_started: upcoming steps after the current one
 */
function deriveStepStatuses(steps, progressMap) {
  let foundCurrent = false;
  return steps.map((step) => {
    const progress = progressMap.get(step.id);

    if (progress) {
      return { ...step, status: progress.status || 'completed' };
    }

    if (!foundCurrent) {
      foundCurrent = true;
      return { ...step, status: 'in_progress' };
    }

    return { ...step, status: 'not_started' };
  });
}

function deriveOptionalStepStatuses(steps, progressMap) {
  return steps.map((step) => {
    const progress = progressMap.get(step.id);
    if (progress) {
      return { ...step, status: progress.status || 'completed' };
    }
    return { ...step, status: 'not_started' };
  });
}

export function useProgress() {
  const { token, isAuthenticated } = useAuth();
  const [steps, setSteps] = useState([]);
  const [progressMap, setProgressMap] = useState(new Map());
  const [completedDates, setCompletedDates] = useState({});
  const [studentTags, setStudentTags] = useState([]);
  const [term, setTerm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  // Fetch steps from API
  useEffect(() => {
    async function fetchSteps() {
      try {
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        const res = await fetch(`${API_BASE}/steps`, { headers });
        if (res.ok) {
          const data = await res.json();
          setSteps(data);
        } else {
          setError('Failed to load checklist steps.');
        }
      } catch {
        setError('Unable to connect. Please try again later.');
      }
    }
    fetchSteps();
  }, [token]);

  // Fetch progress + tags from server
  const fetchProgress = async () => {
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/steps/progress`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const map = new Map();
        for (const p of data.progress) {
          map.set(p.step_id, { status: p.status || 'completed', completed_at: p.completed_at });
        }
        setProgressMap(map);
        setCompletedDates(
          Object.fromEntries(data.progress.map((p) => [p.step_id, p.completed_at]))
        );
        setStudentTags(data.tags || []);
        if (data.term) setTerm(data.term);
        setError(null);
      }
    } catch {
      // Server unavailable - keep existing data
    }
  };

  // Initial fetch
  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    fetchProgress().then(() => setLoading(false));
  }, [isAuthenticated, token]);

  // Poll for updates every 30s
  useEffect(() => {
    if (!isAuthenticated) return;

    intervalRef.current = setInterval(fetchProgress, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isAuthenticated, token]);

  // Filter steps based on student tags and derive statuses
  const { requiredSteps, optionalSteps, allSteps } = useMemo(() => {
    const applicable = steps.filter((step) => stepApplies(step, studentTags));
    const required = applicable.filter((step) => step.is_optional !== 1);
    const optional = applicable.filter((step) => step.is_optional === 1);

    const requiredWithStatuses = deriveStepStatuses(required, progressMap);
    const optionalWithStatuses = deriveOptionalStepStatuses(optional, progressMap);

    return {
      requiredSteps: requiredWithStatuses,
      optionalSteps: optionalWithStatuses,
      allSteps: [...requiredWithStatuses, ...optionalWithStatuses],
    };
  }, [steps, studentTags, progressMap]);

  const totalSteps = requiredSteps.length;
  const doneCount = requiredSteps.filter((s) => s.status === 'completed' || s.status === 'waived').length;
  const percentage = totalSteps > 0 ? Math.round((doneCount / totalSteps) * 100) : 0;
  const currentStep = requiredSteps.find((s) => s.status === 'in_progress') || null;
  const allComplete = totalSteps > 0 && doneCount === totalSteps;
  const optionalTotalSteps = optionalSteps.length;
  const optionalCompletedCount = optionalSteps.filter((s) => s.status === 'completed' || s.status === 'waived').length;

  return {
    steps: allSteps,
    requiredSteps,
    optionalSteps,
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
    optionalTotalSteps,
    optionalCompletedCount,
    retry: fetchProgress,
  };
}
