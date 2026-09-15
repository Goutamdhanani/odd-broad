import React from 'react';
import { cn } from '@/lib/utils';

export interface GlassChipProps {
  children?: React.ReactNode;
  label?: string;
  icon?: React.ReactNode;
  active?: boolean;
  tone?: 'cyan' | 'blue' | 'indigo' | 'neutral';
  className?: string;
  onClick?: () => void;
}

export const GlassChip: React.FC<GlassChipProps> = ({
  children,
  label,
  icon,
  active = false,
  tone = 'cyan',
  className,
  onClick,
}) => {
  const Component = onClick ? 'button' : 'div';
  const content = label || children;

  const toneClasses = {
    cyan: active
      ? 'bg-[rgba(56, 189, 248,0.18)] text-[#0071e3] border-[rgba(56, 189, 248,0.45)] shadow-[0_2px_10px_rgba(0,113,227,0.2)]'
      : 'bg-[rgba(56, 189, 248,0.08)] text-[#0077ed] border-[rgba(56, 189, 248,0.25)] hover:border-[rgba(56, 189, 248,0.4)]',
    blue: active
      ? 'bg-[rgba(37, 99, 235,0.22)] text-[#0077ed] border-[rgba(37, 99, 235,0.5)] shadow-[0_0_15px_rgba(37, 99, 235,0.3)]'
      : 'bg-[rgba(37, 99, 235,0.1)] text-[#0077ed] border-[rgba(37, 99, 235,0.3)] hover:border-[rgba(37, 99, 235,0.5)]',
    indigo: active
      ? 'bg-[rgba(99,102,241,0.22)] text-[#C7D2FE] border-[rgba(99,102,241,0.5)] shadow-[0_0_15px_rgba(99,102,241,0.3)]'
      : 'bg-[rgba(99,102,241,0.1)] text-[#C7D2FE] border-[rgba(99,102,241,0.3)] hover:border-[rgba(99,102,241,0.5)]',
    neutral: active
      ? 'bg-[rgba(255,255,255,0.12)] text-[#1d1d1f] border-white/30'
      : 'bg-[rgba(255,255,255,0.05)] text-[var(--bh-text-secondary)] border-[var(--bh-hairline)] hover:border-[var(--bh-hairline-strong)] hover:text-[#1d1d1f]',
  };

  return (
    <Component
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tabular-nums border transition-all duration-200 backdrop-blur-md',
        toneClasses[tone],
        onClick && 'cursor-pointer active:scale-95',
        className
      )}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{content}</span>
    </Component>
  );
};
