import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

const COLORS = ['#DC2626', '#F59E0B', '#3B82F6', '#003594', '#FFC72C'];
const BUCKET_ORDER = ['0%', '1-25%', '26-50%', '51-75%', '76-100%'];

export default function CohortDistributionChart({ data }) {
  if (!data?.length) return <p className="font-body text-sm text-csub-gray text-center py-4">No data</p>;

  // Ensure all buckets exist and are in order
  const bucketMap = Object.fromEntries(data.map((d) => [d.bucket, d.student_count]));
  const chartData = BUCKET_ORDER.map((bucket, i) => ({
    name: bucket,
    value: bucketMap[bucket] || 0,
    color: COLORS[i],
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ left: 10, right: 30, top: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="name"
            fontSize={11}
            tick={{ fill: '#001A70' }}
            label={{ value: 'Completion %', position: 'insideBottom', offset: -2, fontSize: 10, fill: '#6b7280' }}
          />
          <YAxis
            fontSize={11}
            allowDecimals={false}
            label={{ value: 'Students', angle: -90, position: 'insideLeft', offset: 0, fontSize: 10, fill: '#6b7280' }}
          />
          <Tooltip
            formatter={(value) => [`${value} students`, 'Count']}
            labelFormatter={(label) => `Progress: ${label}`}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
            <LabelList dataKey="value" position="top" fontSize={11} fill="#374151" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
