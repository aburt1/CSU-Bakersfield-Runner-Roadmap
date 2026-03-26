import { useState, useEffect } from 'react';

interface AdminApi {
  get: (path: string, params?: Record<string, any>) => Promise<any>;
  post: (path: string, body?: any) => Promise<any>;
  put: (path: string, body?: any) => Promise<any>;
  del: (path: string, body?: any) => Promise<any>;
  raw: (path: string, options?: any) => Promise<Response>;
}

interface StatsData {
  totalStudents: number;
  avgCompletionPercent: number;
  totalActiveSteps: number;
}

interface CardDef {
  label: string;
  value: string | number;
  color: string;
}

interface Props {
  api: AdminApi;
  termId: number | null;
}

export default function SummaryStats({ api, termId }: Props) {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    const query = termId ? `/stats?term_id=${termId}` : '/stats';
    api.get(query).then(setStats).catch(() => {});
  }, [api, termId]);

  if (!stats) return null;

  const cards: CardDef[] = [
    { label: 'Total Students', value: stats.totalStudents, color: 'text-csub-blue-dark' },
    { label: 'Avg. Completion', value: `${stats.avgCompletionPercent}%`, color: 'text-csub-gold' },
    { label: 'Active Steps', value: stats.totalActiveSteps, color: 'text-csub-blue' },
  ];

  // Suppress gold color on 0% — only highlight when there's meaningful progress
  const getColor = (card: CardDef): string => {
    if (card.label === 'Avg. Completion' && stats.avgCompletionPercent === 0) return 'text-csub-gray';
    return card.color;
  };

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {cards.map((card) => (
        <div key={card.label} className="bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-4 text-center">
          <p className={`font-display text-2xl font-bold ${getColor(card)}`}>{card.value}</p>
          <p className="font-body text-xs text-csub-gray mt-1 uppercase tracking-wide">{card.label}</p>
        </div>
      ))}
    </div>
  );
}
