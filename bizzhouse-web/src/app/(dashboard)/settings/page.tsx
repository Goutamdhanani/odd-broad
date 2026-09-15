'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/hooks/useAuth';
import { gupshupApi, shopsApi, ConnectedNumber } from '@/lib/api';
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
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const HEALTH_DOT: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
};

const HEALTH_LABEL: Record<string, string> = {
  green: 'Healthy',
  yellow: 'Warning',
  red: 'At risk',
};

export default function SettingsPage() {
  const router = useRouter();
  const { user, shop, refreshProfile } = useAuthStore();
  const [numbers, setNumbers] = useState<ConnectedNumber[]>([]);
  const [loadingNumbers, setLoadingNumbers] = useState(true);
  const [refreshingRatings, setRefreshingRatings] = useState(false);

  // Inline profile editing
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    setBusinessName(shop?.businessName || '');
    setCategory(shop?.category || '');
  }, [shop]);

  const loadNumbers = useCallback(async () => {
    setLoadingNumbers(true);
    try {
      const { data } = await gupshupApi.getNumbers();
      setNumbers(data.numbers || []);
    } catch {
      setNumbers([]);
    } finally {
      setLoadingNumbers(false);
    }
  }, []);

  useEffect(() => {
    loadNumbers();
  }, [loadNumbers]);

  const handleRefreshRatings = async () => {
    setRefreshingRatings(true);
    try {
      const { data } = await gupshupApi.refreshRatings();
      if (data.refreshed) {
        setNumbers(data.numbers || []);
        toast.success('Quality ratings refreshed from Gupshup');
      } else {
        toast.info(data.reason || 'Ratings were checked recently — showing cached values');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not refresh ratings'));
    } finally {
      setRefreshingRatings(false);
    }
  };

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

  const liveNumbers = numbers.filter((n) => n.wabaStatus === 'live');

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
              Manage your business profile, WhatsApp numbers and their health, and operator details.
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

        {/* WhatsApp Numbers — every connected number + health (spec §2.3/2.4) */}
        <div className="bh-card-solid p-7">
          <div className="flex items-center gap-3.5 mb-6 pb-4 border-b border-[var(--bh-hairline)]">
            <div className="w-11 h-11 rounded-[14px] bg-[#f5f5f7] border border-[var(--bh-hairline)] flex items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
              <Smartphone className="w-5 h-5 text-[#0077ed]" />
            </div>
            <div className="flex-1">
              <h2 className="type-card-title text-[#1d1d1f]">
                WhatsApp Numbers ({liveNumbers.length} live)
              </h2>
              <p className="type-label text-[var(--bh-text-muted)]">
                Meta quality rating + your own sending stats, per number
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={handleRefreshRatings}
                disabled={refreshingRatings}
                className="p-2 rounded-lg text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.03] cursor-pointer disabled:opacity-50"
                title="Refresh quality ratings from Gupshup (updates ~daily)"
              >
                <RefreshCw className={cn('w-4 h-4', refreshingRatings && 'animate-spin')} />
              </button>
              <button
                onClick={() => router.push('/onboarding')}
                className="bh-btn-secondary h-8 px-3 text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Connect number</span>
              </button>
            </div>
          </div>

          {loadingNumbers ? (
            <div className="p-8 flex items-center justify-center text-[#86868b]">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : numbers.length === 0 ? (
            <div className="p-5 rounded-[16px] bg-white border border-[var(--bh-hairline)] flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
              <div className="text-xs text-[#6e6e73]">
                No WhatsApp number connected yet. Connect one to start sending.
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {numbers.map((n) => (
                <div
                  key={n.gupshupAppId}
                  className="p-4 rounded-[16px] bg-white border border-[var(--bh-hairline)] space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          'w-2.5 h-2.5 rounded-full',
                          n.wabaStatus === 'live'
                            ? HEALTH_DOT[n.health?.light || 'green']
                            : 'bg-[#86868b] animate-pulse',
                        )}
                      />
                      <span className="text-sm font-bold text-[#1d1d1f] font-mono">
                        {n.phoneNumber ? `+${n.phoneNumber}` : 'Number pending…'}
                      </span>
                      {n.wabaStatus === 'live' && (
                        <span className="badge badge-cyan text-[10px]">
                          {HEALTH_LABEL[n.health?.light || 'green']}
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        'badge text-[10px]',
                        n.wabaStatus === 'live' && 'badge-green',
                        n.wabaStatus === 'pending' && 'badge-yellow',
                        n.wabaStatus === 'rejected' && 'badge-red',
                      )}
                    >
                      {n.wabaStatus?.toUpperCase() || 'PENDING'}
                    </span>
                  </div>

                  {n.wabaStatus === 'live' && n.health && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                      <div>
                        <div className="text-[10px] text-[var(--bh-text-muted)] uppercase tracking-wide">
                          Meta Rating
                        </div>
                        <div
                          className={cn(
                            'text-xs font-bold mt-0.5',
                            n.health.qualityRating === 'GREEN' && 'text-emerald-600',
                            n.health.qualityRating === 'YELLOW' && 'text-amber-600',
                            n.health.qualityRating === 'RED' && 'text-red-600',
                            !n.health.qualityRating && 'text-[#86868b]',
                          )}
                        >
                          {n.health.qualityRating || 'Not reported'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--bh-text-muted)] uppercase tracking-wide">
                          Tier
                        </div>
                        <div className="text-xs font-semibold text-[#1d1d1f] mt-0.5 font-mono">
                          {n.health.messagingTier || '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--bh-text-muted)] uppercase tracking-wide">
                          Today&apos;s Usage
                        </div>
                        <div className="text-xs font-semibold text-[#1d1d1f] mt-0.5 tabular-nums">
                          {n.health.sentLast24h}/{n.health.dailyCeiling}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-[var(--bh-text-muted)] uppercase tracking-wide">
                          24h Failure Rate
                        </div>
                        <div
                          className={cn(
                            'text-xs font-semibold mt-0.5 tabular-nums',
                            n.health.failureRateLast24h > 0.1 ? 'text-amber-600' : 'text-[#1d1d1f]',
                          )}
                        >
                          {(n.health.failureRateLast24h * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>
                  )}

                  {n.wabaStatus === 'live' && n.health?.reasons?.length ? (
                    <div className="pt-1 space-y-1">
                      {n.health.reasons.map((r, i) => (
                        <div key={i} className="text-[11px] text-amber-700 flex items-start gap-1.5">
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                          {r}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="text-[10px] text-[var(--bh-text-muted)] pt-1 border-t border-[var(--bh-hairline)] flex items-center justify-between">
                    <span className="font-mono select-all">{n.gupshupAppId}</span>
                    <span className="text-emerald-600 font-semibold flex items-center gap-1.5">
                      {n.wabaStatus === 'live' && (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Receiving inbound events
                        </>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
