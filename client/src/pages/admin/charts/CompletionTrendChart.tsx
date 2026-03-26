import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CSUB_BLUE, CSUB_GOLD, AXIS_COLOR, AXIS_FONT_SIZE, GRID_COLOR, TOOLTIP_STYLE, TOOLTIP_CURSOR } from './chartTheme';

interface TrendItem {
  date: string;
  completions: number;
}

interface DrillDownPayload {
  filterType: string;
  filterValue: any;
}

interface Props {
  data: TrendItem[] | null;
  onDrillDown?: (payload: DrillDownPayload) => void;
}

export default function CompletionTrendChart({ data, onDrillDown }: Props) {
  if (!data?.length) return <p className="font-body text-sm text-csub-gray text-center py-4">No data</p>;

  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    rawDate: d.date,
    completions: d.completions,
  }));

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          <XAxis dataKey="date" tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }} />
          <YAxis tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }} allowDecimals={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={TOOLTIP_CURSOR}
            formatter={(value: any) => [`${value} completions`, null]}
          />
          <Line
            type="monotone"
            dataKey="completions"
            stroke={CSUB_BLUE}
            strokeWidth={2}
            dot={{ fill: CSUB_GOLD, r: 4, cursor: 'pointer' }}
            activeDot={{ r: 6, fill: CSUB_GOLD, cursor: 'pointer', onClick: (_e: any, payload: any) => onDrillDown?.({ filterType: 'trend_date', filterValue: payload.payload.rawDate }) }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
