import { useState, useEffect } from 'react';
import SummaryStats from './SummaryStats';
import StepCompletionChart from './charts/StepCompletionChart';
import CompletionTrendChart from './charts/CompletionTrendChart';
import BottleneckChart from './charts/BottleneckChart';
import CohortDistributionChart from './charts/CohortDistributionChart';
import ExportButton from './ExportButton';

export default function AnalyticsTab({ api, termId }) {
  const [stepCompletion, setStepCompletion] = useState(null);
  const [trend, setTrend] = useState(null);
  const [bottlenecks, setBottlenecks] = useState(null);
  const [cohort, setCohort] = useState(null);
  const [trendDays, setTrendDays] = useState(30);
  const [loading, setLoading] = useState(true);

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
        <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide mb-4">
          Step Completion Rates
        </h3>
        <StepCompletionChart data={stepCompletion} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Completion Trend */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide">
              Completion Trend
            </h3>
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
          <CompletionTrendChart data={trend} />
        </div>

        {/* Bottlenecks */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide mb-4">
            Bottleneck Steps
          </h3>
          <p className="font-body text-xs text-csub-gray mb-3">Steps with the lowest completion rates</p>
          <BottleneckChart data={bottlenecks} />
        </div>
      </div>

      {/* Cohort Distribution */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h3 className="font-display text-sm font-bold text-csub-blue-dark uppercase tracking-wide mb-4">
          Student Progress Distribution
        </h3>
        <CohortDistributionChart data={cohort} />
      </div>
    </div>
  );
}
