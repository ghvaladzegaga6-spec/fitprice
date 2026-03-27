'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { Loader2, Lock, Mail, User } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const { register: signup, isLoading } = useAuthStore();
  const router = useRouter();
  const { register, handleSubmit, watch, formState: { errors } } = useForm<{
    name: string; email: string; password: string; confirm: string;
  }>();

  const onSubmit = async (data: any) => {
    if (data.password !== data.confirm) {
      toast.error('პაროლები არ ემთხვევა'); return;
    }
    try {
      await signup(data.email, data.password, data.name);
      toast.success('მოგესალმებით! ✅');
      router.push('/basket');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'რეგისტრაცია ვერ მოხდა');
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
          <p className="text-sm text-gray-500 mt-1">ახალი ანგარიში</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {[
            { name: 'name', label: 'სახელი', type: 'text', placeholder: 'გიორგი', icon: User },
            { name: 'email', label: 'ელ-ფოსტა', type: 'email', placeholder: 'you@example.com', icon: Mail },
            { name: 'password', label: 'პაროლი (8+ სიმბოლო)', type: 'password', placeholder: '••••••••', icon: Lock },
            { name: 'confirm', label: 'პაროლის გამეორება', type: 'password', placeholder: '••••••••', icon: Lock },
          ].map(({ name, label, type, placeholder, icon: Icon }) => (
            <div key={name}>
              <label className="label">{label}</label>
              <div className="relative">
                <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={type}
                  className="input pl-9"
                  placeholder={placeholder}
                  {...register(name as any, { required: true, minLength: name === 'password' ? 8 : 2 })}
                />
              </div>
            </div>
          ))}
          <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
            {isLoading ? <><Loader2 size={15} className="animate-spin" /> იტვირთება...</> : 'რეგისტრაცია'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <p className="text-sm text-gray-500">
            ანგარიში გაქვთ?{' '}
            <Link href="/auth/login" className="text-primary-600 hover:underline font-medium">შესვლა</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
