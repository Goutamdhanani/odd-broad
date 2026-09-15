'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/hooks/useAuth';
import { gupshupApi, shopsApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import {
  MessageSquare,
  ShieldCheck,
  Smartphone,
  Pencil,
  Check,
  X,
  RefreshCw,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface QualityData {
  connected: boolean;
  app: {
    gupshupAppId: string;
    wabaStatus: string;
    phoneNumber: string | null;
    onboardingType: string;
  } | null;
  shopStatus: string;
  health: Record<string, unknown> | null;
  rating: Record<string, unknown> | null;
}

export default function SettingsPage() {
  const { user, shop, refreshProfile } = useAuthStore();
  const [quality, setQuality] = useState<QualityData | null>(null);
  const [loadingQuality, setLoadingQuality] = useState(true);

  // Inline profile editing
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    setBusinessName(shop?.businessName || '');
    setCategory(shop?.category || '');
  }, [shop]);

  const loadQuality = useCallback(async () => {
    setLoadingQuality(true);
    try {
      const { data } = await gupshupApi.getQuality();
      setQuality(data);
    } catch {
      setQuality(null);
    } finally {
      setLoadingQuality(false);
    }
  }, []);

  useEffect(() => {
    loadQuality();
  }, [loadQuality]);

  const handleSaveProfile = async () => {
    if (!businessName.trim()) {
      toast.error('Business name cannot be empty');
      return;
    }
    setSaving(true);
    try {
      await shopsApi.updateMyShop({
        businessName: businessName.trim(),
        category: category.trim() || undefined,
      });
      // Re-pull the authoritative profile row into the global store
      await refreshProfile();
      toast.success('Business profile updated');
      setEditing(false);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update profile'));
    } finally {
      setSaving(false);
    }
  };

  // Map the provider's quality rating to a badge color.
  const rating = (quality?.rating ?? {}) as Record<string, unknown>;
  const ratingValue = String(
    rating.quality ?? rating.rating ?? rating.quality_rating ?? '',
  ).toUpperCase();
  const ratingTone =
    ratingValue.includes('GREEN') || ratingValue.includes('HIGH')
      ? 'badge-green'
      : ratingValue.includes('YELLOW') || ratingValue.includes('MEDIUM')
        ? 'badge-yellow'
        : ratingValue.includes('RED') || ratingValue.includes('LOW')
          ? 'badge-red'
          : 'bg-black/[0.04] text-[#86868b]';

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10 space-y-8 select-none animate-fade-in">
      {/* ─── Page Header ────────────────────────────────────────── */}
      <div className="min-h-[144px] flex flex-col justify-center border-b border-[var(--bh-hairline)] pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="type-overline text-[var(--bh-text-muted)]">
              WORKSPACE CONFIGURATION
            </div>
            <h1 className="type-page-title text-[#1d1d1f]">Account Settings</h1>
            <p className="type-body text-[var(--bh-text-secondary)] max-w-2xl">
              Manage your business profile, WhatsApp connection health, and operator details.
            </p>
          </div>
          <span className="badge badge-cyan text-xs py-1.5 px-3">
            Official Cloud API
          </span>
        </div>
      </div>

      <div className="max-w-4xl space-y-6">
        {/* Business Profile — editable */}
        <div className="bh-card-solid p-7">
          <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-[var(--bh-hairline)]">
            <div className="w-11 h-11 rounded-[14px] bg-[#f5f5f7] border border-[var(--bh-hairline)] flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
              <MessageSquare className="w-5 h-5 text-[#0077ed]" />
            </div>
            <div className="flex-1">
              <h2 className="type-card-title text-[#1d1d1f]">Business Profile</h2>
              <p className="type-label text-[var(--bh-text-muted)]">
                Shown in your WhatsApp business identity and platform records
              </p>
            </div>
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="bh-btn-secondary h-8 px-3 text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleSaveProfile}
                  disabled={saving}
                  className="bh-btn-primary h-8 px-3 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>Save</span>
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setBusinessName(shop?.businessName || '');
                    setCategory(shop?.category || '');
                  }}
                  className="bh-btn-secondary h-8 px-3 text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Cancel</span>
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-[var(--bh-hairline)] gap-4">
              <span className="type-ui text-[var(--bh-text-secondary)] shrink-0">Business Name</span>
              {editing ? (
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="bh-input w-64 text-right"
                />
              ) : (
                <span className="type-ui font-semibold text-[#1d1d1f] text-right">
                  {shop?.businessName || '—'}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between py-3 border-b border-[var(--bh-hairline)] gap-4">
              <span className="type-ui text-[var(--bh-text-secondary)] shrink-0">Account Status</span>
              <span
                className={`badge ${
                  shop?.status === 'active'
                    ? 'badge-green'
                    : shop?.status === 'suspended'
                    ? 'badge-red'
                    : 'badge-yellow'
                }`}
              >
                {shop?.status === 'active' && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
                )}
                {shop?.status || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-[var(--bh-hairline)] gap-4">
              <span className="type-ui text-[var(--bh-text-secondary)] shrink-0">Industry Category</span>
              {editing ? (
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. retail"
                  className="bh-input w-64 text-right"
                />
              ) : (
                <span className="type-table uppercase font-mono text-[#0077ed] text-right">
                  {shop?.category || '—'}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="type-ui text-[var(--bh-text-secondary)]">Shop ID (UUID)</span>
              <span className="type-label font-mono text-[#0077ed] select-all">
                {shop?.id || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* User Account */}
        <div className="bh-card-solid p-7">
          <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-[var(--bh-hairline)]">
            <div className="w-11 h-11 rounded-[14px] bg-[#f5f5f7] border border-[var(--bh-hairline)] flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
              <ShieldCheck className="w-5 h-5 text-[#0077ed]" />
            </div>
            <div>
              <h2 className="type-card-title text-[#1d1d1f]">Operator Credentials</h2>
              <p className="type-label text-[var(--bh-text-muted)]">
                Active logged in session profile
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-[var(--bh-hairline)]">
              <span className="type-ui text-[var(--bh-text-secondary)]">Operator Name</span>
              <span className="type-ui font-semibold text-[#1d1d1f]">{user?.name || '—'}</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-[var(--bh-hairline)]">
              <span className="type-ui text-[var(--bh-text-secondary)]">Email Address</span>
              <span className="type-ui font-medium text-[#1d1d1f]">{user?.email || '—'}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="type-ui text-[var(--bh-text-secondary)]">Assigned Role</span>
              <span className="badge badge-cyan text-[11px] font-mono uppercase">
                {user?.role || 'Shop Owner'}
              </span>
            </div>
          </div>
        </div>

        {/* WhatsApp Connectivity — real provider data */}
        <div className="bh-card-solid p-7">
          <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-[var(--bh-hairline)]">
            <div className="w-11 h-11 rounded-[14px] bg-[#f5f5f7] border border-[var(--bh-hairline)] flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
              <Smartphone className="w-5 h-5 text-[#0077ed]" />
            </div>
            <div className="flex-1">
              <h2 className="type-card-title text-[#1d1d1f]">WhatsApp Connectivity</h2>
              <p className="type-label text-[var(--bh-text-muted)]">
                Live status reported by the provider for your number
              </p>
            </div>
            <button
              onClick={loadQuality}
              className="p-2 rounded-lg text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.03] cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={cn('w-4 h-4', loadingQuality && 'animate-spin')} />
            </button>
          </div>

          {loadingQuality ? (
            <div className="p-8 flex items-center justify-center text-[#86868b]">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : !quality || !quality.app ? (
            <div className="p-5 rounded-[16px] bg-white border border-[var(--bh-hairline)] flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
              <div className="text-xs text-[#6e6e73]">
                No WhatsApp number connected yet. Start onboarding to connect one.
              </div>
            </div>
          ) : (
            <div className="p-4.5 rounded-[16px] bg-white border border-[var(--bh-hairline)] space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--bh-text-muted)]">Connection:</span>
                <span
                  className={cn(
                    'badge text-[10px]',
                    quality.connected ? 'badge-green' : 'badge-yellow',
                  )}
                >
                  {quality.app.wabaStatus?.toUpperCase() || 'PENDING'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--bh-text-muted)]">WhatsApp Number:</span>
                <span className="font-semibold text-[#1d1d1f] font-mono">
                  {quality.app.phoneNumber || 'Not assigned yet'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--bh-text-muted)]">Quality Rating:</span>
                {ratingValue ? (
                  <span className={cn('badge text-[10px]', ratingTone)}>
                    {ratingValue}
                  </span>
                ) : (
                  <span className="text-[11px] text-[#86868b]">
                    {quality.rating?.error ? 'Unavailable (provider did not report)' : 'Not reported yet'}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--bh-text-muted)]">Provider App ID:</span>
                <span className="font-mono text-[11px] text-[#0077ed] select-all">
                  {quality.app.gupshupAppId}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--bh-hairline)]">
                <span className="text-[var(--bh-text-muted)]">Webhook Status:</span>
                <span className="text-emerald-600 font-semibold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Listening to inbound events
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
