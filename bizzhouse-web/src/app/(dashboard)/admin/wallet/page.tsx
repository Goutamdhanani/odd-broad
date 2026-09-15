'use client';

import { useState, useEffect, useCallback } from 'react';
import { shopsApi, walletApi } from '@/lib/api';
import { formatPaise, cn, getErrorMessage } from '@/lib/utils';
import {
  Wallet,
  Loader2,
  IndianRupee,
  Plus,
  Minus,
  X,
  CreditCard,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ShopSummary } from '@/lib/types';

type AdjustmentType = 'credit' | 'debit';

export default function AdminWalletPage() {
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('credit');
  const [selectedShop, setSelectedShop] = useState<ShopSummary | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadShops = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await shopsApi.listAll(1, 100);
      setShops(data.data || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShops();
  }, [loadShops]);

  const openModal = (shop: ShopSummary, type: AdjustmentType) => {
    setSelectedShop(shop);
    setAdjustmentType(type);
    setAmount('');
    setDescription('');
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!selectedShop || !amount) return;
    const amountRupees = parseFloat(amount);
    if (isNaN(amountRupees) || amountRupees <= 0) {
      toast.error('Enter a valid amount in rupees');
      return;
    }

    setSubmitting(true);
    try {
      const amountPaise = Math.round(amountRupees * 100);
      if (adjustmentType === 'credit') {
        await walletApi.credit(selectedShop.id, amountPaise, description || undefined);
        toast.success(`₹${amountRupees.toFixed(2)} credited to ${selectedShop.businessName}`);
      } else {
        await walletApi.debit(selectedShop.id, amountPaise, description || undefined);
        toast.success(`₹${amountRupees.toFixed(2)} debited from ${selectedShop.businessName}`);
      }
      setShowModal(false);
      loadShops();
    } catch (err) {
      toast.error(getErrorMessage(err, `Failed to ${adjustmentType} wallet`));
    } finally {
      setSubmitting(false);
    }
  };

  const isCredit = adjustmentType === 'credit';

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10 space-y-8 select-none animate-fade-in">
      {/* ─── 140–156 px Page Header ────────────────────────────── */}
      <div className="min-h-[144px] flex flex-col justify-center border-b border-[var(--bh-hairline)] pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="type-overline text-[var(--bh-text-muted)]">
              WALLET AUDIT & MANUAL ADJUSTMENTS
            </div>
            <h1 className="type-page-title text-[#1d1d1f]">Platform Wallet Admin</h1>
            <p className="type-body text-[var(--bh-text-secondary)] max-w-2xl">
              Audit merchant messaging balances, inspect ledger debit records, and issue manual wallet credits or debits.
            </p>
          </div>
          <span className="badge badge-cyan text-xs py-1.5 px-3">
            Prepaid Escrow System
          </span>
        </div>
      </div>

      {/* ─── Bounded Table Plane (60px Rows) ────────────────────── */}
      <div className="bh-card-solid overflow-hidden border border-[var(--bh-hairline)] shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 text-[12px] font-semibold text-[var(--bh-text-muted)] uppercase tracking-wider border-b border-[var(--bh-hairline)] bg-[#f5f5f7]">
          <div className="col-span-4">Shop / Merchant</div>
          <div className="col-span-2">Account Status</div>
          <div className="col-span-3">Available Balance</div>
          <div className="col-span-3 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-7 h-7 text-[#0071e3] animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-[var(--bh-hairline)]">
            {shops.map((shop) => (
              <div
                key={shop.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 px-6 py-4 items-center bh-table-row"
              >
                <div className="md:col-span-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-[12px] bg-gradient-to-br from-[#1C2C3E] to-[#0F1824] border border-black/[0.08] flex items-center justify-center text-xs font-bold text-[#0077ed] shrink-0">
                    {shop.businessName?.charAt(0)?.toUpperCase() || 'S'}
                  </div>
                  <div className="min-w-0">
                    <div className="type-ui font-semibold text-[#1d1d1f] truncate">
                      {shop.businessName}
                    </div>
                    <div className="type-label text-[11px] font-mono text-[var(--bh-text-muted)] truncate">
                      {shop.id}
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <span
                    className={cn(
                      'badge',
                      shop.status === 'active'
                        ? 'badge-green'
                        : shop.status === 'suspended'
                        ? 'badge-red'
                        : 'badge-yellow'
                    )}
                  >
                    {shop.status}
                  </span>
                </div>

                <div className="md:col-span-3">
                  <span className="type-metric-secondary text-[#0077ed] tabular-nums font-mono font-bold">
                    {formatPaise(shop.walletBalancePaise || 0)}
                  </span>
                </div>

                <div className="md:col-span-3 flex justify-start md:justify-end gap-2">
                  <button
                    onClick={() => openModal(shop, 'credit')}
                    className="bh-btn-primary h-9 px-3.5 text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Credit</span>
                  </button>
                  <button
                    onClick={() => openModal(shop, 'debit')}
                    className="h-9 px-3.5 text-xs flex items-center gap-1.5 cursor-pointer rounded-[10px] font-semibold border transition-all duration-200 bg-rose-500/10 text-rose-400 border-rose-500/30 hover:bg-rose-500/20 hover:border-rose-500/50 active:scale-[0.97]"
                  >
                    <Minus className="w-3.5 h-3.5" />
                    <span>Debit</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Credit / Debit Modal ────────────────────────────────── */}
      {showModal && selectedShop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bh-card-solid w-full max-w-md p-8 relative overflow-hidden border border-black/[0.08] shadow-[0_24px_64px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--bh-hairline)] mb-6">
              <div>
                <div className={cn(
                  'type-overline mb-1',
                  isCredit ? 'text-[#0077ed]' : 'text-rose-400'
                )}>
                  MANUAL LEDGER ADJUSTMENT
                </div>
                <h3 className="type-section-title text-[#1d1d1f]">
                  {isCredit ? 'Credit' : 'Debit'} Shop Wallet
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[var(--bh-text-muted)] hover:text-[#1d1d1f] transition-colors cursor-pointer border-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Type toggle */}
            <div className="flex bg-black/40 p-1 rounded-lg border border-black/[0.06] mb-5">
              <button
                type="button"
                onClick={() => setAdjustmentType('credit')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5',
                  isCredit
                    ? 'bg-[#0071e3]/10 text-[#0077ed] shadow-sm'
                    : 'text-[#86868b] hover:text-[#1d1d1f]'
                )}
              >
                <Plus className="w-3.5 h-3.5" /> Credit
              </button>
              <button
                type="button"
                onClick={() => setAdjustmentType('debit')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5',
                  !isCredit
                    ? 'bg-rose-500/15 text-rose-400 shadow-sm'
                    : 'text-[#86868b] hover:text-[#1d1d1f]'
                )}
              >
                <Minus className="w-3.5 h-3.5" /> Debit
              </button>
            </div>

            <div className={cn(
              'p-4.5 rounded-[16px] border mb-5 space-y-1',
              isCredit
                ? 'bg-[#f5f5f7] border-[var(--bh-hairline)]'
                : 'bg-rose-950/20 border-rose-500/15'
            )}>
              <div className="type-label">
                {isCredit ? 'Crediting' : 'Debiting'} Merchant:
              </div>
              <div className="type-ui font-bold text-[#1d1d1f]">
                {selectedShop.businessName}
              </div>
              <div className="type-label pt-1 text-[var(--bh-text-secondary)]">
                Current balance:{' '}
                <span className="text-[#0077ed] font-semibold tabular-nums font-mono">
                  {formatPaise(selectedShop.walletBalancePaise || 0)}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="type-ui text-[var(--bh-text-secondary)] block mb-1.5 font-medium">
                  Amount in Rupees (₹)
                </label>
                <div className="relative">
                  <IndianRupee className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--bh-text-muted)]" />
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="1000.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bh-input w-full pl-10 tabular-nums font-mono text-sm"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="type-ui text-[var(--bh-text-secondary)] block mb-1.5 font-medium">
                  Audit Reason / Description {!isCredit && <span className="text-rose-400">*</span>}
                </label>
                <input
                  type="text"
                  placeholder={isCredit ? 'e.g. Bank IMPS Ref #912838' : 'e.g. Abuse refund reversal — Ticket #4829'}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="bh-input w-full text-sm"
                  required={!isCredit}
                />
              </div>

              {!isCredit && (
                <div className="p-3 rounded-xl bg-rose-500/8 border border-rose-500/15 text-[11px] text-rose-300/80 leading-relaxed">
                  ⚠️ Debits are irreversible. The shop&apos;s wallet balance will be reduced immediately. Ensure the reason is documented for audit compliance.
                </div>
              )}

              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="bh-btn-secondary flex-1 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !amount || (!isCredit && !description.trim())}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 cursor-pointer rounded-[10px] h-11 font-semibold text-sm transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]',
                    isCredit
                      ? 'bg-gradient-to-r from-[#2563EB] to-[#0071e3] text-[#1d1d1f] shadow-[0_2px_10px_rgba(0,113,227,0.2)] hover:shadow-[0_2px_10px_rgba(0,113,227,0.2)]'
                      : 'bg-gradient-to-r from-rose-600 to-rose-500 text-[#1d1d1f] shadow-[0_0_20px_rgba(244,63,94,0.3)] hover:shadow-[0_0_28px_rgba(244,63,94,0.45)]'
                  )}
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isCredit ? (
                    <Plus className="w-4 h-4" />
                  ) : (
                    <Minus className="w-4 h-4" />
                  )}
                  <span>
                    {isCredit ? 'Credit' : 'Debit'} ₹{amount || '0'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
