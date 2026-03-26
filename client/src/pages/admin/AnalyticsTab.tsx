import { useState, useEffect } from 'react';
import SummaryStats from './SummaryStats';
import StepCompletionChart from './charts/StepCompletionChart';
import CompletionTrendChart from './charts/CompletionTrendChart';
import BottleneckChart from './charts/BottleneckChart';
import CohortDistributionChart from './charts/CohortDistributionChart';
import DeadlineRiskChart from './charts/DeadlineRiskChart';
import StalledStudentsChart from './charts/StalledStudentsChart';
import CohortComparisonChart from './charts/CohortComparisonChart';
import CompletionVelocityChart from './charts/CompletionVelocityChart';
import ExportButton from './ExportButton';
import StudentDrillDown from './StudentDrillDown';

interface AdminApi {
  get: (path: string, params?: Record<string, any>) => Promise<any>;
  post: (path: string, body?: any) => Promise<any>;
  put: (path: string, body?: any) => Promise<any>;
  del: (path: string, body?: any) => Promise<any>;
  raw: (path: string, options?: any) => Promise<Response>;
}

interface DrillDownState {
  filterType: string;
  filterValue: any;
}

interface Props {
  api: AdminApi;
  termId: number | null;
}

export default function AnalyticsTab({ api, termId }: Props) {
  const [stepCompletion, setStepCompletion] = useState<any>(null);
  const [trend, setTrend] = useState<any>(null);
  const [bottlenecks, setBottlenecks] = useState<any>(null);
  const [cohort, setCohort] = useState<any>(null);
  const [trendDays, setTrendDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState<DrillDownState | null>(null);

  useEffect(() => {
    if (!termId) return;
    setLoading(true);
    const q = `term_id=${termId}`;
    Promise.all([
      api.get(`/analytics/step-completion?${q}`),
      api.get(`/analytics/completion-trend?${q}&days=${trendDays}`),
      api.get(`/analytics/bottlenecks?${q}`),
      api.get(`/analytics/cohort-summary?${q}`),
    ]).then(([sc, tr, bn, co]) => {
      setStepCompletion(sc);
      setTrend(tr);
      setBottlenecks(bn);
      setCohort(co);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [api, termId, trendDays]);

  if (loading) {
    return <p className="font-body text-sm text-csub-gray text-center py-8">Loading analytics...</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide">
          Analytics Dashboard
        </h2>
        <div className="flex items-center gap-3">
          <ExportButton api={api} termId={termId} />
          <button
            onClick={() => window.print()}
            className="font-body text-xs text-csub-blue hover:text-csub-blue-dark border border-csub-blue/20 rounded-lg px-3 py-1.5 hover:bg-csub-blue/5 transition-colors"
          >
            Print
          </button>
        </div>
      </div>

      <SummaryStats api={api} termId={termId} />

      {/* Step Completion Rates */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide mb-1">
          Step Completion Rates
        </h3>
        <p className="font-body text-xs text-csub-gray mb-4">Percentage of students who have completed each step</p>
        <StepCompletionChart data={stepCompletion} onDrillDown={setDrillDown} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completion Trend */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide">
                Completion Trend
              </h3>
              <p className="font-body text-xs text-csub-gray mt-1">How many students are completing steps over time</p>
            </div>
            <div className="flex gap-1">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setTrendDays(d)}
                  className={`font-body text-xs px-2.5 py-1 rounded-lg transition-colors ${
                    trendDays === d
                      ? 'bg-csub-blue text-white'
                      : 'text-csub-gray hover:bg-gray-100'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <CompletionTrendChart data={trend} onDrillDown={setDrillDown} />
        </div>

        {/* Bottlenecks */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide mb-1">
            Bottleneck Steps
          </h3>
          <p className="font-body text-xs text-csub-gray mb-4">Steps with the lowest completion rates — these may need attention or clearer instructions</p>
          <BottleneckChart data={bottlenecks} onDrillDown={setDrillDown} />
        </div>
      </div>

      {/* Cohort Distribution */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide mb-1">
          Student Progress Distribution
        </h3>
        <p className="font-body text-xs text-csub-gray mb-4">How students are distributed across completion percentages</p>
        <CohortDistributionChart data={cohort} onDrillDown={setDrillDown} />
      </div>

      {/* Admissions Outreach Analytics */}
      <div className="border-t border-gray-300 pt-8">
        <h2 className="font-display text-lg font-bold text-csub-blue-dark uppercase tracking-wide mb-6">
          Outreach & Action Items
        </h2>

        {/* Deadline Risk */}
        <div className="mb-6">
          <DeadlineRiskChart termId={termId} api={api} onDrillDown={setDrillDown} />
        </div>

        {/* Stalled Students */}
        <div className="mb-6">
          <StalledStudentsChart termId={termId} api={api} onDrillDown={setDrillDown} />
        </div>

        {/* Cohort Comparison + Velocity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CohortComparisonChart termId={termId} api={api} onDrillDown={setDrillDown} />
          <CompletionVelocityChart termId={termId} api={api} onDrillDown={setDrillDown} />
        </div>
      </div>

      <StudentDrillDown
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        {...drillDown}
        termId={termId}
        api={api}
      />
    </div>
  );
}
