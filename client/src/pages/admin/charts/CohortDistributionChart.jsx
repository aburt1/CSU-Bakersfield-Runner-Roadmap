import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { AXIS_COLOR, AXIS_FONT_SIZE, GRID_COLOR, TOOLTIP_STYLE, TOOLTIP_CURSOR, BAR_RADIUS, PROGRESS_COLORS } from './chartTheme';

const BUCKET_ORDER = ['0%', '1-25%', '26-50%', '51-75%', '76-100%'];

export default function CohortDistributionChart({ data, onDrillDown }) {
  if (!data?.length) return <p className="font-body text-sm text-csub-gray text-center py-4">No data</p>;

  const bucketMap = Object.fromEntries(data.map((d) => [d.bucket, d.student_count]));
  const chartData = BUCKET_ORDER.map((bucket, i) => ({
    name: bucket,
    value: bucketMap[bucket] || 0,
    color: PROGRESS_COLORS[i],
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ left: 10, right: 30, top: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }}
            label={{ value: 'Completion %', position: 'insideBottom', offset: -2, fontSize: 10, fill: AXIS_COLOR }}
          />
          <YAxis
            tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }}
            allowDecimals={false}
            label={{ value: 'Students', angle: -90, position: 'insideLeft', offset: 0, fontSize: 10, fill: AXIS_COLOR }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={TOOLTIP_CURSOR}
            formatter={(value) => [`${value} students`, null]}
            labelFormatter={(label) => `Progress: ${label}`}
          />
          <Bar dataKey="value" radius={BAR_RADIUS} cursor="pointer" onClick={(data) => onDrillDown?.({ filterType: 'cohort_bucket', filterValue: data.name })}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
            <LabelList dataKey="value" position="top" fontSize={AXIS_FONT_SIZE} fill="#374151" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
