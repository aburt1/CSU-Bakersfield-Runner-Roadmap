import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AXIS_COLOR, AXIS_FONT_SIZE, GRID_COLOR, TOOLTIP_STYLE, TOOLTIP_CURSOR, BAR_RADIUS, getCompletionColor } from './chartTheme';

interface StepData {
  id: number;
  title: string;
  completion_pct: number;
  completed_count: number;
}

interface BottleneckData {
  steps: StepData[];
  totalStudents: number;
}

interface DrillDownPayload {
  filterType: string;
  filterValue: any;
}

interface Props {
  data: BottleneckData | null;
  onDrillDown?: (payload: DrillDownPayload) => void;
}

export default function BottleneckChart({ data, onDrillDown }: Props) {
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
          <YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={TOOLTIP_CURSOR}
            formatter={(_value: any, _name: any, props: any) => [`${props.payload.count}/${props.payload.total} (${props.payload.pct}%)`, null]}
            labelFormatter={(label: any) => chartData.find(d => d.name === label)?.fullTitle || label}
          />
          <Bar dataKey="pct" radius={BAR_RADIUS} cursor="pointer" onClick={(data: any) => onDrillDown?.({ filterType: 'step_not_completed', filterValue: data.id })}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={getCompletionColor(entry.pct)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
