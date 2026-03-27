'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';

const schema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('calories'),
    calories: z.number({ required_error: 'შეიყვანეთ კალორიები' }).min(500).max(10000),
    protein: z.number().optional(),
    fat: z.number().optional(),
    carbs: z.number().optional(),
    ratio_protein: z.number().min(10).max(80).default(30),
    ratio_fat: z.number().min(10).max(80).default(30),
    ratio_carbs: z.number().min(10).max(80).default(40),
    use_custom_ratio: z.boolean().default(false),
  }),
  z.object({
    mode: z.literal('macros'),
    calories: z.number().optional(),
    protein: z.number({ required_error: 'შეიყვანეთ ცილა' }).min(0).max(500),
    fat: z.number({ required_error: 'შეიყვანეთ ცხიმი' }).min(0).max(500),
    carbs: z.number({ required_error: 'შეიყვანეთ ნახშირწყლები' }).min(0).max(1000),
    ratio_protein: z.number().optional(),
    ratio_fat: z.number().optional(),
    ratio_carbs: z.number().optional(),
    use_custom_ratio: z.boolean().optional(),
  }),
]);

type FormData = z.infer<typeof schema>;

interface Props {
  onSubmit: (data: any) => void;
  isLoading: boolean;
}

export function BasketCalculator({ onSubmit, isLoading }: Props) {
  const [mode, setMode] = useState<'calories' | 'macros'>('calories');
  const [useCustomRatio, setUseCustomRatio] = useState(false);

  const { register, handleSubmit, formState: { errors }, watch } = useForm<any>({
    defaultValues: {
      mode: 'calories',
      ratio_protein: 30,
      ratio_fat: 30,
      ratio_carbs: 40,
    },
  });

  const rp = watch('ratio_protein') || 30;
  const rf = watch('ratio_fat') || 30;
  const rc = watch('ratio_carbs') || 40;
  const ratioTotal = Number(rp) + Number(rf) + Number(rc);

  const handleFormSubmit = (data: any) => {
    const payload: any = { mode };
    if (mode === 'calories') {
      payload.calories = Number(data.calories);
      if (useCustomRatio) {
        payload.calorie_ratio = {
          protein: Number(rp) / 100,
          fat: Number(rf) / 100,
          carbs: Number(rc) / 100,
        };
      }
    } else {
      payload.protein = Number(data.protein);
      payload.fat = Number(data.fat);
      payload.carbs = Number(data.carbs);
    }
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex rounded-xl border border-gray-200 p-1 gap-1">
        {[{ v: 'calories', l: 'კალორიები' }, { v: 'macros', l: 'მაკრო' }].map(({ v, l }) => (
          <button
            key={v}
            type="button"
            onClick={() => setMode(v as any)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              mode === v
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {/* Calories Mode */}
      {mode === 'calories' && (
        <div className="space-y-3">
          <div>
            <label className="label">კალორიები (კკალ)</label>
            <input
              type="number"
              className="input"
              placeholder="მაგ: 2000"
              {...register('calories', { valueAsNumber: true })}
            />
            {errors.calories && <p className="text-red-500 text-xs mt-1">{String(errors.calories.message)}</p>}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-primary-600"
              checked={useCustomRatio}
              onChange={(e) => setUseCustomRatio(e.target.checked)}
            />
            <span className="text-sm text-gray-600">მაკრო პროპორციების მორგება</span>
          </label>

          {useCustomRatio && (
            <div className="space-y-2 p-3 bg-gray-50 rounded-xl">
              <div className={`text-xs font-medium mb-1 ${ratioTotal !== 100 ? 'text-red-500' : 'text-green-600'}`}>
                სულ: {ratioTotal}% {ratioTotal !== 100 ? '(უნდა იყოს 100%)' : '✓'}
              </div>
              {[
                { name: 'ratio_protein', label: 'ცილა %', color: 'text-blue-600' },
                { name: 'ratio_fat', label: 'ცხიმი %', color: 'text-yellow-600' },
                { name: 'ratio_carbs', label: 'ნახშირ. %', color: 'text-green-600' },
              ].map(({ name, label, color }) => (
                <div key={name} className="flex items-center gap-3">
                  <span className={`text-xs font-medium w-20 ${color}`}>{label}</span>
                  <input
                    type="number"
                    className="input py-1.5 text-sm w-20"
                    min={5} max={85}
                    {...register(name as any, { valueAsNumber: true })}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Disabled macro fields */}
          <div className="opacity-40 pointer-events-none space-y-2">
            {['ცილა (გ)', 'ცხიმი (გ)', 'ნახშირწყლები (გ)'].map((l) => (
              <div key={l}>
                <label className="label text-xs">{l} <span className="text-gray-400">(ავტო)</span></label>
                <input className="input bg-gray-50" disabled placeholder="—" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Macros Mode */}
      {mode === 'macros' && (
        <div className="space-y-3">
          <div className="opacity-40 pointer-events-none">
            <label className="label">კალორიები <span className="text-gray-400">(ავტო)</span></label>
            <input className="input bg-gray-50" disabled placeholder="—" />
          </div>
          {[
            { name: 'protein', label: 'ცილა (გ)', placeholder: '150' },
            { name: 'fat', label: 'ცხიმი (გ)', placeholder: '70' },
            { name: 'carbs', label: 'ნახშირწყლები (გ)', placeholder: '250' },
          ].map(({ name, label, placeholder }) => (
            <div key={name}>
              <label className="label">{label}</label>
              <input
                type="number"
                className="input"
                placeholder={placeholder}
                {...register(name as any, { valueAsNumber: true })}
              />
              {errors[name as keyof typeof errors] && (
                <p className="text-red-500 text-xs mt-1">{String((errors[name as keyof typeof errors] as any)?.message)}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span>ოპტიმიზაცია...</span>
          </>
        ) : (
          '🛒 კალათის გენერაცია'
        )}
      </button>
    </form>
  );
}
