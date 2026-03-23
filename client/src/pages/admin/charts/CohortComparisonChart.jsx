import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function CohortComparisonChart({ termId, api, onDrillDown }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const result = await api.get('/analytics/cohort-comparison', { term_id: termId });
        setData(result);
      } catch (err) {
        console.error('[cohort-comparison]', err);
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
          Cohort Comparison
        </h3>
        <p className="font-body text-xs text-csub-gray mt-1">
          Average completion rate by student population. Use this to identify groups that may need targeted outreach.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="tag"
            tick={{ fontSize: 12, fill: '#6B7280' }}
            angle={-15}
            textAnchor="end"
            height={60}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: '#6B7280' }}
            label={{ value: '%', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
            }}
            cursor={{ fill: 'rgba(0, 53, 148, 0.1)' }}
            formatter={(value) => [`${value}%`, 'Avg Completion']}
          />
          <Bar dataKey="avg_completion_pct" fill="#003594" radius={[8, 8, 0, 0]} cursor="pointer" onClick={(data) => onDrillDown?.({ filterType: 'tag', filterValue: data.tag })} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
