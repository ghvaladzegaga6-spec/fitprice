import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'FITPRICE — ჭკვიანი კვების კალკულატორი',
  description: 'მიიღეთ ყველაზე იაფი კვების კალათი თქვენი კალორიებისა და მაკროების მიხედვით.',
  keywords: 'კვება, კალორიები, დიეტა, პროდუქტები, ფასი, საქართველო',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ka" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=BPG+Nino+Mtavruli&family=FiraGO:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-gray-50 font-sans antialiased">
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { fontFamily: 'FiraGO, sans-serif', fontSize: '14px' },
            success: { iconTheme: { primary: '#28a074', secondary: '#fff' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  );
}
