import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import type { Step, StepWithStatus, StepStatus, ProgressEntry, ProgressResponse, Term } from '../types/api.js';

const API_BASE = '/api';
const POLL_INTERVAL = 30000; // 30 seconds

interface ProgressMapEntry {
  status: StepStatus;
  completed_at: string | null;
}

// Check if a step applies to a student based on tags
function stepApplies(step: Step, studentTags: string[]): boolean {
  const requiredTags: string[] | null = step.required_tags
    ? (typeof step.required_tags === 'string' ? JSON.parse(step.required_tags) : step.required_tags)
    : null;
  const excludedTags: string[] | null = step.excluded_tags
    ? (typeof step.excluded_tags === 'string' ? JSON.parse(step.excluded_tags) : step.excluded_tags)
    : null;
  const requiredTagMode: 'all' | 'any' = step.required_tag_mode === 'all' ? 'all' : 'any';

  if (excludedTags && excludedTags.some((tag) => studentTags.includes(tag))) return false;

  if (!requiredTags || requiredTags.length === 0) return true;
  return requiredTagMode === 'all'
    ? requiredTags.every((tag) => studentTags.includes(tag))
    : requiredTags.some((tag) => studentTags.includes(tag));
}

/**
 * Single-pass status derivation for all steps (required + optional merged).
 * Required steps follow progression: first incomplete = in_progress, rest = not_started.
 * Optional steps skip progression: completed/waived from progress, otherwise not_started.
 */
function deriveAllStepStatuses(
  steps: Step[],
  progressMap: Map<number, ProgressMapEntry>,
): StepWithStatus[] {
  let foundCurrent = false;
  return steps.map((step) => {
    const progress = progressMap.get(step.id);

    if (step.is_optional === 1) {
      // Optional: no progression, just completed/waived/not_started
      if (progress) return { ...step, status: progress.status };
      return { ...step, status: 'not_started' as const };
    }

    // Required: progression chain
    if (progress) return { ...step, status: progress.status };
    if (!foundCurrent) {
      foundCurrent = true;
      return { ...step, status: 'in_progress' as const };
    }
    return { ...step, status: 'not_started' as const };
  });
}

export interface UseProgressReturn {
  steps: StepWithStatus[];
  completedDates: Record<string, string | null>;
  studentTags: string[];
  term: Term | null;
  loading: boolean;
  error: string | null;
  totalSteps: number;
  completedCount: number;
  percentage: number;
  currentStep: StepWithStatus | null;
  allComplete: boolean;
  retry: () => Promise<void>;
}

export function useProgress(): UseProgressReturn {
  const { token, isAuthenticated } = useAuth();
  const [steps, setSteps] = useState<Step[]>([]);
  const [progressMap, setProgressMap] = useState<Map<number, ProgressMapEntry>>(new Map());
  const [completedDates, setCompletedDates] = useState<Record<string, string | null>>({});
  const [studentTags, setStudentTags] = useState<string[]>([]);
  const [term, setTerm] = useState<Term | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch steps from API
  useEffect(() => {
    async function fetchSteps() {
      try {
        const headers: HeadersInit | undefined = token ? { Authorization: `Bearer ${token}` } : undefined;
        const res = await fetch(`${API_BASE}/steps`, { headers });
        if (res.ok) {
          const data: Step[] = await res.json();
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
  const fetchProgress = async (): Promise<void> => {
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/steps/progress`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: ProgressResponse = await res.json();
        const map = new Map<number, ProgressMapEntry>();
        for (const p of data.progress) {
          map.set(p.step_id, {
            status: (p.status || 'completed') as StepStatus,
            completed_at: p.completed_at,
          });
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

  // Filter steps based on student tags and derive statuses (single merged list)
  const allSteps = useMemo(() => {
    const applicable = steps.filter((step) => stepApplies(step, studentTags));
    return deriveAllStepStatuses(applicable, progressMap);
  }, [steps, studentTags, progressMap]);

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
}
