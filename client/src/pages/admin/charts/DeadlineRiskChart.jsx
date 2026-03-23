import { useState, useEffect } from 'react';

export default function DeadlineRiskChart({ termId, api }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const result = await api.get('/analytics/deadline-risk', { term_id: termId, days: 14 });
        setData(result);
      } catch (err) {
        console.error('[deadline-risk]', err);
      } finally {
        setLoading(false);
      }
    };
    if (termId) fetch();
  }, [termId, api]);

  if (loading) return <div className="h-40 bg-gray-50 rounded-lg animate-pulse" />;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="mb-4">
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-csub-blue-dark">
          Deadline Risk
        </h3>
        <p className="font-body text-xs text-csub-gray mt-1">
          Students who haven't completed steps with deadlines in the next 14 days. Reach out to these students before the deadline passes.
        </p>
      </div>

      {data.length === 0 ? (
        <p className="font-body text-sm text-csub-gray">No steps with upcoming deadlines.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-semibold text-csub-blue-dark">Step</th>
                <th className="text-left py-2 px-3 font-semibold text-csub-blue-dark">Deadline</th>
                <th className="text-center py-2 px-3 font-semibold text-csub-blue-dark">At Risk</th>
              </tr>
            </thead>
            <tbody>
              {data.map(step => (
                <tr key={step.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 text-csub-blue-dark">{step.title}</td>
                  <td className="py-2 px-3 text-csub-gray">
                    {new Date(step.deadline_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className="bg-red-100 text-red-700 font-semibold px-2 py-1 rounded-full text-xs">
                      {step.at_risk_count}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
