import { useState, useEffect } from 'react';

export default function SummaryStats({ api, termId }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const query = termId ? `/stats?term_id=${termId}` : '/stats';
    api.get(query).then(setStats).catch(() => {});
  }, [api, termId]);

  if (!stats) return null;

  const cards = [
    { label: 'Total Students', value: stats.totalStudents, color: 'text-csub-blue-dark' },
    { label: 'Avg. Completion', value: `${stats.avgCompletionPercent}%`, color: 'text-csub-gold' },
    { label: 'Active Steps', value: stats.totalActiveSteps, color: 'text-csub-blue' },
  ];

  // Suppress gold color on 0% — only highlight when there's meaningful progress
  const getColor = (card) => {
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
