import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthProvider';

const API_BASE = '/api';
const POLL_INTERVAL = 30000; // 30 seconds

export function useProgress() {
  const { token, isAuthenticated } = useAuth();
  const [steps, setSteps] = useState([]);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [studentTags, setStudentTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef(null);

  // Fetch steps from API
  useEffect(() => {
    async function fetchSteps() {
      try {
        const res = await fetch(`${API_BASE}/steps`);
        if (res.ok) {
          const data = await res.json();
          setSteps(data);
        }
      } catch {
        // Server unavailable
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
        setStudentTags(data.tags || []);
      }
    } catch {
      // Server unavailable
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

  return { steps, completedSteps, studentTags, loading };
}
