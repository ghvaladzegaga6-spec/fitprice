'use client';
import { useState, useEffect } from 'react';
import { adsApi } from '@/lib/api';
import Link from 'next/link';
import { clsx } from 'clsx';

export function AdsBanner() {
  const [ads, setAds] = useState<any[]>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    adsApi.list().then(({ data }) => setAds(data.ads || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (ads.length <= 1) return;
    const interval = setInterval(() => {
      setCurrent(prev => (prev + 1) % ads.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [ads.length]);

  if (ads.length === 0) return null;

  const ad = ads[current];

  return (
    <div className="w-full mb-4">
      <div className="relative rounded-2xl overflow-hidden shadow-md bg-gray-100" style={{ height: '80px' }}>
        {/* Image */}
        {ad.link_url ? (
          <Link href={ad.link_url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
            <img src={ad.image_url} alt={ad.title || 'რეკლამა'}
              className="w-full h-full object-cover hover:opacity-95 transition-opacity" />
          </Link>
        ) : (
          <img src={ad.image_url} alt={ad.title || 'რეკლამა'}
            className="w-full h-full object-cover" />
        )}

        {/* Label */}
        <div className="absolute top-1.5 left-2">
          <span className="bg-black/40 backdrop-blur-sm text-white text-[9px] px-1.5 py-0.5 rounded-full font-medium">
            რეკლამა
          </span>
        </div>

        {/* Dots */}
        {ads.length > 1 && (
          <div className="absolute bottom-1.5 right-2 flex items-center gap-1">
            {ads.map((_, i) => (
              <button key={i} onClick={() => setCurrent(i)}
                className={clsx(
                  'rounded-full transition-all',
                  i === current ? 'bg-white w-3 h-1.5' : 'bg-white/50 w-1.5 h-1.5'
                )} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
