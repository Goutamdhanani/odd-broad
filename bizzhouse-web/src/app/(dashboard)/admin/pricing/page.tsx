'use client';

import { useCallback, useEffect, useState } from 'react';
import { pricingApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { Loader2, RefreshCw, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PriceRow {
  key: string; // "marketing:IN"
  category: string;
  country: string;
  costPaise: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  marketing: 'Marketing',
  utility: 'Utility',
  authentication: 'Authentication',
  service: 'Service (session)',
};

export default function AdminPricingPage() {
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await pricingApi.get();
      const parsed: PriceRow[] = Object.entries(data.prices || {}).map(([key, value]) => {
        const [category, country] = key.split(':');
        return { key, category, country, costPaise: Number(value) };
      });
      parsed.sort((a, b) => a.category.localeCompare(b.category) || a.country.localeCompare(b.country));
      setRows(parsed);
      setDraft(Object.fromEntries(parsed.map((r) => [r.key, String(r.costPaise)])));
    } catch (err) {
      setError('Only the platform admin can view pricing.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveRow = async (row: PriceRow) => {
    const raw = draft[row.key];
    const value = parseInt(raw, 10);
    if (!Number.isInteger(value) || value < 0) {
      toast.error('Price must be a non-negative whole number of paise');
      return;
    }
    setSavingKey(row.key);
    try {
      const { data } = await pricingApi.update({ [row.key]: value });
      setRows((prev) =>
        prev.map((r) =>
          r.key === row.key
            ? { ...r, costPaise: Number(data.prices[row.key] ?? value) }
            : r,
        ),
      );
      toast.success(`${CATEGORY_LABELS[row.category] || row.category} (${row.country}) updated — new sends are priced immediately`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update the price'));
    } finally {
      setSavingKey(null);
    }
  };

  const dirty = (row: PriceRow) => String(row.costPaise) !== draft[row.key];

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-6 lg:p-8 space-y-6 select-none animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-black/[0.08]">
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-[#86868b]">
            RATE CARD
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#1d1d1f] mt-0.5">
            Message Pricing
          </h1>
          <p className="text-xs text-[#86868b] mt-0.5">
            What shops pay per message, by category and country. Changes apply to
            new sends immediately — no deploy needed.
          </p>
        </div>
        <button
          onClick={load}
          className="p-2 rounded-lg text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.04] cursor-pointer self-start sm:self-auto"
          title="Reload"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {loading ? (
        <div className="p-12 flex items-center justify-center text-[#86868b]">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : error ? (
        <div className="p-8 rounded-xl bg-white border border-black/[0.08] text-center text-sm text-[#86868b]">
          {error}
        </div>
      ) : (
        <div className="rounded-2xl bg-white border border-black/[0.08] overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-black/[0.06] text-[10px] uppercase font-bold tracking-wider text-[#86868b] bg-black/[0.02]">
              <tr>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Country</th>
                <th className="py-3 px-4">Price (paise)</th>
                <th className="py-3 px-4">In ₹</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.05]">
              {rows.map((row) => (
                <tr key={row.key} className="hover:bg-black/[0.015] transition-colors">
                  <td className="py-3 px-4 font-semibold text-[#1d1d1f]">
                    {CATEGORY_LABELS[row.category] || row.category}
                  </td>
                  <td className="py-3 px-4 font-mono text-[#6e6e73]">{row.country}</td>
                  <td className="py-3 px-4">
                    <input
                      type="number"
                      min={0}
                      value={draft[row.key] ?? ''}
                      onChange={(e) => setDraft({ ...draft, [row.key]: e.target.value })}
                      className="bh-input h-8 w-28 text-xs"
                      aria-label={`Price for ${row.category} ${row.country}`}
                    />
                  </td>
                  <td className="py-3 px-4 tabular-nums text-[#6e6e73]">
                    ₹{(Number(draft[row.key] || 0) / 100).toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => saveRow(row)}
                      disabled={!dirty(row) || savingKey === row.key}
                      className={cn(
                        'bh-btn-primary h-7 px-3 text-[11px] cursor-pointer inline-flex items-center gap-1',
                        (!dirty(row) || savingKey === row.key) && 'opacity-40 cursor-not-allowed',
                      )}
                    >
                      {savingKey === row.key ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Check className="w-3 h-3" />
                      )}
                      <span>Save</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
