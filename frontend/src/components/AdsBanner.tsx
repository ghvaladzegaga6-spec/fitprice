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
    <>
      {/* ლეპტოპზე — ზედა შუაში, სრული სიგანე */}
      <div className="hidden lg:block w-full mb-5">
        <div className="relative rounded-2xl overflow-hidden shadow-lg bg-gray-100 mx-auto"
          style={{ height: '120px', maxWidth: '900px' }}>
          {ad.link_url ? (
            <Link href={ad.link_url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
              <img src={ad.image_url} alt={ad.title || 'ბანერი'}
                className="w-full h-full object-cover hover:opacity-95 transition-opacity" />
            </Link>
          ) : (
            <img src={ad.image_url} alt={ad.title || 'ბანერი'}
              className="w-full h-full object-cover" />
          )}
          {ads.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              {ads.map((_, i) => (
                <button key={i} onClick={() => setCurrent(i)}
                  className={clsx('rounded-full transition-all duration-300',
                    i === current ? 'bg-white w-4 h-2' : 'bg-white/50 w-2 h-2 hover:bg-white/80'
                  )} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ტელეფონზე — კალკულატორის ქვეშ */}
      <div className="lg:hidden w-full mb-5">
        <div className="relative rounded-2xl overflow-hidden shadow-lg bg-gray-100"
          style={{ height: '120px' }}>
          {ad.link_url ? (
            <Link href={ad.link_url} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
              <img src={ad.image_url} alt={ad.title || 'ბანერი'}
                className="w-full h-full object-cover hover:opacity-95 transition-opacity" />
            </Link>
          ) : (
            <img src={ad.image_url} alt={ad.title || 'ბანერი'}
              className="w-full h-full object-cover" />
          )}
          {ads.length > 1 && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              {ads.map((_, i) => (
                <button key={i} onClick={() => setCurrent(i)}
                  className={clsx('rounded-full transition-all duration-300',
                    i === current ? 'bg-white w-4 h-2' : 'bg-white/50 w-2 h-2 hover:bg-white/80'
                  )} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
