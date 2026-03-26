import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CSUB_BLUE, CSUB_GOLD, AXIS_COLOR, AXIS_FONT_SIZE, GRID_COLOR, TOOLTIP_STYLE, TOOLTIP_CURSOR, BAR_RADIUS_HORIZONTAL } from './chartTheme';

interface StepData {
  id: number;
  title: string;
  completed_count: number;
}

interface CompletionData {
  steps: StepData[];
  totalStudents: number;
}

interface DrillDownPayload {
  filterType: string;
  filterValue: any;
}

interface Props {
  data: CompletionData | null;
  onDrillDown?: (payload: DrillDownPayload) => void;
}

export default function StepCompletionChart({ data, onDrillDown }: Props) {
  if (!data?.steps?.length) return <p className="font-body text-sm text-csub-gray text-center py-4">No data</p>;

  const chartData = data.steps.map((s) => ({
    id: s.id,
    name: s.title.length > 28 ? s.title.slice(0, 26) + '...' : s.title,
    fullTitle: s.title,
    pct: data.totalStudents > 0 ? Math.round((s.completed_count / data.totalStudents) * 100) : 0,
    count: s.completed_count,
    total: data.totalStudents,
  }));

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }} />
          <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={TOOLTIP_CURSOR}
            formatter={(_value: any, _name: any, props: any) => [`${props.payload.count}/${props.payload.total} (${props.payload.pct}%)`, null]}
            labelFormatter={(label: any) => chartData.find(d => d.name === label)?.fullTitle || label}
          />
          <Bar dataKey="pct" radius={BAR_RADIUS_HORIZONTAL} cursor="pointer" onClick={(data: any) => onDrillDown?.({ filterType: 'step_completed', filterValue: data.id })}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.pct === 100 ? CSUB_GOLD : CSUB_BLUE} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
