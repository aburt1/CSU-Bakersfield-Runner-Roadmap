import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function CompletionVelocityChart({ termId, api, onDrillDown }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const result = await api.get('/analytics/completion-velocity', { term_id: termId });
        setData(result);
      } catch (err) {
        console.error('[completion-velocity]', err);
      } finally {
        setLoading(false);
      }
    };
    if (termId) fetch();
  }, [termId, api]);

  if (loading) return <div className="h-40 bg-gray-50 rounded-lg animate-pulse" />;

  const colors = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#6B7280'];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="mb-4">
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-csub-blue-dark">
          Completion Velocity
        </h3>
        <p className="font-body text-xs text-csub-gray mt-1">
          How quickly students progress from their first completion to their most recent. Longer times may indicate friction in the process.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: 12, fill: '#6B7280' }}
            angle={-15}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#6B7280' }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
            }}
            cursor={{ fill: 'rgba(0, 53, 148, 0.1)' }}
            formatter={(value) => [`${value} students`, 'Count']}
          />
          <Bar dataKey="student_count" radius={[8, 8, 0, 0]} cursor="pointer" onClick={(data) => onDrillDown?.({ filterType: 'velocity_bucket', filterValue: data.bucket })}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
