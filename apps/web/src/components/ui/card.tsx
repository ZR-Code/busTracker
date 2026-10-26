import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-2xl border border-border bg-surface shadow-[0_1px_2px_rgb(16_38_61/0.06)]', className)} {...props} />;
}

export function CardHeader({ title, description, action, className, as: As = 'h2', icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string; as?: 'h2' | 'h3'; icon?: ReactNode }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="min-w-0">
        <As className="flex items-center gap-2 text-base font-semibold text-text">
          {icon}
          {title}
        </As>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5 pt-4', className)} {...props} />;
}
