'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { shopsApi } from '@/lib/api';
import { formatPaise, cn, getErrorMessage } from '@/lib/utils';
import {
  MessageSquareText,
  ArrowDownLeft,
  Users,
  FileText,
  Radio,
  Loader2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

interface AnalyticsPoint {
  day: string;
  outbound: number;
  inbound: number;
  spendPaise: number;
}

interface ShopStats {
  shop: { businessName: string; status: string; walletBalancePaise: number };
  whatsapp: { connected: boolean; phoneNumber: string | null };
  messages: {
    outboundLast7d: number;
    inboundLast7d: number;
    sentTotal: number;
    readTotal: number;
    failedTotal: number;
    readRate: number | null;
  };
  contacts: { total: number; optedIn: number; activeLast24h: number };
  templates: { approved: number; inReview: number; rejected: number };
  broadcasts: { active: number };
}

export default function OverviewPage() {
  const [stats, setStats] = useState<ShopStats | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPoint[]>([]);
  const [range, setRange] = useState<7 | 30>(7);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (days: 7 | 30 = range) => {
    setRefreshing(true);
    try {
      const [statsRes, analyticsRes] = await Promise.all([
        shopsApi.myStats(),
        shopsApi.myAnalytics(days),
      ]);
      setStats(statsRes.data);
      setAnalytics(analyticsRes.data.series || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load your dashboard'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !stats) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#86868b]">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const { messages, contacts, templates } = stats;

  const cards = [
    {
      label: 'Messages sent (7 days)',
      value: messages.outboundLast7d.toLocaleString('en-IN'),
      sub: `${messages.sentTotal.toLocaleString('en-IN')} all time`,
      icon: MessageSquareText,
      tone: 'text-[#0071e3]',
    },
    {
      label: 'Messages received (7 days)',
      value: messages.inboundLast7d.toLocaleString('en-IN'),
      sub: `${contacts.activeLast24h} customer(s) active in 24h`,
      icon: ArrowDownLeft,
      tone: 'text-emerald-600',
    },
    {
      label: 'Read rate',
      value: messages.readRate != null ? `${messages.readRate}%` : '—',
      sub: messages.failedTotal > 0 ? `${messages.failedTotal} failed — refunded` : 'No failures',
      icon: CheckCircle2,
      tone: 'text-[#1d1d1f]',
    },
    {
      label: 'Opted-in contacts',
      value: `${contacts.optedIn.toLocaleString('en-IN')} / ${contacts.total.toLocaleString('en-IN')}`,
      sub: 'eligible for campaigns',
      icon: Users,
      tone: 'text-[#0071e3]',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-6 lg:p-8 space-y-6 select-none animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-black/[0.08]">
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-[#86868b]">
            {stats.shop.businessName}
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#1d1d1f] mt-0.5">
            Overview
          </h1>
        </div>
        <button
          onClick={() => load()}
          className="p-2 rounded-lg text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.04] cursor-pointer self-start sm:self-auto"
          title="Refresh"
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
        </button>
      </div>

      {/* WhatsApp connection strip */}
      <div
        className={cn(
          'p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3',
          stats.whatsapp.connected
            ? 'bg-emerald-500/[0.06] border-emerald-500/20'
            : 'bg-amber-500/[0.06] border-amber-500/25',
        )}
      >
        <div className="flex items-center gap-3">
          {stats.whatsapp.connected ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          )}
          <div>
            <div className="text-[13px] font-semibold text-[#1d1d1f]">
              {stats.whatsapp.connected
                ? `WhatsApp connected — ${stats.whatsapp.phoneNumber}`
                : 'WhatsApp not connected yet'}
            </div>
            <div className="text-[11px] text-[#6e6e73]">
              {stats.whatsapp.connected
                ? 'Customers can reach you on the official API.'
                : 'Connect a number to start receiving messages.'}
            </div>
          </div>
        </div>
        {!stats.whatsapp.connected && (
          <Link href="/onboarding" className="bh-btn-primary h-8 px-3.5 text-xs shrink-0">
            Connect WhatsApp
          </Link>
        )}
      </div>

      {/* Metric cards — real DB values */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="p-4.5 rounded-xl bg-white border border-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-[#6e6e73]">{c.label}</span>
              <c.icon className={cn('w-4 h-4', c.tone)} />
            </div>
            <div className="text-2xl lg:text-3xl font-bold tracking-tight text-[#1d1d1f] tabular-nums my-2">
              {c.value}
            </div>
            <div className="text-[10px] font-medium text-[#86868b]">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Analytics — real daily buckets from /shops/me/analytics */}
      <div className="rounded-2xl bg-white border border-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-[#1d1d1f]">Activity</h2>
            <p className="text-[11px] text-[#86868b]">
              Messages per day ·{' '}
              {analytics.length > 0 &&
                formatPaise(analytics.reduce((a, p) => a + p.spendPaise, 0))}{' '}
              spent in range
            </p>
          </div>
          <div className="flex gap-1">
            {([7, 30] as const).map((d) => (
              <button
                key={d}
                onClick={() => {
                  setRange(d);
                  load(d);
                }}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors',
                  range === d
                    ? 'bg-[#0071e3] text-white'
                    : 'bg-black/[0.04] text-[#6e6e73] hover:text-[#1d1d1f]',
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {analytics.length === 0 ? (
          <p className="text-xs text-[#86868b] py-8 text-center">
            No messaging activity in this range yet.
          </p>
        ) : (
          <div className="flex items-end gap-1 h-32">
            {analytics.map((p) => {
              const max = Math.max(...analytics.map((x) => x.outbound + x.inbound), 1);
              const hOut = (p.outbound / max) * 100;
              const hIn = (p.inbound / max) * 100;
              return (
                <div
                  key={p.day}
                  className="flex-1 flex flex-col justify-end items-center gap-0.5 group relative"
                  title={`${p.day}: ${p.outbound} sent · ${p.inbound} received · ${formatPaise(p.spendPaise)}`}
                >
                  <div className="w-full flex flex-col justify-end items-stretch gap-0.5 h-full">
                    {hIn > 0 && (
                      <div className="rounded-t bg-emerald-400/70 w-full" style={{ height: `${hIn}%` }} />
                    )}
                    {hOut > 0 && (
                      <div className="rounded-t bg-[#0071e3] w-full" style={{ height: `${hOut}%` }} />
                    )}
                  </div>
                  <span className="text-[8px] text-[#86868b] tabular-nums">{p.day.slice(8)}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="flex gap-4 mt-3 text-[10px] text-[#86868b]">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-[#0071e3]" /> Sent
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-emerald-400/70" /> Received
          </span>
        </div>
      </div>

      {/* Wallet + templates/broadcasts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl bg-white border border-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-medium text-[#6e6e73]">Wallet balance</div>
              <div className="text-3xl font-bold tracking-tight text-[#1d1d1f] tabular-nums mt-1">
                {formatPaise(stats.shop.walletBalancePaise)}
              </div>
              <div className="text-[11px] text-[#86868b] mt-1">
                Debited per message · refunded on failures
              </div>
            </div>
            <Wallet className="w-8 h-8 text-[#0071e3]/30" />
          </div>
          <Link
            href="/wallet"
            className="bh-btn-secondary h-8 px-3.5 text-xs mt-4 inline-flex items-center gap-1.5"
          >
            <span>Manage wallet</span>
          </Link>
        </div>

        <div className="p-5 rounded-xl bg-white border border-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04)] space-y-3">
          <div className="text-[11px] font-medium text-[#6e6e73]">Templates & campaigns</div>
          <div className="grid grid-cols-3 gap-2.5">
            <Link href="/templates" className="p-3 rounded-lg bg-emerald-500/[0.07] border border-emerald-500/15 hover:border-emerald-500/30 transition-colors cursor-pointer">
              <div className="text-lg font-bold text-emerald-600 tabular-nums">{templates.approved}</div>
              <div className="text-[10px] text-[#6e6e73]">Approved</div>
            </Link>
            <Link href="/templates" className="p-3 rounded-lg bg-amber-500/[0.07] border border-amber-500/20 hover:border-amber-500/35 transition-colors cursor-pointer">
              <div className="text-lg font-bold text-amber-600 tabular-nums">{templates.inReview}</div>
              <div className="text-[10px] text-[#6e6e73]">In review</div>
            </Link>
            <Link href="/broadcasts" className="p-3 rounded-lg bg-[#0071e3]/[0.06] border border-[#0071e3]/15 hover:border-[#0071e3]/30 transition-colors cursor-pointer">
              <div className="text-lg font-bold text-[#0071e3] tabular-nums flex items-center gap-1">
                <Radio className="w-3.5 h-3.5" />
                {stats.broadcasts.active}
              </div>
              <div className="text-[10px] text-[#6e6e73]">Active campaigns</div>
            </Link>
          </div>
          {templates.approved === 0 && (
            <p className="text-[11px] text-[#86868b]">
              Submit a template for approval to reach customers outside the 24-hour window.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
