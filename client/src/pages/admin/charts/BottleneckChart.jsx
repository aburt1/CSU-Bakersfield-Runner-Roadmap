import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AXIS_COLOR, AXIS_FONT_SIZE, GRID_COLOR, TOOLTIP_STYLE, TOOLTIP_CURSOR, BAR_RADIUS, getCompletionColor } from './chartTheme';

export default function BottleneckChart({ data, onDrillDown }) {
  if (!data?.steps?.length) return <p className="font-body text-sm text-csub-gray text-center py-4">No data</p>;

  const chartData = data.steps.map((s) => ({
    id: s.id,
    name: s.title.length > 25 ? s.title.slice(0, 23) + '...' : s.title,
    fullTitle: s.title,
    pct: s.completion_pct,
    count: s.completed_count,
    total: data.totalStudents,
  }));

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          <XAxis dataKey="name" tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }} interval={0} angle={-15} textAnchor="end" height={50} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={TOOLTIP_CURSOR}
            formatter={(value, name, props) => [`${props.payload.count}/${props.payload.total} (${value}%)`, null]}
            labelFormatter={(label) => chartData.find(d => d.name === label)?.fullTitle || label}
          />
          <Bar dataKey="pct" radius={BAR_RADIUS} cursor="pointer" onClick={(data) => onDrillDown?.({ filterType: 'step_not_completed', filterValue: data.id })}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={getCompletionColor(entry.pct)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
