import { cn } from '@/lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden focusable="false">
      <path d="M16 1.5c-6.6 0-12 5.2-12 11.7 0 8.4 10.3 16.4 11 17a1.6 1.6 0 0 0 2 0c.7-.6 11-8.6 11-17C28 6.7 22.6 1.5 16 1.5Z" fill="#2878E5" />
      <rect x="9.5" y="6.5" width="13" height="12.5" rx="2.6" fill="#fff" />
      <rect x="11.2" y="8.6" width="9.6" height="4.6" rx="1" fill="#16324F" />
      <circle cx="12.6" cy="16.2" r="1.15" fill="#F59E0B" />
      <circle cx="19.4" cy="16.2" r="1.15" fill="#F59E0B" />
      <rect x="10.6" y="19" width="2.4" height="1.8" rx=".6" fill="#fff" />
      <rect x="19" y="19" width="2.4" height="1.8" rx=".6" fill="#fff" />
    </svg>
  );
}

export function Logo({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark />
      <span className={cn('text-lg font-extrabold tracking-tight', inverted ? 'text-white' : 'text-navy')}>BusBuddy</span>
    </span>
  );
}
