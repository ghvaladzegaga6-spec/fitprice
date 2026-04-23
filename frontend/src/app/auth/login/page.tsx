'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { Loader2, Lock, Mail } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const { login, isLoading } = useAuthStore();
  const router = useRouter();
  const { register, handleSubmit, formState: { errors } } = useForm<{ email: string; password: string }>();

  const onSubmit = async (data: any) => {
    try {
      await login(data.email, data.password);
      toast.success('კეთილი იყოს თქვენი დაბრუნება!');
      router.push('/basket');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'შესვლა ვერ მოხდა');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-accent-50 px-4">
      <div className="card w-full max-w-sm shadow-xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-primary-500 to-accent-500 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow">
            <span className="text-white font-bold text-xl">F</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-gray-900">
            FIT<span className="text-primary-600">PRICE</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">სისტემაში შესვლა</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">ელ-ფოსტა</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                className="input pl-9"
                placeholder="you@example.com"
                {...register('email', { required: true })}
              />
            </div>
          </div>
          <div>
            <label className="label">პაროლი</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                className="input pl-9"
                placeholder="••••••••"
                {...register('password', { required: true })}
              />
            </div>
          </div>
          <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
            {isLoading ? <><Loader2 size={15} className="animate-spin" /> იტვირთება...</> : 'შესვლა'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">
            ანგარიში არ გაქვთ?{' '}
            <Link href="/auth/register" className="text-primary-600 hover:underline font-medium">რეგისტრაცია</Link>
          </p>
          <p className="text-xs text-gray-400 mt-2">
            ან{' '}
            <Link href="/basket" className="text-gray-500 hover:underline">სტუმრად გაგრძელება →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
