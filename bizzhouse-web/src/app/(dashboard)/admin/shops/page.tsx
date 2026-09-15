'use client';

import { useState, useEffect, useCallback } from 'react';
import { shopsApi } from '@/lib/api';
import { formatPaise, cn, getErrorMessage } from '@/lib/utils';
import {
  Store,
  Loader2,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ShopSummary } from '@/lib/types';

export default function AdminShopsPage() {
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadShops = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const { data } = await shopsApi.listAll(p, 15);
      setShops(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setPage(p);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadShops(1);
  }, [loadShops]);

  const updateStatus = async (id: string, status: string) => {
    try {
      await shopsApi.updateStatus(id, status);
      toast.success(
        `Shop ${status === 'active' ? 'activated' : status === 'suspended' ? 'suspended' : 'updated'}`
      );
      loadShops(page);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update shop status'));
    }
  };

  const filteredShops = shops.filter(
    (s) =>
      s.businessName?.toLowerCase().includes(search.toLowerCase()) ||
      s.id?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10 space-y-8 select-none animate-fade-in">
      {/* â”€â”€â”€ 140â€“156 px Page Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="min-h-[144px] flex flex-col justify-center border-b border-[var(--bh-hairline)] pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="type-overline text-[var(--bh-text-muted)]">
              MULTI-TENANT PLATFORM PROVISIONING
            </div>
            <h1 className="type-page-title text-[#1d1d1f]">Manage Shops</h1>
            <p className="type-body text-[var(--bh-text-secondary)] max-w-2xl">
              Audit merchant accounts, inspect live WhatsApp API bindings, and govern activation status.
            </p>
          </div>
          <span className="badge badge-cyan text-xs py-1.5 px-3">
            {total} Registered Tenants
          </span>
        </div>
      </div>

      {/* â”€â”€â”€ Search Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--bh-text-muted)]" />
        <input
          type="text"
          placeholder="Search shops by business name or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bh-input w-full pl-10 text-sm"
        />
      </div>

      {/* â”€â”€â”€ Bounded Table Plane (60px Rows) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="bh-card-solid overflow-hidden border border-[var(--bh-hairline)] shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 text-[12px] font-semibold text-[var(--bh-text-muted)] uppercase tracking-wider border-b border-[var(--bh-hairline)] bg-[#f5f5f7]">
          <div className="col-span-4">Business / Account</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Prepaid Balance</div>
          <div className="col-span-2">Joined Date</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-7 h-7 text-[#0071e3] animate-spin" />
          </div>
        ) : filteredShops.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Store className="w-12 h-12 text-[var(--bh-text-muted)] mb-3 opacity-30" />
            <p className="type-ui font-semibold text-[#1d1d1f]">No registered shops found</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--bh-hairline)]">
            {filteredShops.map((shop) => (
              <div
                key={shop.id}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 px-6 py-4 items-center bh-table-row"
              >
                {/* Name */}
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

                {/* Status */}
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
                    {shop.status === 'active' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-1" />
                    )}
                    {shop.status}
                  </span>
                </div>

                {/* Balance */}
                <div className="md:col-span-2 type-table font-bold text-[#0077ed] tabular-nums font-mono">
                  {formatPaise(shop.walletBalancePaise || 0)}
                </div>

                {/* Created */}
                <div className="md:col-span-2 type-table text-[var(--bh-text-muted)]">
                  {new Date(shop.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>

                {/* Actions */}
                <div className="md:col-span-2 flex justify-start md:justify-end gap-2">
                  {shop.status !== 'active' && (
                    <button
                      onClick={() => updateStatus(shop.id, 'active')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#f5f5f7] text-emerald-600 border border-[rgba(74,222,128,0.3)] hover:bg-[#f5f5f7] rounded-[10px] transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Activate</span>
                    </button>
                  )}
                  {shop.status !== 'suspended' && (
                    <button
                      onClick={() => updateStatus(shop.id, 'suspended')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#ff3b30]/10 text-[#c5221c] border border-[#ff3b30]/25 hover:bg-[#ff3b30]/15 rounded-[10px] transition-colors cursor-pointer"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Suspend</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-[var(--bh-hairline)] flex items-center justify-between bg-[#f5f5f7]">
            <span className="type-label text-[var(--bh-text-muted)]">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => loadShops(page - 1)}
                disabled={page <= 1}
                className="p-2 rounded-[10px] bg-[#f5f5f7] border border-[var(--bh-hairline)] hover:border-[var(--bh-hairline-strong)] disabled:opacity-30 cursor-pointer text-[#1d1d1f]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => loadShops(page + 1)}
                disabled={page >= totalPages}
                className="p-2 rounded-[10px] bg-[#f5f5f7] border border-[var(--bh-hairline)] hover:border-[var(--bh-hairline-strong)] disabled:opacity-30 cursor-pointer text-[#1d1d1f]"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
