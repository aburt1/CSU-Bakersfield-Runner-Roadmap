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
