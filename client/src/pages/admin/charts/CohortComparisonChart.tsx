import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CSUB_BLUE, AXIS_COLOR, AXIS_FONT_SIZE, GRID_COLOR, TOOLTIP_STYLE, TOOLTIP_CURSOR, BAR_RADIUS } from './chartTheme';

interface AdminApi {
  get: (path: string, params?: Record<string, any>) => Promise<any>;
  post: (path: string, body?: any) => Promise<any>;
  put: (path: string, body?: any) => Promise<any>;
  del: (path: string, body?: any) => Promise<any>;
  raw: (path: string, options?: any) => Promise<Response>;
}

interface CohortItem {
  tag: string;
  avg_completion_pct: number;
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

export default function CohortComparisonChart({ termId, api, onDrillDown }: Props) {
  const [data, setData] = useState<CohortItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await api.get('/analytics/cohort-comparison', { term_id: termId });
        setData(result);
      } catch (err) {
        console.error('[cohort-comparison]', err);
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
          Cohort Comparison
        </h3>
        <p className="font-body text-xs text-csub-gray mt-1">
          Average completion rate by student population. Identify groups that may need targeted outreach.
        </p>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
          <XAxis
            dataKey="tag"
            tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }}
            angle={-15}
            textAnchor="end"
            height={60}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: AXIS_FONT_SIZE, fill: AXIS_COLOR }}
            label={{ value: '%', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            cursor={TOOLTIP_CURSOR}
            formatter={(value: any) => [`${value}%`, null]}
          />
          <Bar dataKey="avg_completion_pct" fill={CSUB_BLUE} radius={BAR_RADIUS} cursor="pointer" onClick={(data: any) => onDrillDown?.({ filterType: 'tag', filterValue: data.tag })} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
