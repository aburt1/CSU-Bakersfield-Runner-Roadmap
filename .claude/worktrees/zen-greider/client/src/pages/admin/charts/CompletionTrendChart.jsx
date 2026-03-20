import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function CompletionTrendChart({ data }) {
  if (!data?.length) return <p className="font-body text-sm text-csub-gray text-center py-4">No data</p>;

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    completions: d.completions,
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" fontSize={11} />
          <YAxis fontSize={11} allowDecimals={false} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="completions"
            stroke="#003594"
            strokeWidth={2}
            dot={{ fill: '#FFC72C', r: 4 }}
            activeDot={{ r: 6, fill: '#FFC72C' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
