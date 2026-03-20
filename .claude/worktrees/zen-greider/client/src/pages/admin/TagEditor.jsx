import { useState } from 'react';

export default function TagEditor({ tags, onChange }) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const tag = input.trim().toLowerCase();
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput('');
  };

  const removeTag = (tag) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex-1 min-h-[42px] px-3 py-2 rounded border border-gray-300 bg-white focus-within:ring-1 focus-within:ring-csub-blue">
          <div className="flex flex-wrap gap-1.5 items-center">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 bg-csub-blue text-white text-xs font-body font-semibold px-2 py-1 rounded-full"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="hover:text-white/80 ml-0.5"
                  aria-label={`Remove ${tag}`}
                >
                  &times;
                </button>
              </span>
            ))}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              placeholder={tags.length === 0 ? 'Add tag...' : 'Add another tag...'}
              className="flex-1 min-w-[120px] border-0 p-0 font-body text-xs focus:outline-none focus:ring-0"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={addTag}
          className="bg-csub-blue text-white font-body text-xs px-3 py-1.5 rounded hover:bg-csub-blue-dark transition-colors"
        >
          Add
        </button>
      </div>
    </div>
  );
}
