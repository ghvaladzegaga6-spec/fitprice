'use client';
import { useState, useEffect } from 'react';
import { adsApi } from '@/lib/api';
import Image from 'next/image';
import Link from 'next/link';

export function AdsRotator() {
  const [ads, setAds] = useState<any[]>([]);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    adsApi.list().then(({ data }) => setAds(data.ads)).catch(() => {});
  }, []);

  useEffect(() => {
    if (ads.length <= 1) return;
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % ads.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [ads.length]);

  if (ads.length === 0) return null;

  const ad = ads[current];

  return (
    <div className="card p-0 overflow-hidden">
      <div className="relative">
        {ad.link_url ? (
          <Link href={ad.link_url} target="_blank" rel="noopener noreferrer">
            <img
              src={ad.image_url}
              alt={ad.title || 'რეკლამა'}
              className="w-full h-40 object-cover"
            />
          </Link>
        ) : (
          <img
            src={ad.image_url}
            alt={ad.title || 'რეკლამა'}
            className="w-full h-40 object-cover"
          />
        )}
        <div className="absolute bottom-2 right-2">
          <span className="bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
            რეკლამა · {current + 1}/{ads.length}
          </span>
        </div>
      </div>
      {ads.length > 1 && (
        <div className="flex justify-center gap-1 py-2">
          {ads.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${i === current ? 'bg-primary-500 w-3' : 'bg-gray-200'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
