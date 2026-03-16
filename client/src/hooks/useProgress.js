import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';

const API_BASE = '/api';
const POLL_INTERVAL = 30000; // 30 seconds

// Check if a step applies to a student based on tags
function stepApplies(step, studentTags) {
  const requiredTags = step.required_tags
    ? (typeof step.required_tags === 'string' ? JSON.parse(step.required_tags) : step.required_tags)
    : null;

  if (!requiredTags || requiredTags.length === 0) return true;
  return requiredTags.some((tag) => studentTags.includes(tag));
}

/**
 * Derive rich status for each step:
 * - completed: student finished it
 * - waived: admin waived it (future: separate flag)
 * - in_progress: the current active step (first non-completed step)
 * - locked: step is after the current step and has implicit prerequisite
 * - not_started: step is available but not the current focus
 *
 * For now, we treat steps as sequential: everything before the first incomplete
 * is completed, the first incomplete is in_progress, and the rest are not_started
 * (not locked, since students can browse ahead).
 */
function deriveStepStatuses(steps, completedSet) {
  let foundCurrent = false;
  return steps.map((step, index) => {
    const isCompleted = completedSet.has(step.id);

    if (isCompleted) {
      return { ...step, status: 'completed' };
    }

    if (!foundCurrent) {
      foundCurrent = true;
      return { ...step, status: 'in_progress' };
    }

    return { ...step, status: 'not_started' };
  });
}

export function useProgress() {
  const { token, isAuthenticated } = useAuth();
  const [steps, setSteps] = useState([]);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [completedDates, setCompletedDates] = useState({});
  const [studentTags, setStudentTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  // Fetch steps from API
  useEffect(() => {
    async function fetchSteps() {
      try {
        const res = await fetch(`${API_BASE}/steps`);
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
  }, []);

  // Fetch progress + tags from server
  const fetchProgress = async () => {
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/steps/progress`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCompletedSteps(new Set(data.progress.map((p) => p.step_id)));
        setCompletedDates(
          Object.fromEntries(data.progress.map((p) => [p.step_id, p.completed_at]))
        );
        setStudentTags(data.tags || []);
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
  const enrichedSteps = useMemo(() => {
    const applicable = steps.filter((step) => stepApplies(step, studentTags));
    return deriveStepStatuses(applicable, completedSteps);
  }, [steps, studentTags, completedSteps]);

  const totalSteps = enrichedSteps.length;
  const completedCount = enrichedSteps.filter((s) => s.status === 'completed').length;
  const percentage = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
  const currentStep = enrichedSteps.find((s) => s.status === 'in_progress') || null;
  const allComplete = totalSteps > 0 && completedCount === totalSteps;

  return {
    steps: enrichedSteps,
    completedSteps,
    completedDates,
    studentTags,
    loading,
    error,
    totalSteps,
    completedCount,
    percentage,
    currentStep,
    allComplete,
    retry: fetchProgress,
  };
}
