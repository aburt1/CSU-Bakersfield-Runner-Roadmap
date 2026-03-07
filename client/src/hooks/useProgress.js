import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api';

export function useProgress() {
  const [token, setToken] = useState(() => localStorage.getItem('csub_token'));
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [loading, setLoading] = useState(true);

  // Initialize guest session if needed
  useEffect(() => {
    async function initSession() {
      if (!token) {
        try {
          const res = await fetch(`${API_BASE}/auth/guest`, { method: 'POST' });
          if (res.ok) {
            const data = await res.json();
            localStorage.setItem('csub_token', data.token);
            setToken(data.token);
          }
        } catch {
          console.warn('Server not available, using local storage only');
          setToken('local');
        }
      }
      setLoading(false);
    }
    initSession();
  }, [token]);

  // Fetch progress from server
  useEffect(() => {
    async function fetchProgress() {
      if (!token || token === 'local') {
        // Fallback: load from localStorage
        const saved = localStorage.getItem('csub_progress');
        if (saved) {
          setCompletedSteps(new Set(JSON.parse(saved)));
        }
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/steps/progress`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const progress = await res.json();
          setCompletedSteps(new Set(progress.map((p) => p.step_id)));
        }
      } catch {
        // Fallback to localStorage
        const saved = localStorage.getItem('csub_progress');
        if (saved) {
          setCompletedSteps(new Set(JSON.parse(saved)));
        }
      }
    }

    if (token) fetchProgress();
  }, [token]);

  // Save to localStorage whenever progress changes
  useEffect(() => {
    if (completedSteps.size > 0) {
      localStorage.setItem('csub_progress', JSON.stringify([...completedSteps]));
    }
  }, [completedSteps]);

  const toggleStep = useCallback(
    async (stepId) => {
      const isCompleted = completedSteps.has(stepId);
      const method = isCompleted ? 'DELETE' : 'POST';

      // Optimistic update
      setCompletedSteps((prev) => {
        const next = new Set(prev);
        if (isCompleted) {
          next.delete(stepId);
        } else {
          next.add(stepId);
        }
        return next;
      });

      // Sync with server
      if (token && token !== 'local') {
        try {
          await fetch(`${API_BASE}/steps/${stepId}/complete`, {
            method,
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch {
          // Revert on failure
          setCompletedSteps((prev) => {
            const next = new Set(prev);
            if (isCompleted) {
              next.add(stepId);
            } else {
              next.delete(stepId);
            }
            return next;
          });
        }
      }
    },
    [token, completedSteps]
  );

  return { completedSteps, toggleStep, loading };
}
