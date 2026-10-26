import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'demo';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-muted border-border',
  info: 'bg-info-soft text-brand-strong border-brand/25',
  success: 'bg-success-soft text-success-text border-success/25',
  warning: 'bg-warning-soft text-warning-text border-warning/35',
  danger: 'bg-danger-soft text-danger-text border-danger/25',
  demo: 'bg-demo-soft text-demo border-demo/30',
};

export function Badge({ tone = 'neutral', className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)} {...props} />;
}
