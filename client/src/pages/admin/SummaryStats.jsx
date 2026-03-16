import { useState, useEffect } from 'react';

export default function SummaryStats({ api }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get('/stats').then(setStats).catch(() => {});
  }, [api]);

  if (!stats) return null;

  const cards = [
    { label: 'Total Students', value: stats.totalStudents, color: 'text-csub-blue-dark' },
    { label: 'Avg. Completion', value: `${stats.avgCompletionPercent}%`, color: 'text-csub-gold' },
    { label: 'Active Steps', value: stats.totalActiveSteps, color: 'text-csub-blue' },
  ];

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      {cards.map((card) => (
        <div key={card.label} className="bg-white border border-gray-200 rounded-xl px-4 py-4 text-center">
          <p className={`font-display text-2xl font-bold ${card.color}`}>{card.value}</p>
          <p className="font-body text-xs text-csub-gray mt-1 uppercase tracking-wide">{card.label}</p>
        </div>
      ))}
    </div>
  );
}
