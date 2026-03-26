import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { COLOR_DANGER, AXIS_COLOR, AXIS_FONT_SIZE, GRID_COLOR, TOOLTIP_STYLE, TOOLTIP_CURSOR, BAR_RADIUS } from './chartTheme';

export default function StalledStudentsChart({ termId, api, onDrillDown }) {
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

  if (loading) return <div className="h-40 bg-gray-50 rounded-xl animate-pulse" />;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <div className="mb-4">
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-csub-blue-dark">
          Stalled Students
        </h3>
        <p className="font-body text-xs text-csub-gray mt-1">
          Students with no new completions in 7+ days. These students may need outreach to continue their admissions journey.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          <XAxis
            dataKey="bucket"
            tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }}
            angle={-15}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={TOOLTIP_CURSOR}
            formatter={(value) => [`${value} students`, null]}
          />
          <Bar dataKey="student_count" fill={COLOR_DANGER} radius={BAR_RADIUS} cursor="pointer" onClick={(data) => onDrillDown?.({ filterType: 'stalled', filterValue: data.bucket })} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
