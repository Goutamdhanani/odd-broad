import React from 'react';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

export interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: LucideIcon;
  trend?: {
    value: string;
    positive?: boolean;
  };
  className?: string;
  tone?: 'cyan' | 'blue' | 'default';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subtext,
  icon: Icon,
  trend,
  className,
  tone = 'default',
}) => {
  const toneBorder = {
    cyan: 'hover:border-[var(--bh-hairline-cyan)]',
    blue: 'hover:border-[rgba(37, 99, 235,0.4)]',
    default: 'hover:border-[var(--bh-hairline-strong)]',
  }[tone];

  return (
    <div
      className={cn(
        'bh-panel p-5 relative overflow-hidden transition-all duration-200 group',
        toneBorder,
        className
      )}
    >
      {/* Light pool in corner */}
      <div
        className="absolute -top-12 -right-12 w-28 h-28 rounded-full pointer-events-none opacity-20 blur-xl transition-opacity group-hover:opacity-40"
        style={{
          background:
            tone === 'cyan'
              ? 'radial-gradient(circle, #0071e3, transparent 70%)'
              : tone === 'blue'
              ? 'radial-gradient(circle, #2563EB, transparent 70%)'
              : 'radial-gradient(circle, rgba(255,255,255,0.4), transparent 70%)',
        }}
      />

      <div className="flex items-center justify-between mb-3 relative z-10">
        <span className="type-micro text-[var(--bh-text-muted)] tracking-wider">{label}</span>
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-[rgba(255,255,255,0.05)] border border-[var(--bh-hairline)] flex items-center justify-center text-[var(--bh-cyan)]">
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>

      <div className="type-metric-xl text-[var(--bh-text-primary)] relative z-10">{value}</div>

      {(subtext || trend) && (
        <div className="flex items-center gap-2 mt-2 text-xs relative z-10">
          {trend && (
            <span
              className={cn(
                'font-bold tabular-nums',
                trend.positive ? 'text-[#0071e3]' : 'text-[#FF9EAA]'
              )}
            >
              {trend.value}
            </span>
          )}
          {subtext && <span className="text-[var(--bh-text-muted)]">{subtext}</span>}
        </div>
      )}
    </div>
  );
};
