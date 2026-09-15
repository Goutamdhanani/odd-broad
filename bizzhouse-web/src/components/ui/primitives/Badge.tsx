import React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'green' | 'cyan' | 'blue' | 'yellow' | 'red' | 'gray';
  pulse?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'cyan',
  pulse = false,
  className,
}) => {
  const variantClass = {
    green: 'badge-green',
    cyan: 'badge-cyan',
    blue: 'badge-blue',
    yellow: 'badge-yellow',
    red: 'badge-red',
    gray: 'bg-[rgba(255,255,255,0.06)] text-[var(--bh-text-secondary)] border-[var(--bh-hairline)]',
  }[variant];

  const dotColor = {
    green: 'bg-emerald-500',
    cyan: 'bg-[#0071e3]',
    blue: 'bg-blue-400',
    yellow: 'bg-amber-400',
    red: 'bg-rose-400',
    gray: 'bg-gray-400',
  }[variant];

  return (
    <span className={cn('badge', variantClass, className)}>
      {pulse ? (
        <span className="relative flex h-2 w-2 mr-1">
          <span
            className={cn(
              'animate-ping absolute inline-flex h-full w-full rounded-full opacity-75',
              dotColor
            )}
          />
          <span className={cn('relative inline-flex rounded-full h-2 w-2', dotColor)} />
        </span>
      ) : null}
      {children}
    </span>
  );
};
