'use client';

import { useState, useEffect, useCallback } from 'react';
import { walletApi } from '@/lib/api';
import { useAuthStore } from '@/hooks/useAuth';
import { formatPaise, cn, getErrorMessage } from '@/lib/utils';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  RotateCcw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Plus,
  ShieldCheck,
  CheckCircle2,
  X,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

interface Transaction {
  id: string;
  type: 'topup' | 'debit' | 'refund';
  amountPaise: number;
  balanceAfterPaise: number;
  referenceId: string;
  description: string;
  createdAt: string;
}

const presets = [
  { amount: 500, label: '₹500', popular: false },
  { amount: 1000, label: '₹1,000', popular: true },
  { amount: 2500, label: '₹2,500', popular: false },
  { amount: 5000, label: '₹5,000', popular: false },
];

// Webhooks live at the API root (outside the /api prefix)
const API_ROOT = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(
  /\/api\/?$/,
  '',
);

/** Loads the Razorpay Checkout SDK once, resolves when window.Razorpay exists. */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    const w = window as unknown as Record<string, unknown>;
    if (typeof w.Razorpay === 'function') return resolve(true);

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function WalletPage() {
  const { shop } = useAuthStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [showTopupModal, setShowTopupModal] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(1000);
  const [customAmount, setCustomAmount] = useState('');
  const [isProcessingTopup, setIsProcessingTopup] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'topup' | 'debit' | 'refund'>('all');

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const { data } = await walletApi.getBalance();
      setBalance(data.balancePaise);
    } catch {
      setBalance(shop?.walletBalancePaise || 0);
    } finally {
      setBalanceLoading(false);
    }
  }, [shop]);

  const loadTransactions = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const { data } = await walletApi.getTransactions(p, 15);
      setTransactions(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setPage(p);
    } catch {
      setTransactions([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBalance();
    loadTransactions(1);
  }, [loadBalance, loadTransactions]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await walletApi.exportCsv(90);
      toast.success('Ledger exported (last 90 days)');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const handleTopup = async () => {
    const { user } = useAuthStore.getState();
    const finalAmount = customAmount ? parseFloat(customAmount) : selectedAmount;
    if (!finalAmount || finalAmount < 100) {
      toast.error('Minimum top-up amount is ₹100');
      return;
    }

    const amountPaise = Math.round(finalAmount * 100);
    setIsProcessingTopup(true);

    try {
      const { data: order } = await walletApi.recharge(amountPaise);

      if (order.mock) {
        // Mock mode: settle through the REAL webhook handler so the exact
        // production crediting path (payment.captured → idempotent credit)
        // is exercised — just without signature verification.
        await axios.post(
          `${API_ROOT}/webhooks/razorpay`,
          {
            event: 'payment.captured',
            payload: {
              payment: {
                entity: {
                  id: `pay_mock_${Date.now()}`,
                  amount: order.amountPaise,
                  currency: 'INR',
                  status: 'captured',
                  notes: { shopId: user?.shopId },
                },
              },
            },
          },
          { headers: { 'Content-Type': 'application/json' } },
        );
        toast.success(`Wallet credited ₹${finalAmount.toLocaleString('en-IN')}`);
        await loadBalance();
        await loadTransactions(1);
        setShowTopupModal(false);
        setCustomAmount('');
        return;
      }

      // Live mode: open Razorpay Checkout with the real order
      const sdkLoaded = await loadRazorpayScript();
      const w = window as unknown as Record<string, unknown>;
      if (!sdkLoaded || typeof w.Razorpay !== 'function') {
        toast.error('Could not load Razorpay Checkout. Check your connection and retry.');
        return;
      }

      const RazorpayCtor = w.Razorpay as new (opts: unknown) => {
        open: () => void;
        on: (event: string, cb: (resp: unknown) => void) => void;
      };

      const rzp = new RazorpayCtor({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency || 'INR',
        name: 'BizzHouse WhatsApp',
        description: `Wallet recharge ₹${finalAmount.toLocaleString('en-IN')}`,
        order_id: order.orderId,
        prefill: { name: user?.name || '', email: user?.email || '' },
        theme: { color: '#0071e3' },
        modal: { ondismiss: () => setIsProcessingTopup(false) },
      });

      // The webhook is the source of truth for crediting; on success we
      // poll the balance briefly to reflect the webhook-driven credit.
      rzp.on('payment.success', async () => {
        toast.success('Payment captured — updating balance…');
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          const before = balance;
          await loadBalance();
          if (before !== balance) break;
        }
        await loadTransactions(1);
        setShowTopupModal(false);
        setIsProcessingTopup(false);
      });
      rzp.on('payment.failed', () => {
        toast.error('Payment failed. No amount was debited.');
        setIsProcessingTopup(false);
      });
      rzp.open();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Top-up request failed. Please try again.'));
      setIsProcessingTopup(false);
    }
  };

  const filteredTransactions = transactions.filter((t) => {
    if (filterType === 'all') return true;
    return t.type === filterType;
  });

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-6 lg:p-8 space-y-6 select-none animate-fade-in">
      {/* â”€â”€â”€ Compact Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-black/[0.08]">
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-[#86868b]">
            PREPAID MESSAGING WALLET
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#1d1d1f] mt-0.5">
            Balance & Billing Ledger
          </h1>
          <p className="text-xs text-[#86868b] mt-0.5">
            Usage-based atomic deductions for WhatsApp Business Cloud API messages.
          </p>
        </div>

        <button
          onClick={() => setShowTopupModal(true)}
          className="bh-btn-primary h-9 px-4 text-xs flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Funds</span>
        </button>
      </div>

      {/* â”€â”€â”€ Top Cards Grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Futuristic Fintech Card */}
        <div className="lg:col-span-8 p-6 rounded-2xl bg-gradient-to-br from-[#131A2B] via-[#0E1322] to-[#0A0D18] border border-white/[0.1] shadow-[0_12px_36px_rgba(0,0,0,0.4)] relative overflow-hidden flex flex-col justify-between min-h-[190px] transition-colors duration-300 hover:border-black/[0.1]">
          {/* Ambient Glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#0071e3]/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-[#0071e3]/[0.06] rounded-full blur-2xl pointer-events-none" />
          {/* Card sheen */}
          <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(115deg,transparent_30%,rgba(255,255,255,0.025)_45%,transparent_60%)]" />

          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-[#0071e3]/10 border border-[#0071e3]/35 flex items-center justify-center text-[#0071e3]">
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <span className="text-[11px] font-bold tracking-wider uppercase text-[#86868b]">
                  AVAILABLE CREDITS
                </span>
              </div>
              <span className="badge badge-green text-[10px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active Escrow
              </span>
            </div>

            <div className="mt-3">
              {balanceLoading ? (
                <div className="h-10 w-56 bh-skeleton" />
              ) : (
                <div className="text-[36px] md:text-[40px] font-bold tracking-tight text-[#1d1d1f] tabular-nums leading-none [font-family:var(--font-display)]">
                  {formatPaise(balance)}
                </div>
              )}
            </div>
          </div>

          <div className="mt-5 pt-3.5 border-t border-black/[0.08] flex flex-wrap items-center justify-between gap-3 text-[11px] relative z-10">
            <div className="flex items-center gap-1.5 text-[#86868b]">
              <ShieldCheck className="w-4 h-4 text-[#0071e3]" />
              <span>Auto-refunds enabled for undelivered messages</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setSelectedAmount(500);
                  setShowTopupModal(true);
                }}
                className="px-2.5 py-1 rounded-md bg-black/[0.04] hover:bg-white/[0.1] text-xs font-semibold text-[#1d1d1f] border border-black/[0.08] transition-all cursor-pointer"
              >
                +â‚¹500
              </button>
              <button
                onClick={() => {
                  setSelectedAmount(1000);
                  setShowTopupModal(true);
                }}
                className="px-2.5 py-1 rounded-md bg-[#0071e3]/10 hover:bg-[#0071e3]/22 text-xs font-semibold text-[#0077ed] border border-[#0071e3]/35 transition-all cursor-pointer"
              >
                +â‚¹1,000
              </button>
            </div>
          </div>
        </div>

        {/* Right: Transparent Rates Breakdown */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-white border border-black/[0.08] flex flex-col justify-between space-y-3">
          <div>
            <div className="text-[10px] font-bold tracking-wider uppercase text-[#86868b] mb-2.5">
              OFFICIAL WABA PRICING
            </div>
            <div className="divide-y divide-black/[0.06]">
              <div className="flex items-center justify-between py-2 text-xs">
                <span className="text-[#6e6e73]">Marketing Broadcast</span>
                <span className="font-bold text-[#1d1d1f] tabular-nums">â‚¹1.50 / send</span>
              </div>
              <div className="flex items-center justify-between py-2 text-xs">
                <span className="text-[#6e6e73]">Utility / Order Alert</span>
                <span className="font-bold text-[#1d1d1f] tabular-nums">â‚¹0.30 / send</span>
              </div>
              <div className="flex items-center justify-between py-2 text-xs">
                <span className="text-[#6e6e73]">Customer Inbound Window (24h)</span>
                <span className="font-bold text-emerald-600">FREE</span>
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-black/[0.03] border border-black/[0.06] text-[10px] text-[#86868b] leading-normal">
            No fixed monthly charges. Funds never expire. Deductions occur only upon successful delivery.
          </div>
        </div>
      </div>

      {/* â”€â”€â”€ Ledger History Table â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
        {/* Table Filter Bar */}
        <div className="p-4 border-b border-black/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-black/[0.03]">
          <div>
            <h2 className="text-sm font-bold text-[#1d1d1f]">Transaction History</h2>
            <p className="text-[11px] text-[#86868b] mt-0.5">
              Immutable append-only balance deductions & top-up records
            </p>
          </div>

          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-lg border border-black/[0.06]">
            {(['all', 'topup', 'debit', 'refund'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setFilterType(tab)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize transition-all cursor-pointer',
                  filterType === tab
                    ? 'bg-white/[0.1] text-[#1d1d1f]'
                    : 'text-[#86868b] hover:text-[#1d1d1f]'
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          <button
            onClick={handleExport}
            disabled={exporting}
            className="bh-btn-secondary h-7 px-2.5 text-[11px] flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
            title="Download last 90 days as CSV for accounting"
          >
            {exporting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Download className="w-3 h-3" />
            )}
            <span>Export CSV</span>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 text-[#0071e3] animate-spin" />
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Wallet className="w-7 h-7 text-[#86868b] mb-2" />
            <p className="text-xs font-semibold text-[#6e6e73]">No transactions recorded</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-black/[0.06] text-[10px] uppercase font-bold tracking-wider text-[#86868b] bg-black/[0.03]">
                <tr>
                  <th className="py-3 px-4">Transaction / Reference</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Balance After</th>
                  <th className="py-3 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-black/[0.03] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#1d1d1f]">{tx.description}</div>
                      <div className="text-[10px] font-mono text-[#86868b] mt-0.5">{tx.referenceId}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={cn(
                          'badge text-[10px] font-mono uppercase',
                          tx.type === 'topup' && 'badge-green',
                          tx.type === 'debit' && 'badge-red',
                          tx.type === 'refund' && 'badge-cyan'
                        )}
                      >
                        {tx.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold tabular-nums">
                      <span
                        className={
                          tx.type === 'topup' || tx.type === 'refund'
                            ? 'text-emerald-600'
                            : 'text-rose-400'
                        }
                      >
                        {tx.type === 'topup' || tx.type === 'refund' ? '+' : '-'}
                        {formatPaise(tx.amountPaise)}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#6e6e73] tabular-nums">
                      {formatPaise(tx.balanceAfterPaise)}
                    </td>
                    <td className="py-3 px-4 text-right text-[#86868b] tabular-nums">
                      {new Date(tx.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* â”€â”€â”€ Instant Recharge Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {showTopupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-[#f5f5f7] border border-black/[0.1] shadow-[0_24px_64px_rgba(0,0,0,0.14)] space-y-5 relative animate-scale-in overflow-hidden">
            <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-[#0071e3]/10 blur-3xl pointer-events-none" />

            <div className="flex items-center justify-between relative">
              <div>
                <h3 className="text-base font-bold text-[#1d1d1f]">Recharge Messaging Credits</h3>
                <p className="text-xs text-[#86868b] mt-0.5">
                  Instant automated credit via official payment gateway
                </p>
              </div>
              <button
                onClick={() => setShowTopupModal(false)}
                className="p-1.5 rounded-lg text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.03] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Presets */}
            <div className="grid grid-cols-2 gap-2.5 relative">
              {presets.map((p) => (
                <button
                  key={p.amount}
                  onClick={() => {
                    setSelectedAmount(p.amount);
                    setCustomAmount('');
                  }}
                  className={cn(
                    'p-3 rounded-xl text-left border transition-all duration-200 cursor-pointer relative active:scale-[0.98]',
                    selectedAmount === p.amount && !customAmount
                      ? 'bg-[#0071e3]/10 border-[#0071e3]/50 shadow-[0_2px_10px_rgba(0,113,227,0.2)]'
                      : 'bg-black/[0.03] border-black/[0.08] hover:border-black/[0.1] hover:bg-black/[0.03]'
                  )}
                >
                  <div className="text-sm font-bold text-[#1d1d1f]">{p.label}</div>
                  {p.popular && (
                    <span className="absolute top-2 right-2 text-[9px] font-bold uppercase bg-[#0071e3]/20 text-[#0077ed] px-1.5 py-0.5 rounded">
                      Popular
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Custom Amount */}
            <div>
              <label className="text-[11px] font-medium text-[#6e6e73] block mb-1">
                Or enter custom amount (â‚¹)
              </label>
              <input
                type="number"
                min="100"
                placeholder="e.g. 3000"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="bh-input w-full"
              />
            </div>

            {/* Payment Method info — Razorpay Checkout presents the
                actual UPI / card / netbanking choices in its own modal */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-black/[0.03] border border-black/[0.06]">
              <div className="flex items-center gap-2 text-[11px] text-[#86868b]">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>UPI · Cards · NetBanking</span>
              </div>
              <span className="text-[10px] font-semibold text-[#86868b]">
                Secured by Razorpay
              </span>
            </div>

            {/* Action */}
            <button
              onClick={handleTopup}
              disabled={isProcessingTopup}
              className="bh-btn-primary w-full h-10 text-sm cursor-pointer relative"
            >
              {isProcessingTopup ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing secure payment...</span>
                </>
              ) : (
                <span>
                  Proceed to Pay â‚¹
                  {(customAmount ? parseFloat(customAmount) : selectedAmount).toLocaleString('en-IN')}
                </span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
