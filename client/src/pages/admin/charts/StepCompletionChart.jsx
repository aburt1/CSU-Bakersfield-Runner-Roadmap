import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CSUB_BLUE, CSUB_GOLD, AXIS_COLOR, AXIS_FONT_SIZE, GRID_COLOR, TOOLTIP_STYLE, TOOLTIP_CURSOR, BAR_RADIUS_HORIZONTAL } from './chartTheme';

export default function StepCompletionChart({ data, onDrillDown }) {
  if (!data?.steps?.length) return <p className="font-body text-sm text-csub-gray text-center py-4">No data</p>;

  const chartData = data.steps.map((s) => ({
    id: s.id,
    name: s.title.length > 20 ? s.title.slice(0, 18) + '...' : s.title,
    fullTitle: s.title,
    pct: data.totalStudents > 0 ? Math.round((s.completed_count / data.totalStudents) * 100) : 0,
    count: s.completed_count,
    total: data.totalStudents,
  }));

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }} />
          <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={TOOLTIP_CURSOR}
            formatter={(value, name, props) => [`${props.payload.count}/${props.payload.total} (${value}%)`, null]}
            labelFormatter={(label) => chartData.find(d => d.name === label)?.fullTitle || label}
          />
          <Bar dataKey="pct" radius={BAR_RADIUS_HORIZONTAL} cursor="pointer" onClick={(data) => onDrillDown?.({ filterType: 'step_completed', filterValue: data.id })}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.pct === 100 ? CSUB_GOLD : CSUB_BLUE} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
