import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function StalledStudentsChart({ termId, api }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const students = await api.get('/analytics/stalled-students', { term_id: termId, days: 7 });

        // Group into buckets
        const buckets = {
          '7-14 days': 0,
          '2-4 weeks': 0,
          '1-3 months': 0,
          '3+ months': 0,
        };

        const now = Date.now();
        for (const student of students) {
          if (!student.last_completion_date) {
            buckets['3+ months']++;
            continue;
          }
          const daysInactive = Math.floor((now - new Date(student.last_completion_date).getTime()) / (1000 * 60 * 60 * 24));
          if (daysInactive <= 14) buckets['7-14 days']++;
          else if (daysInactive <= 28) buckets['2-4 weeks']++;
          else if (daysInactive <= 90) buckets['1-3 months']++;
          else buckets['3+ months']++;
        }

        setData(Object.entries(buckets).map(([bucket, count]) => ({ bucket, student_count: count })));
      } catch (err) {
        console.error('[stalled-students]', err);
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
          Stalled Students
        </h3>
        <p className="font-body text-xs text-csub-gray mt-1">
          Students with no new completions in 7+ days. These students may need a nudge to continue their admissions journey.
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
          <Bar dataKey="student_count" fill="#DC2626" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
