import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format paise to rupee string: 15000 → "₹150.00"
 */
export function formatPaise(paise: number | undefined | null): string {
  if (paise == null || isNaN(paise)) return '₹0.00';
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Extract user-friendly error message from Axios / NestJS error response
 */
export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as { response?: { data?: { message?: unknown } }; message?: unknown };
  const msg = e?.response?.data?.message;
  if (Array.isArray(msg) && msg.length > 0) {
    return String(msg[0]);
  }
  if (typeof msg === 'string' && msg.trim()) {
    return msg;
  }
  if (e?.message && typeof e.message === 'string') {
    return e.message;
  }
  return fallback;
}

/**
 * Format a phone number for display: 919876543210 → +91 98765 43210
 */
export function formatPhone(waId: string): string {
  if (!waId) return '';
  if (waId.startsWith('91') && waId.length === 12) {
    return `+91 ${waId.slice(2, 7)} ${waId.slice(7)}`;
  }
  return `+${waId}`;
}

/**
 * Relative time: "just now", "2m ago", "1h ago", "yesterday", etc.
 */
export function relativeTime(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return 'yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * Get initials from a name: "Sneha Patel" → "SP"
 */
export function getInitials(name: string): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
