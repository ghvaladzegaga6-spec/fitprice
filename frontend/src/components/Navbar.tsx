'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShoppingCart, User, Brain, LogOut, LogIn } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';

export function Navbar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    toast.success('გამოხვედით სისტემიდან.');
  };

  const navItems = [
    { href: '/basket', label: 'კალათი', icon: ShoppingCart },
    { href: '/personalization', label: 'პერსონალიზაცია', icon: Brain },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/basket" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-accent-500 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
              <span className="text-white font-bold text-sm">F</span>
            </div>
            <span className="font-display text-xl font-bold text-gray-900 tracking-tight">
              FIT<span className="text-primary-600">PRICE</span>
            </span>
          </Link>

          {/* Nav Links */}
          <div className="flex items-center gap-1">
            {navItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all',
                  pathname.startsWith(href)
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                )}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </div>

          {/* Auth */}
          <div className="flex items-center gap-2">
            {user ? (
              <div className="flex items-center gap-2">
                <Link href="/profile" className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition">
                  <User size={16} />
                  <span className="hidden sm:inline max-w-[120px] truncate">{user.name}</span>
                </Link>
                <button onClick={handleLogout} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition">
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <Link href="/auth/login" className="flex items-center gap-2 btn-primary text-sm py-2 px-4">
                <LogIn size={15} />
                <span>შესვლა</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
