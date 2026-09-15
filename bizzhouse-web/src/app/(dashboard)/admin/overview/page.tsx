'use client';

import { useState, useEffect, useCallback } from 'react';
import { shopsApi } from '@/lib/api';
import { formatPaise } from '@/lib/utils';
import {
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';
import Link from 'next/link';
import type { ShopSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PlatformStats {
  shops: {
    total: number;
    active: number;
    onboarding: number;
    suspended: number;
    totalWalletBalancePaise: number;
  };
  messages: {
    total: number;
    outbound: number;
    inbound: number;
    last24h: number;
    outboundLast24h: number;
  };
  wallet: {
    totalTopupsPaise: number;
    totalDebitsPaise: number;
    totalRefundsPaise: number;
  };
  broadcasts: {
    total: number;
    active: number;
    messagesSent: number;
  };
}

export default function AdminOverviewPage() {
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [shopsRes, statsRes] = await Promise.all([
        shopsApi.listAll(1, 100),
        shopsApi.platformStats(),
      ]);
      setShops(shopsRes.data.data || []);
      setStats(statsRes.data);
    } catch {
      // keep last loaded data; the table shows whatever shops loaded
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalBalance = stats?.shops.totalWalletBalancePaise ?? 0;
  const activeShops = stats?.shops.active ?? shops.filter((s) => s.status === 'active').length;

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10 space-y-8 select-none animate-fade-in">
      {/* â"€â"€â"€ 140â€"156 px Page Header â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div className="min-h-[144px] flex flex-col justify-center border-b border-[var(--bh-hairline)] pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="type-overline text-[var(--bh-text-muted)]">
              SUPER ADMINISTRATOR DASHBOARD
            </div>
            <h1 className="type-page-title text-[#1d1d1f]">Platform Overview</h1>
            <p className="type-body text-[var(--bh-text-secondary)] max-w-2xl">
              Real-time platform throughput, aggregated merchant escrow balances, and active WhatsApp WABA accounts.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={loadData}
              className="bh-btn-secondary h-12 px-4 text-sm flex items-center gap-2 cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            </button>
            <Link href="/admin/wallet">
              <button className="bh-btn-secondary h-12 px-5 text-sm cursor-pointer">
                View Ledger
              </button>
            </Link>
            <Link href="/admin/shops">
              <button className="bh-btn-primary h-12 px-6 text-sm flex items-center gap-2 cursor-pointer shadow-[0_2px_10px_rgba(0,113,227,0.2)]">
                <span>Manage Shops</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Metric Cards — every value from GET /shops/admin/stats ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            label: 'Total Platform Messages',
            value: (stats?.messages.total ?? 0).toLocaleString('en-IN'),
            meta: `${stats?.messages.last24h ?? 0} in the last 24 hours`,
            indicator: '#4ADE80',
          },
          {
            label: 'Active WhatsApp Tenants',
            value: `${activeShops} / ${stats?.shops.total ?? shops.length}`,
            meta: `${stats?.shops.onboarding ?? 0} onboarding · ${stats?.shops.suspended ?? 0} suspended`,
            indicator: '#0077ed',
          },
          {
            label: 'Merchant Escrow Reserves',
            value: formatPaise(totalBalance),
            meta: `${formatPaise(stats?.wallet.totalTopupsPaise ?? 0)} topped up lifetime`,
            indicator: '#0077ed',
          },
          {
            label: 'Broadcasts',
            value: `${stats?.broadcasts.active ?? 0} active`,
            meta: `${(stats?.broadcasts.messagesSent ?? 0).toLocaleString('en-IN')} messages sent via campaigns`,
            indicator: '#A78BFA',
          },
        ].map((s, idx) => (
          <div
            key={idx}
            className="bh-card-solid h-[184px] p-6 flex flex-col justify-between"
          >
            <div>
              <div className="type-label mb-2.5">{s.label}</div>
              <div className="type-metric-primary text-[#1d1d1f] tabular-nums">
                {s.value}
              </div>
            </div>
            <div className="type-table text-[var(--bh-text-muted)] flex items-center gap-2 pt-3 border-t border-[var(--bh-hairline-subtle)]">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: s.indicator }}
              />
              <span>{s.meta}</span>
            </div>
          </div>
        ))}
      </div>

      {/* â"€â"€â"€ Bounded Table Plane: Registered Tenants â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
      <div className="bh-card-solid overflow-hidden border border-[var(--bh-hairline)] shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
        <div className="p-6 border-b border-[var(--bh-hairline)] flex items-center justify-between bg-[#f5f5f7]">
          <div>
            <h2 className="type-section-title text-xl text-[#1d1d1f]">Active Merchants</h2>
            <p className="type-table text-[var(--bh-text-muted)] mt-1">
              Registered business accounts and current wallet balances
            </p>
          </div>
          <Link href="/admin/shops" className="type-ui text-xs text-[#0077ed] hover:underline">
            View all shops →
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--bh-hairline)] text-[12px] font-semibold text-[var(--bh-text-muted)] uppercase tracking-wider bg-[#fafafa]">
                <th className="py-4 px-6">Business Name</th>
                <th className="py-4 px-5">Status</th>
                <th className="py-4 px-5">Wallet Balance</th>
                <th className="py-4 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--bh-hairline)]">
              {!loading && shops.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 px-6 text-center type-ui text-[var(--bh-text-muted)]">
                    No shops registered yet. Shops appear here as merchants sign up.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={4} className="py-10 px-6 text-center type-ui text-[var(--bh-text-muted)]">
                    Loading shops…
                  </td>
                </tr>
              )}
              {shops.map((s) => (
                <tr key={s.id} className="bh-table-row">
                  <td className="py-4 px-6">
                    <div className="type-ui font-semibold text-[#1d1d1f]">{s.businessName}</div>
                    <div className="type-label text-[11px] font-mono text-[var(--bh-text-muted)]">
                      {s.id}
                    </div>
                  </td>
                  <td className="py-4 px-5">
                    <span
                      className={`badge ${
                        s.status === 'active'
                          ? 'badge-green'
                          : s.status === 'suspended'
                          ? 'badge-red'
                          : 'badge-yellow'
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="py-4 px-5 type-table font-bold font-mono text-[#0077ed] tabular-nums">
                    {formatPaise(s.walletBalancePaise || 0)}
                  </td>
                  <td className="py-4 px-6 text-right">
                    <Link
                      href="/admin/wallet"
                      className="px-3 py-1.5 rounded-[10px] bg-[#f5f5f7] border border-[var(--bh-hairline)] hover:border-[var(--bh-hairline-strong)] text-xs text-[#1d1d1f] font-semibold transition-colors"
                    >
                      Credit Wallet
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
