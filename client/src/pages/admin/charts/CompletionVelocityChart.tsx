import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AXIS_COLOR, AXIS_FONT_SIZE, GRID_COLOR, TOOLTIP_STYLE, TOOLTIP_CURSOR, BAR_RADIUS, VELOCITY_COLORS } from './chartTheme';

interface AdminApi {
  get: (path: string, params?: Record<string, any>) => Promise<any>;
  post: (path: string, body?: any) => Promise<any>;
  put: (path: string, body?: any) => Promise<any>;
  del: (path: string, body?: any) => Promise<any>;
  raw: (path: string, options?: any) => Promise<Response>;
}

interface VelocityItem {
  bucket: string;
  student_count: number;
}

interface DrillDownPayload {
  filterType: string;
  filterValue: any;
}

interface Props {
  termId: number | null;
  api: AdminApi;
  onDrillDown?: (payload: DrillDownPayload) => void;
}

export default function CompletionVelocityChart({ termId, api, onDrillDown }: Props) {
  const [data, setData] = useState<VelocityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await api.get('/analytics/completion-velocity', { term_id: termId });
        setData(result);
      } catch (err) {
        console.error('[completion-velocity]', err);
      } finally {
        setLoading(false);
      }
    };
    if (termId) fetchData();
  }, [termId, api]);

  if (loading) return <div className="h-40 bg-gray-50 rounded-xl animate-pulse" />;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
      <div className="mb-4">
        <h3 className="font-display text-sm font-bold uppercase tracking-wide text-csub-blue-dark">
          Completion Velocity
        </h3>
        <p className="font-body text-xs text-csub-gray mt-1">
          How quickly students progress from first to most recent completion. Longer times may indicate friction in the process.
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
            formatter={(value: any) => [`${value} students`, null]}
          />
          <Bar dataKey="student_count" radius={BAR_RADIUS} cursor="pointer" onClick={(data: any) => onDrillDown?.({ filterType: 'velocity_bucket', filterValue: data.bucket })}>
            {data.map((_entry, index) => (
              <Cell key={`cell-${index}`} fill={VELOCITY_COLORS[index % VELOCITY_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
