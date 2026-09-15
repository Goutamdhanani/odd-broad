'use client';

import React from 'react';
import { cn } from '@/lib/utils';

export type LiquidGlassProps = {
  children?: React.ReactNode;
  className?: string;
  shape?: 'blob' | 'squircle' | 'chip';
  tone?: 'cyan' | 'blue' | 'indigo';
  intensity?: 'subtle' | 'hero';
  decorative?: boolean;
  interactive?: boolean;
  onClick?: () => void;
};

export const LiquidGlass: React.FC<LiquidGlassProps> = ({
  children,
  className,
  shape = 'squircle',
  tone = 'cyan',
  intensity = 'subtle',
  decorative = true,
  interactive = false,
  onClick,
}) => {
  const shapeClass = {
    blob: 'liquid-glass--blob',
    squircle: 'liquid-glass--squircle',
    chip: 'liquid-glass--chip',
  }[shape];

  const toneStyle = {
    cyan: {
      fill: 'linear-gradient(142deg, rgba(199, 235, 255, 0.5) 0%, rgba(160, 210, 250, 0.3) 32%, rgba(120, 175, 245, 0.3) 75%, rgba(230, 245, 255, 0.4) 100%)',
      glow: 'radial-gradient(45% 45% at 30% 25%, rgba(190, 230, 255, 0.5) 0%, transparent 65%)',
      rim: 'linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(180, 220, 250, 0.4) 42%, rgba(255, 255, 255, 0.55) 74%, rgba(150, 200, 245, 0.35))',
    },
    blue: {
      fill: 'linear-gradient(142deg, rgba(180, 220, 255, 0.45) 0%, rgba(140, 190, 250, 0.35) 40%, rgba(110, 165, 240, 0.4) 80%, rgba(215, 240, 255, 0.35) 100%)',
      glow: 'radial-gradient(45% 45% at 30% 25%, rgba(170, 215, 255, 0.45) 0%, transparent 65%)',
      rim: 'linear-gradient(135deg, rgba(255, 255, 255, 0.85), rgba(150, 200, 250, 0.35) 45%, rgba(255, 255, 255, 0.5) 75%, rgba(120, 180, 240, 0.3))',
    },
    indigo: {
      fill: 'linear-gradient(142deg, rgba(205, 205, 255, 0.45) 0%, rgba(170, 170, 250, 0.32) 35%, rgba(150, 150, 245, 0.38) 80%, rgba(230, 230, 255, 0.35) 100%)',
      glow: 'radial-gradient(45% 45% at 30% 25%, rgba(200, 200, 255, 0.45) 0%, transparent 65%)',
      rim: 'linear-gradient(135deg, rgba(255, 255, 255, 0.85), rgba(175, 175, 250, 0.35) 45%, rgba(255, 255, 255, 0.5) 75%, rgba(150, 150, 245, 0.3))',
    },
  }[tone];

  const intensityMultiplier = intensity === 'hero' ? 'scale-105' : '';

  if (interactive) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'liquid-glass relative text-left group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bh-cyan)] transition-transform duration-200 active:scale-[0.985] hover:border-[var(--bh-hairline-cyan)]',
          shapeClass,
          intensityMultiplier,
          className
        )}
      >
        <div className="liquid-glass__refracted-scene" />
        <div className="liquid-glass__body" style={{ background: toneStyle.fill }} />
        <div className="liquid-glass__caustic" style={{ background: toneStyle.glow }} />
        <div className="liquid-glass__rim" style={{ background: toneStyle.rim }} />
        {children && <div className="liquid-glass__content p-5">{children}</div>}
      </button>
    );
  }

  return (
    <div
      aria-hidden={decorative ? 'true' : undefined}
      className={cn(
        'liquid-glass select-none',
        decorative && 'pointer-events-none',
        shapeClass,
        intensityMultiplier,
        className
      )}
    >
      <div className="liquid-glass__refracted-scene" />
      <div className="liquid-glass__body" style={{ background: toneStyle.fill }} />
      <div className="liquid-glass__caustic" style={{ background: toneStyle.glow }} />
      <div className="liquid-glass__rim" style={{ background: toneStyle.rim }} />
      {children && <div className="liquid-glass__content">{children}</div>}
    </div>
  );
};
