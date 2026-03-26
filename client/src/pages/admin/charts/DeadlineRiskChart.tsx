import { useState, useEffect } from 'react';

interface AdminApi {
  get: (path: string, params?: Record<string, any>) => Promise<any>;
  post: (path: string, body?: any) => Promise<any>;
  put: (path: string, body?: any) => Promise<any>;
  del: (path: string, body?: any) => Promise<any>;
  raw: (path: string, options?: any) => Promise<Response>;
}

interface RiskStep {
  id: number;
  title: string;
  deadline_date: string;
  at_risk_count: number;
}

interface DrillDownPayload {
  filterType: string;
  filterValue: any;
}

interface Props {
  termId: number | null;
  api: AdminApi;
  onDrillDown?: (payload: DrillDownPayload) => void;
}

export default function DeadlineRiskChart({ termId, api, onDrillDown }: Props) {
  const [data, setData] = useState<RiskStep[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await api.get('/analytics/deadline-risk', { term_id: termId, days: 14 });
        setData(result);
      } catch (err) {
        console.error('[deadline-risk]', err);
      } finally {
        setLoading(false);
      }
    };
    if (termId) fetchData();
  }, [termId, api]);

  if (loading) return <div className="h-40 bg-gray-50 rounded-xl animate-pulse" />;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <div className="mb-4">
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-csub-blue-dark">
          Deadline Risk
        </h3>
        <p className="font-body text-xs text-csub-gray mt-1">
          Steps with deadlines in the next 14 days and students who haven't completed them yet.
        </p>
      </div>

      {data.length === 0 ? (
        <p className="font-body text-sm text-csub-gray">No steps with upcoming deadlines.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-body">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-3 font-semibold text-csub-blue-dark uppercase text-xs tracking-wide">Step</th>
                <th className="text-left py-2 px-3 font-semibold text-csub-blue-dark uppercase text-xs tracking-wide">Deadline</th>
                <th className="text-center py-2 px-3 font-semibold text-csub-blue-dark uppercase text-xs tracking-wide">At Risk</th>
              </tr>
            </thead>
            <tbody>
              {data.map((step) => (
                <tr key={step.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => onDrillDown?.({ filterType: 'deadline_risk', filterValue: step.id })}>
                  <td className="py-2.5 px-3 text-csub-blue-dark">{step.title}</td>
                  <td className="py-2.5 px-3 text-csub-gray">
                    {new Date(step.deadline_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="bg-red-100 text-red-700 font-semibold px-2 py-0.5 rounded-full text-xs">
                      {step.at_risk_count} {step.at_risk_count === 1 ? 'student' : 'students'}
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
