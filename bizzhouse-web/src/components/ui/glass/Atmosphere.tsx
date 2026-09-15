import React from 'react';
import { cn } from '@/lib/utils';

export const Atmosphere: React.FC<{ className?: string }> = ({ className }) => {
  return <div className={cn('bh-atmosphere', className)} aria-hidden="true" />;
};
