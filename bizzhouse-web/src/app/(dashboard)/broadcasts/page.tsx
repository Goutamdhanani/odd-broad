'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Radio,
  Send,
  Plus,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Loader2,
  X,
  RefreshCw,
  Users,
  MessageSquareText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn, getErrorMessage } from '@/lib/utils';
import { splitTemplatePreview } from '@/lib/template-preview';
import { broadcastsApi, templatesApi, gupshupApi, ConnectedNumber } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface Broadcast {
  id: string;
  name: string;
  templateName: string;
  templateLanguage: string;
  audienceTag: string | null;
  status: 'queued' | 'sending' | 'completed' | 'failed' | 'cancelled';
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  costPaise: number;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

interface TemplateRow {
  id: string;
  elementName: string;
  category: string;
  status: string;
  language: string;
  body: string;
  templateType?: string;
  cards?: Array<{ body: string }> | null;
}

const HEALTH_LIGHT: Record<string, { dot: string; label: string }> = {
  green: { dot: 'bg-emerald-500', label: 'Healthy' },
  yellow: { dot: 'bg-amber-500', label: 'Warning' },
  red: { dot: 'bg-red-500', label: 'At risk' },
};

const fmtRs = (paise: number) =>
  `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const STATUS_BADGE: Record<Broadcast['status'], string> = {
  completed: 'badge-green',
  sending: 'badge-cyan',
  queued: 'badge-yellow',
  failed: 'badge-red',
  cancelled: 'bg-black/[0.04] text-[#6e6e73]',
};

export default function BroadcastsPage() {
  const router = useRouter();
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  // Campaign delivery detail (spec §2.1) — fetched from live message statuses
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stats, setStats] = useState<
    Record<string, Awaited<ReturnType<typeof broadcastsApi.stats>>['data']>
  >({});
  const [statsLoading, setStatsLoading] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Wizard state
  const [broadcastName, setBroadcastName] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>(''); // '' = all opted-in
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [estimate, setEstimate] = useState<{
    recipientCount: number;
    unitCostPaise: number;
    estimatedCostPaise: number;
  } | null>(null);
  const [bodyVariables, setBodyVariables] = useState<string[]>([]);
  // Sending number (spec §2.4): '' = let the health-aware router pick
  const [numbers, setNumbers] = useState<ConnectedNumber[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<string>('');
  const [confirmUnhealthy, setConfirmUnhealthy] = useState(false);

  const liveNumbers = useMemo(() => numbers.filter((n) => n.wabaStatus === 'live'), [numbers]);
  const selectedNumberRow = liveNumbers.find((n) => n.gupshupAppId === selectedNumber);
  const pinnedIsRed = selectedNumberRow?.health.light === 'red';

  const approvedTemplates = useMemo(
    () => templates.filter((t) => t.status === 'APPROVED'),
    [templates],
  );

  // Distinct {{N}} placeholders in the selected template's body
  const selectedTemplateRow = approvedTemplates.find(
    (t) => t.elementName === selectedTemplate,
  );
  // Distinct {{N}} placeholders across the body AND carousel card bodies —
  // card variables continue the main body's numbering (spec §3.4)
  const variableCount = selectedTemplateRow
    ? new Set(
        [
          ...(selectedTemplateRow.body || '').matchAll(/\{\{\d+\}\}/g),
          ...(selectedTemplateRow.cards || []).flatMap((c) =>
            [...(c.body || '').matchAll(/\{\{\d+\}\}/g)],
          ),
        ].map((m) => m[0]),
      ).size
    : 0;

  const allTags = useMemo(() => {
    // Audience options derived from broadcasts seen so far + defaults;
    // the estimate endpoint is the source of truth for counts.
    const seen = new Set<string>();
    broadcasts.forEach((b) => b.audienceTag && seen.add(b.audienceTag));
    return Array.from(seen);
  }, [broadcasts]);

  const loadBroadcasts = useCallback(async () => {
    try {
      const { data } = await broadcastsApi.list(1, 50);
      setBroadcasts(data.data || []);
    } catch {
      toast.error('Could not load broadcasts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBroadcasts();
    templatesApi
      .list()
      .then(({ data }) => setTemplates(Array.isArray(data) ? data : data?.data || []))
      .catch(() => toast.error('Could not load templates'));
  }, [loadBroadcasts]);

  // Live progress over websocket
  useEffect(() => {
    const socket = getSocket();
    const onUpdate = (update: Partial<Broadcast> & { id: string }) => {
      setBroadcasts((prev) =>
        prev.map((b) => (b.id === update.id ? { ...b, ...update } : b)),
      );
    };
    socket.on('broadcast:update', onUpdate);
    return () => {
      socket.off('broadcast:update', onUpdate);
    };
  }, []);

  // Sending numbers + their health lights — refreshed whenever the wizard opens
  useEffect(() => {
    if (!showBuilder) return;
    gupshupApi
      .getNumbers()
      .then(({ data }) => setNumbers(data.numbers || []))
      .catch(() => setNumbers([]));
  }, [showBuilder]);

  // Live estimate whenever audience/template changes in the wizard
  useEffect(() => {
    if (!showBuilder) return;
    const t = setTimeout(() => {
      broadcastsApi
        .estimate(selectedTag || undefined, selectedTemplate || undefined)
        .then(({ data }) => setEstimate(data))
        .catch(() => setEstimate(null));
    }, 250);
    return () => clearTimeout(t);
  }, [showBuilder, selectedTag, selectedTemplate]);

  const handleLaunch = async () => {
    if (!broadcastName.trim()) {
      toast.error('Please enter a campaign name');
      return;
    }
    if (!selectedTemplate) {
      toast.error('Select an approved template first');
      return;
    }

    setLaunching(true);
    try {
      const { data } = await broadcastsApi.create({
        name: broadcastName.trim(),
        templateName: selectedTemplate,
        audienceTag: selectedTag || undefined,
        bodyVariables: variableCount > 0 ? bodyVariables : undefined,
        gupshupAppId: selectedNumber || undefined,
        confirmUnhealthyNumber: pinnedIsRed && confirmUnhealthy ? true : undefined,
      });
      toast.success(
        `Broadcast queued: ${data.estimatedCostPaise !== undefined ? `est. ${fmtRs(data.estimatedCostPaise)}` : ''} for ${data.broadcast?.totalRecipients ?? estimate?.recipientCount ?? 0} contacts`,
      );
      setShowBuilder(false);
      setStep(1);
      setBroadcastName('');
      setSelectedTemplate('');
      loadBroadcasts();
    } catch (err) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Could not launch the broadcast',
      );
    } finally {
      setLaunching(false);
    }
  };

  const handleStop = async (id: string) => {
    if (!window.confirm('Stop this campaign? Messages already sent stay sent; the rest are skipped and never charged.')) {
      return;
    }
    setStoppingId(id);
    try {
      const { data } = await broadcastsApi.cancel(id);
      setBroadcasts((prev) => prev.map((x) => (x.id === id ? { ...x, ...data } : x)));
      toast.success('Campaign stopped');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not stop the campaign'));
    } finally {
      setStoppingId(null);
    }
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setStatsLoading(true);
    try {
      const { data } = await broadcastsApi.stats(id);
      setStats((prev) => ({ ...prev, [id]: data }));
    } catch {
      toast.error('Could not load campaign delivery stats');
    } finally {
      setStatsLoading(false);
    }
  };

  // Aggregated, REAL metrics from the shop's own broadcast history
  const metrics = useMemo(() => {
    const totalSent = broadcasts.reduce((a, b) => a + b.sentCount, 0);
    const totalSpent = broadcasts.reduce((a, b) => a + Number(b.costPaise || 0), 0);
    const active = broadcasts.filter(
      (b) => b.status === 'sending' || b.status === 'queued',
    ).length;
    const delivered = broadcasts.reduce(
      (a, b) => a + (b.status === 'completed' ? b.sentCount : 0),
      0,
    );
    return { totalSent, totalSpent, active, delivered };
  }, [broadcasts]);

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-6 lg:p-8 space-y-6 select-none animate-fade-in">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-black/[0.08]">
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-[#86868b]">
            CAMPAIGN AUTOMATION
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#1d1d1f] mt-0.5">
            Broadcast Campaigns
          </h1>
          <p className="text-xs text-[#86868b] mt-0.5">
            Send an approved template to every opted-in contact — billed per message from your wallet.
          </p>
        </div>

        <button
          onClick={() => setShowBuilder(true)}
          className="bh-btn-primary h-9 px-4 text-xs flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Create Broadcast</span>
        </button>
      </div>

      {/* ─── Metric Cards (real data) ───────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Messages Sent',
            value: metrics.totalSent.toLocaleString('en-IN'),
            meta: 'across all broadcasts',
            color: 'text-emerald-600',
          },
          {
            label: 'Total Broadcast Spend',
            value: fmtRs(metrics.totalSpent),
            meta: 'debited from wallet',
            color: 'text-[#1d1d1f]',
          },
          {
            label: 'In Flight Now',
            value: String(metrics.active),
            meta: 'queued or sending',
            color: 'text-[#0071e3]',
          },
          {
            label: 'Completed Sends',
            value: metrics.delivered.toLocaleString('en-IN'),
            meta: 'finished campaigns',
            color: 'text-[#0071e3]',
          },
        ].map((m, i) => (
          <div
            key={i}
            className="p-4.5 rounded-xl bg-white border border-black/[0.08] flex flex-col justify-between"
          >
            <div className="text-[11px] font-medium text-[#86868b]">{m.label}</div>
            <div className="my-2">
              <div className="text-2xl lg:text-3xl font-bold tracking-tight text-[#1d1d1f] tabular-nums">
                {m.value}
              </div>
            </div>
            <div className={cn('text-[10px] font-semibold', m.color)}>{m.meta}</div>
          </div>
        ))}
      </div>

      {/* ─── Campaigns Table ────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        <div className="p-4 border-b border-black/[0.08] flex items-center justify-between bg-black/[0.03]">
          <div>
            <h2 className="text-sm font-bold text-[#1d1d1f]">Campaigns Overview</h2>
            <p className="text-[11px] text-[#86868b] mt-0.5">
              Live delivery progress — updates in real time as messages go out
            </p>
          </div>
          <button
            onClick={() => {
              setLoading(true);
              loadBroadcasts();
            }}
            className="p-2 rounded-lg text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.03] cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </button>
        </div>

        {broadcasts.length === 0 && !loading ? (
          <div className="p-10 flex flex-col items-center text-center gap-3">
            <Radio className="w-8 h-8 text-[#86868b]" />
            <div className="text-sm font-semibold text-[#1d1d1f]">No broadcasts yet</div>
            <p className="text-xs text-[#86868b] max-w-sm">
              Create your first broadcast to send an approved template to all opted-in
              contacts. You need at least one approved template — manage them on the
              Templates page.
            </p>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => router.push('/templates')}
                className="bh-btn-secondary h-8 px-3.5 text-xs cursor-pointer"
              >
                <MessageSquareText className="w-3.5 h-3.5" />
                <span>Go to Templates</span>
              </button>
              <button
                onClick={() => setShowBuilder(true)}
                className="bh-btn-primary h-8 px-3.5 text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Broadcast</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-black/[0.06] text-[10px] uppercase font-bold tracking-wider text-[#86868b] bg-black/[0.03]">
                <tr>
                  <th className="py-3 px-4 w-8" aria-label="Expand" />
                  <th className="py-3 px-4">Campaign</th>
                  <th className="py-3 px-4">Template</th>
                  <th className="py-3 px-4">Audience</th>
                  <th className="py-3 px-4">Progress</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Cost</th>
                  <th className="py-3 px-4 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {broadcasts.map((b) => {
                  const pct =
                    b.totalRecipients > 0
                      ? Math.round(
                          ((b.sentCount + b.failedCount) / b.totalRecipients) * 100,
                        )
                      : 0;
                  return (
                    <Fragment key={b.id}>
                      <tr
                        onClick={() => toggleExpand(b.id)}
                        className={cn(
                          'transition-colors cursor-pointer',
                          expandedId === b.id ? 'bg-[#0071e3]/[0.04]' : 'hover:bg-black/[0.03]',
                        )}
                      >
                        <td className="py-3.5 pl-4 text-[#86868b]">
                          {expandedId === b.id ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-semibold text-[#1d1d1f]">
                        {b.name}
                        {b.error && (
                          <div className="text-[10px] text-red-600 font-normal mt-0.5 max-w-[220px] truncate" title={b.error}>
                            <AlertCircle className="w-3 h-3 inline mr-1" />
                            {b.error}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px] text-[#0071e3]">
                        {b.templateName}
                      </td>
                      <td className="py-3.5 px-4 text-[#6e6e73]">
                        <Users className="w-3 h-3 inline mr-1 text-[#86868b]" />
                        {b.audienceTag ? `Tag: ${b.audienceTag}` : 'All opted-in'} ·{' '}
                        {b.totalRecipients}
                      </td>
                      <td className="py-3.5 px-4 min-w-[140px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-black/[0.04] overflow-hidden">
                            <div
                              className={cn(
                                'h-full rounded-full transition-all',
                                b.status === 'failed' ? 'bg-red-500' : 'bg-[#0071e3]',
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-[#86868b] tabular-nums w-20">
                            {b.sentCount}/{b.totalRecipients}
                            {b.failedCount > 0 && (
                              <span className="text-red-600"> · {b.failedCount}✗</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              'badge text-[10px]',
                              STATUS_BADGE[b.status] || 'bg-black/[0.04] text-[#86868b]',
                            )}
                          >
                            {(b.status === 'sending' || b.status === 'queued') && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#0071e3] animate-pulse" />
                            )}
                            {b.status.toUpperCase()}
                          </span>
                          {(b.status === 'sending' || b.status === 'queued') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleStop(b.id);
                              }}
                              disabled={stoppingId === b.id}
                              className="text-[10px] font-semibold text-red-600 hover:text-red-700 hover:bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/25 cursor-pointer disabled:opacity-50"
                              title="Stop dispatching the remaining recipients"
                            >
                              {stoppingId === b.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                'Stop'
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#6e6e73] tabular-nums">
                        {fmtRs(b.costPaise)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-[#86868b] tabular-nums">
                        {fmtDate(b.createdAt)}
                      </td>
                    </tr>
                      {expandedId === b.id && (
                        <tr className="bg-black/[0.02]">
                          <td colSpan={8} className="px-4 pb-4">
                            <div className="p-3.5 rounded-xl bg-white border border-black/[0.08]">
                              <div className="text-[10px] uppercase font-bold tracking-wider text-[#86868b] mb-2.5">
                                Live delivery summary — fed by WhatsApp status receipts
                              </div>
                              {statsLoading && !stats[b.id] ? (
                                <div className="flex items-center gap-2 text-[11px] text-[#86868b]">
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
                                </div>
                              ) : !stats[b.id] ? (
                                <div className="text-[11px] text-[#86868b]">
                                  Stats not available for this campaign yet.
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {(
                                    [
                                      { k: 'queued', label: 'Queued', cls: 'text-amber-600 bg-amber-500/[0.07] border-amber-500/20' },
                                      { k: 'sent', label: 'Sent', cls: 'text-[#0071e3] bg-[#0071e3]/[0.06] border-[#0071e3]/20' },
                                      { k: 'delivered', label: 'Delivered', cls: 'text-emerald-600 bg-emerald-500/[0.07] border-emerald-500/20' },
                                      { k: 'read', label: 'Read', cls: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/30' },
                                      { k: 'failed', label: 'Failed', cls: 'text-red-600 bg-red-500/[0.07] border-red-500/20' },
                                    ] as const
                                  ).map(({ k, label, cls }) => (
                                    <span
                                      key={k}
                                      className={cn(
                                        'px-2.5 py-1 rounded-lg border text-[11px] font-semibold tabular-nums',
                                        cls,
                                      )}
                                    >
                                      {label}: {stats[b.id].counts[k]}
                                    </span>
                                  ))}
                                  {stats[b.id].readRate != null && (
                                    <span className="px-2.5 py-1 rounded-lg bg-black/[0.04] text-[11px] font-semibold text-[#1d1d1f] tabular-nums">
                                      Read rate: {stats[b.id].readRate}%
                                    </span>
                                  )}
                                  <span className="px-2.5 py-1 rounded-lg bg-black/[0.04] text-[11px] font-semibold text-[#6e6e73] tabular-nums">
                                    Progress: {stats[b.id].progressPct}% of{' '}
                                    {stats[b.id].totalRecipients}
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Create Broadcast Wizard ────────────────────────────── */}
      {showBuilder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-white border border-white/[0.1] shadow-[0_8px_24px_rgba(0,0,0,0.1)] space-y-5">
            <div className="flex items-center justify-between border-b border-black/[0.08] pb-3.5">
              <div>
                <h3 className="text-base font-bold text-[#1d1d1f]">Create WhatsApp Broadcast</h3>
                <p className="text-xs text-[#86868b] mt-0.5">
                  Step {step} of 3: {step === 1 ? 'Audience & Campaign Name' : step === 2 ? 'Select Template' : 'Review & Launch'}
                </p>
              </div>
              <button
                onClick={() => setShowBuilder(false)}
                className="p-1.5 rounded-lg text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.03] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1 — name + audience */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-[#6e6e73] block mb-1">
                    Broadcast Campaign Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Navratri Special Flash Drop"
                    value={broadcastName}
                    onChange={(e) => setBroadcastName(e.target.value)}
                    className="bh-input w-full"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[#6e6e73] block mb-1.5">
                    Target Audience (opted-in contacts only)
                  </label>
                  <div className="space-y-2">
                    <label
                      className={cn(
                        'p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all',
                        selectedTag === ''
                          ? 'bg-[#0071e3]/10 border-[#0071e3]/40 text-[#1d1d1f]'
                          : 'bg-black/[0.03] border-black/[0.06] text-[#6e6e73]',
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="radio"
                          name="segment"
                          checked={selectedTag === ''}
                          onChange={() => setSelectedTag('')}
                          className="accent-[#0071e3]"
                        />
                        <div>
                          <div className="text-xs font-bold text-[#1d1d1f]">All Opted-in Contacts</div>
                          <div className="text-[10px] text-[#86868b]">
                            Every contact who has opted in to messages
                          </div>
                        </div>
                      </div>
                      {estimate && selectedTag === '' && (
                        <span className="badge badge-green text-[10px]">{estimate.recipientCount}</span>
                      )}
                    </label>

                    {allTags.map((tag) => (
                      <label
                        key={tag}
                        className={cn(
                          'p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all',
                          selectedTag === tag
                            ? 'bg-[#0071e3]/10 border-[#0071e3]/40 text-[#1d1d1f]'
                            : 'bg-black/[0.03] border-black/[0.06] text-[#6e6e73]',
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="segment"
                            checked={selectedTag === tag}
                            onChange={() => setSelectedTag(tag)}
                            className="accent-[#0071e3]"
                          />
                          <div>
                            <div className="text-xs font-bold text-[#1d1d1f]">Tag: {tag}</div>
                            <div className="text-[10px] text-[#86868b]">Contacts tagged “{tag}”</div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-[#86868b] mt-2">
                    Meta policy: broadcasts go only to opted-in contacts. Manage opt-ins on the Contacts page.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      if (!broadcastName.trim()) {
                        toast.error('Please enter a campaign name');
                        return;
                      }
                      if (estimate && estimate.recipientCount === 0) {
                        toast.error('No opted-in contacts in this audience');
                        return;
                      }
                      setStep(2);
                    }}
                    className="bh-btn-primary h-9 px-4 text-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Next: Select Template</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 — template picker (real approved templates) */}
            {step === 2 && (
              <div className="space-y-3.5">
                <div className="text-xs font-medium text-[#6e6e73]">
                  Select an approved WhatsApp message template
                </div>

                {approvedTemplates.length === 0 ? (
                  <div className="p-6 rounded-xl border border-black/[0.08] bg-black/[0.03] text-center space-y-2">
                    <AlertCircle className="w-6 h-6 text-[#86868b] mx-auto" />
                    <div className="text-xs font-semibold text-[#1d1d1f]">No approved templates</div>
                    <p className="text-[11px] text-[#86868b]">
                      Submit templates on the Templates page and wait for Meta approval before broadcasting.
                    </p>
                    <button
                      onClick={() => router.push('/templates')}
                      className="bh-btn-secondary h-8 px-3 text-[11px] cursor-pointer mt-1"
                    >
                      Go to Templates
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {approvedTemplates.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => {
                          setSelectedTemplate(t.elementName);
                          setBodyVariables([]);
                        }}
                        className={cn(
                          'p-3 rounded-xl border cursor-pointer transition-all',
                          selectedTemplate === t.elementName
                            ? 'bg-[#0071e3]/10 border-[#0071e3]/50 shadow-[0_2px_10px_rgba(0,113,227,0.2)]'
                            : 'bg-black/[0.03] border-black/[0.08] hover:border-black/[0.1]',
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-[#1d1d1f] flex items-center gap-1.5">
                            {t.templateType === 'CAROUSEL' && (
                              <span className="badge badge-cyan text-[9px]">
                                {t.cards?.length ?? 0}-card collage
                              </span>
                            )}
                            {t.elementName}
                          </span>
                          <span className="badge badge-green text-[9px]">{t.category}</span>
                        </div>
                        <p className="text-xs text-[#6e6e73] mt-1.5 line-clamp-2">{t.body}</p>
                      </div>
                    ))}
                  </div>
                )}

                {variableCount > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-[#6e6e73]">
                      Template variables ({variableCount}) — applied to every message
                    </div>
                    {Array.from({ length: variableCount }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[11px] text-[#86868b] w-10 shrink-0 font-mono">
                          {'{{'}{i + 1}{'}}'}
                        </span>
                        <input
                          type="text"
                          value={bodyVariables[i] || ''}
                          onChange={(e) => {
                            const next = [...bodyVariables];
                            next[i] = e.target.value;
                            setBodyVariables(next);
                          }}
                          placeholder={`Value for variable ${i + 1}`}
                          className="bh-input h-8 text-xs flex-1"
                        />
                      </div>
                    ))}
                    {/* Live WhatsApp bubble preview — filled values highlighted, pending placeholders dimmed */}
                    <div className="pt-1">
                      <div className="text-[10px] uppercase font-bold tracking-wider text-[#86868b] mb-1.5">
                        Customer preview
                      </div>
                      <div className="max-w-[85%] ml-auto px-3.5 py-2.5 rounded-xl bg-[#d9fdd3] border border-black/[0.06] text-[12px] leading-relaxed text-[#111b21] whitespace-pre-wrap break-words shadow-[0_1px_1px_rgba(0,0,0,0.06)]">
                        {splitTemplatePreview(
                          selectedTemplateRow?.body || '',
                          bodyVariables,
                        ).map((run, i) =>
                          run.filled ? (
                            <span
                              key={i}
                              className="font-semibold bg-[#0071e3]/10 text-[#0071e3] rounded px-0.5"
                            >
                              {run.text}
                            </span>
                          ) : run.pending ? (
                            <span key={i} className="text-[#111b21]/35 font-mono text-[11px]">
                              {run.text}
                            </span>
                          ) : (
                            <span key={i}>{run.text}</span>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => setStep(1)}
                    className="bh-btn-secondary h-9 px-3.5 text-xs cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      if (!selectedTemplate) {
                        toast.error('Select a template to continue');
                        return;
                      }
                      if (
                        variableCount > 0 &&
                        bodyVariables.filter((v) => v.trim()).length !== variableCount
                      ) {
                        toast.error(`Fill all ${variableCount} template variables`);
                        return;
                      }
                      setStep(3);
                    }}
                    className="bh-btn-primary h-9 px-4 text-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Next: Review</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3 — review with real numbers */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-black/[0.03] border border-black/[0.06] space-y-2 text-xs">
                  <div className="flex justify-between text-[#86868b]">
                    <span>Campaign Name:</span>
                    <span className="font-semibold text-[#1d1d1f]">{broadcastName}</span>
                  </div>
                  <div className="flex justify-between text-[#86868b]">
                    <span>Template:</span>
                    <span className="font-mono text-[#0071e3]">{selectedTemplate}</span>
                  </div>
                  <div className="flex justify-between text-[#86868b]">
                    <span>Target Audience:</span>
                    <span className="font-semibold text-[#1d1d1f]">
                      {selectedTag ? `Tag: ${selectedTag}` : 'All opted-in contacts'}
                      {estimate ? ` · ${estimate.recipientCount} recipients` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#86868b] pt-1.5 border-t border-black/[0.06]">
                    <span>Estimated Wallet Cost:</span>
                    <span className="font-bold text-emerald-600 tabular-nums">
                      {estimate ? fmtRs(estimate.estimatedCostPaise) : '…'}
                    </span>
                  </div>
                  {estimate && (
                    <div className="text-[10px] text-[#86868b] text-right">
                      {fmtRs(estimate.unitCostPaise)} per message
                    </div>
                  )}
                </div>

                {/* Sending number (spec §2.4) — health lights per number */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-[#6e6e73]">Sending number</div>
                  {liveNumbers.length === 0 ? (
                    <div className="p-3 rounded-xl border border-black/[0.08] bg-black/[0.03] text-[11px] text-[#86868b]">
                      No live WhatsApp number connected — connect one from Onboarding first.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <label
                        className={cn(
                          'p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all',
                          selectedNumber === ''
                            ? 'bg-[#0071e3]/10 border-[#0071e3]/40'
                            : 'bg-black/[0.03] border-black/[0.06]',
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="radio"
                            name="number"
                            checked={selectedNumber === ''}
                            onChange={() => { setSelectedNumber(''); setConfirmUnhealthy(false); }}
                            className="accent-[#0071e3]"
                          />
                          <div>
                            <div className="text-xs font-bold text-[#1d1d1f]">Auto (recommended)</div>
                            <div className="text-[10px] text-[#86868b]">
                              Router picks your healthiest number and fails over if one degrades mid-campaign
                            </div>
                          </div>
                        </div>
                      </label>
                      {liveNumbers.map((n) => {
                        const light = HEALTH_LIGHT[n.health.light];
                        return (
                          <label
                            key={n.gupshupAppId}
                            className={cn(
                              'p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all',
                              selectedNumber === n.gupshupAppId
                                ? 'bg-[#0071e3]/10 border-[#0071e3]/40'
                                : 'bg-black/[0.03] border-black/[0.06]',
                            )}
                          >
                            <div className="flex items-center gap-2.5">
                              <input
                                type="radio"
                                name="number"
                                checked={selectedNumber === n.gupshupAppId}
                                onChange={() => { setSelectedNumber(n.gupshupAppId); setConfirmUnhealthy(false); }}
                                className="accent-[#0071e3]"
                              />
                              <div>
                                <div className="text-xs font-bold text-[#1d1d1f] flex items-center gap-1.5">
                                  <span className={cn('w-2 h-2 rounded-full', light.dot)} />
                                  +{n.phoneNumber || 'pending number'}
                                </div>
                                <div className="text-[10px] text-[#86868b]">
                                  {light.label}
                                  {n.health.light !== 'green' && n.health.reasons.length > 0
                                    ? ` — ${n.health.reasons[0]}`
                                    : n.health.messagingTier
                                      ? ` · ${n.health.sentLast24h}/${n.health.dailyCeiling} sent today`
                                      : ''}
                                </div>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                      {pinnedIsRed && (
                        <label className="p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={confirmUnhealthy}
                            onChange={(e) => setConfirmUnhealthy(e.target.checked)}
                            className="accent-red-600 mt-0.5"
                          />
                          <span className="text-[11px] text-red-700 leading-snug">
                            This number is at risk of Meta restricting it. I understand the risk and
                            want to send from it anyway.
                          </span>
                        </label>
                      )}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-[#0071e3]/[0.05] border border-[#0071e3]/20 text-[11px] text-[#6e6e73] flex gap-2">
                  <Send className="w-3.5 h-3.5 text-[#0071e3] shrink-0 mt-0.5" />
                  <span>
                    Messages dispatch immediately after launch. Each send is debited atomically from your wallet; the broadcast stops early if the balance runs out.
                  </span>
                </div>

                <div className="flex justify-between pt-2">
                  <button
                    onClick={() => setStep(2)}
                    className="bh-btn-secondary h-9 px-3.5 text-xs cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleLaunch}
                    disabled={launching || liveNumbers.length === 0 || (pinnedIsRed && !confirmUnhealthy)}
                    className="bh-btn-primary h-9 px-5 text-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                  >
                    {launching ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>{launching ? 'Launching…' : 'Launch Broadcast'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
