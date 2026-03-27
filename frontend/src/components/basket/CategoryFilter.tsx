'use client';
import { clsx } from 'clsx';
import { CheckCircle, XCircle } from 'lucide-react';

interface Props {
  categories: string[];
  excluded: string[];
  onChange: (excluded: string[]) => void;
}

export function CategoryFilter({ categories, excluded, onChange }: Props) {
  const toggle = (cat: string) => {
    if (excluded.includes(cat)) {
      onChange(excluded.filter((c) => c !== cat));
    } else {
      onChange([...excluded, cat]);
    }
  };

  const isExcluded = (cat: string) => excluded.includes(cat);

  return (
    <div className="card animate-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800 text-sm">კატეგორიების ფილტრი</h3>
        <div className="flex gap-2">
          <button
            onClick={() => onChange([])}
            className="text-xs text-primary-600 hover:underline"
          >
            ყველა ჩართვა
          </button>
          <span className="text-gray-200">|</span>
          <button
            onClick={() => onChange([...categories])}
            className="text-xs text-red-500 hover:underline"
          >
            ყველა გამორთვა
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => toggle(cat)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
              isExcluded(cat)
                ? 'bg-red-50 border-red-200 text-red-600 line-through opacity-60'
                : 'bg-primary-50 border-primary-200 text-primary-700 hover:bg-primary-100'
            )}
          >
            {isExcluded(cat) ? <XCircle size={11} /> : <CheckCircle size={11} />}
            {cat}
          </button>
        ))}
      </div>
      {excluded.length > 0 && (
        <p className="text-xs text-gray-400 mt-2">
          {excluded.length} კატეგორია გამორიცხულია
        </p>
      )}
    </div>
  );
}
