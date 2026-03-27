'use client';
import { useState, useEffect } from 'react';
import { X, Gift, RefreshCw, Loader2 } from 'lucide-react';
import { basketApi } from '@/lib/api';

interface Props {
  onClose: () => void;
  onSelect: (ids: number[]) => void;
}

export function PromoPopup({ onClose, onSelect }: Props) {
  const [promos, setPromos] = useState<any[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPromos = async () => {
    setLoading(true);
    try {
      const { data } = await basketApi.promos();
      setPromos(data.promos);
      setSelected([]);
    } catch {
      setPromos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPromos(); }, []);

  const toggle = (id: number) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in">
      <div className="card w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
              <Gift size={16} className="text-red-500" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">პრომო პროდუქტები</h2>
              <p className="text-xs text-gray-400">შეარჩიეთ და დაამატეთ კალათში</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 size={24} className="animate-spin text-primary-500" />
          </div>
        ) : promos.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">პრომო პროდუქტები არ არის</p>
        ) : (
          <div className="space-y-2 mb-4">
            {promos.map((promo) => (
              <label
                key={promo.id}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  selected.includes(promo.id)
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-primary-600"
                  checked={selected.includes(promo.id)}
                  onChange={() => toggle(promo.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{promo.product}</p>
                  <p className="text-xs text-gray-400">{promo.category} · {promo.calories} კკალ/100გ</p>
                </div>
                <span className="font-semibold text-primary-700 text-sm shrink-0">{Number(promo.price).toFixed(2)}₾</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={fetchPromos}
            disabled={loading}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            განახლება
          </button>
          <button
            onClick={() => onSelect(selected)}
            disabled={selected.length === 0}
            className="btn-primary flex-1 text-sm"
          >
            დამატება ({selected.length})
          </button>
        </div>
      </div>
    </div>
  );
}
