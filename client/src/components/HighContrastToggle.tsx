import React, { useState, useEffect } from 'react';

export default function HighContrastToggle(): React.ReactElement {
  const [enabled, setEnabled] = useState<boolean>(() => {
    return localStorage.getItem('csub_high_contrast') === 'true';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-high-contrast', enabled ? 'true' : 'false');
    localStorage.setItem('csub_high_contrast', enabled ? 'true' : 'false');
  }, [enabled]);

  return (
    <button
      onClick={() => setEnabled((v) => !v)}
      className={`flex items-center gap-1.5 text-xs font-body px-2 py-1 rounded-lg transition-colors ${
        enabled
          ? 'bg-white/20 text-white'
          : 'text-white/50 hover:text-white/80'
      }`}
      aria-pressed={enabled}
      aria-label={enabled ? 'Disable high contrast mode' : 'Enable high contrast mode'}
      title="Toggle high contrast"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
      {enabled ? 'HC' : 'HC'}
    </button>
  );
}
