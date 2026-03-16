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
      <div className="flex flex-wrap gap-1 mb-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-csub-blue/10 text-csub-blue-dark text-xs font-body font-semibold px-2 py-1 rounded-full"
          >
            {tag}
            <button onClick={() => removeTag(tag)} className="hover:text-red-600 ml-0.5">&times;</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
          placeholder="Add tag..."
          className="flex-1 px-3 py-1.5 rounded border border-gray-300 font-body text-xs focus:outline-none focus:ring-1 focus:ring-csub-blue"
        />
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
