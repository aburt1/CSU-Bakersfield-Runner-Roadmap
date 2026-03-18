import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

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
  })).filter((d) => d.value > 0);

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            outerRadius={90}
            innerRadius={40}
            dataKey="value"
            label={({ name, value }) => `${name}: ${value}`}
            fontSize={11}
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => [`${value} students`]} />
          <Legend
            formatter={(value) => <span className="font-body text-xs">{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
