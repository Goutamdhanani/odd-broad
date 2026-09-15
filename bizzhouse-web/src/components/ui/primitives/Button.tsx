'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'glass';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled = false,
      icon,
      ...props
    },
    ref
  ) => {
    const baseClasses =
      'inline-flex items-center justify-center font-[650] select-none transition-all duration-160 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bh-cyan)] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100';

    const sizeClasses = {
      sm: 'h-9 px-3.5 text-xs rounded-[10px] gap-1.5',
      md: 'h-11 px-5 text-sm rounded-[14px] gap-2',
      lg: 'h-[52px] px-6 text-base rounded-[16px] gap-2.5',
      icon: 'h-10 w-10 p-0 rounded-[12px] shrink-0',
    }[size];

    const variantClasses = {
      primary:
        'bh-btn-primary',
      secondary:
        'bh-btn-secondary',
      ghost:
        'bh-btn-ghost',
      destructive:
        'bg-[#2A0E13] text-[#FF9EAA] border border-[rgba(255,158,170,0.25)] hover:bg-[#38131B] hover:border-[rgba(255,158,170,0.45)]',
      glass:
        'bg-[rgba(255,255,255,0.08)] backdrop-blur-md text-[#1d1d1f] border border-[rgba(255,255,255,0.15)] hover:border-[var(--bh-hairline-cyan)] hover:bg-[rgba(255,255,255,0.12)]',
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(baseClasses, sizeClasses, variantClasses, className)}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          icon && <span className="shrink-0">{icon}</span>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
