'use client';

import { useCallback, useEffect, useState } from 'react';
import { automationApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import {
  Zap,
  Plus,
  Loader2,
  Trash2,
  X,
  Activity,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Rule {
  id: string;
  name: string;
  keyword: string;
  matchType: 'contains' | 'exact' | 'starts_with';
  replyText: string;
  enabled: boolean;
  triggeredCount: number;
  lastTriggeredAt: string | null;
}

const MATCH_LABELS: Record<Rule['matchType'], string> = {
  contains: 'Message contains keyword',
  exact: 'Message is exactly the keyword',
  starts_with: 'Message starts with keyword',
};

export default function AutomationPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form
  const [name, setName] = useState('');
  const [keyword, setKeyword] = useState('');
  const [matchType, setMatchType] = useState<Rule['matchType']>('contains');
  const [replyText, setReplyText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await automationApi.list();
      setRules(data.data || []);
    } catch {
      toast.error('Could not load automation rules');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !keyword.trim() || !replyText.trim()) {
      toast.error('Fill in the rule name, keyword and reply');
      return;
    }
    setSaving(true);
    try {
      await automationApi.create({ name, keyword, matchType, replyText });
      toast.success('Rule saved — it runs on every incoming message');
      setShowModal(false);
      setName('');
      setKeyword('');
      setReplyText('');
      setMatchType('contains');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the rule'));
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (rule: Rule) => {
    try {
      await automationApi.update(rule.id, { enabled: !rule.enabled });
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)),
      );
    } catch {
      toast.error('Could not update the rule');
    }
  };

  const handleDelete = async (rule: Rule) => {
    try {
      await automationApi.remove(rule.id);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
      toast.success('Rule deleted');
    } catch {
      toast.error('Could not delete the rule');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-6 lg:p-8 space-y-6 select-none animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-black/[0.08]">
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-[#86868b]">
            AUTOMATIC REPLIES
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#1d1d1f] mt-0.5">
            Automation Rules
          </h1>
          <p className="text-xs text-[#86868b] mt-0.5">
            When an incoming message matches a keyword, your saved reply is sent
            automatically through the normal messaging pipeline.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="bh-btn-primary h-9 px-4 text-xs flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Rule</span>
        </button>
      </div>

      {/* Rules list */}
      {loading ? (
        <div className="p-12 flex items-center justify-center text-[#86868b]">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : rules.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white border border-black/[0.08] flex flex-col items-center text-center gap-3">
          <Zap className="w-8 h-8 text-[#86868b]" />
          <div className="text-sm font-semibold text-[#1d1d1f]">No automation rules yet</div>
          <p className="text-xs text-[#86868b] max-w-sm">
            Create a rule like “when a customer messages ‘price’, reply with your
            price list”. Rules run automatically on incoming messages.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="bh-btn-primary h-8 px-3.5 text-xs cursor-pointer mt-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create your first rule</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="p-4.5 rounded-xl bg-white border border-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex flex-col md:flex-row md:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[#1d1d1f]">{rule.name}</span>
                  <span
                    className={cn(
                      'badge text-[10px]',
                      rule.enabled ? 'badge-green' : 'bg-black/[0.05] text-[#86868b]',
                    )}
                  >
                    {rule.enabled ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className="text-[11px] text-[#6e6e73] mt-1">
                  When message{' '}
                  <span className="font-medium text-[#1d1d1f]">
                    {MATCH_LABELS[rule.matchType].toLowerCase().replace('message ', '')}
                  </span>{' '}
                  <span className="font-mono bg-black/[0.04] px-1.5 py-0.5 rounded text-[#0071e3]">
                    “{rule.keyword}”
                  </span>
                </div>
                <div className="text-[11px] text-[#86868b] mt-1 truncate max-w-xl">
                  Replies: “{rule.replyText}”
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="text-[13px] font-semibold text-[#1d1d1f] tabular-nums flex items-center gap-1">
                    <Activity className="w-3 h-3 text-[#86868b]" />
                    {rule.triggeredCount}
                  </div>
                  <div className="text-[10px] text-[#86868b]">times fired</div>
                </div>
                <button
                  onClick={() => toggleEnabled(rule)}
                  className={cn(
                    'relative w-10 h-6 rounded-full transition-colors cursor-pointer border-0',
                    rule.enabled ? 'bg-[#34c759]' : 'bg-black/[0.15]',
                  )}
                  title={rule.enabled ? 'Pause rule' : 'Activate rule'}
                  aria-label={rule.enabled ? 'Pause rule' : 'Activate rule'}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all',
                      rule.enabled ? 'left-[18px]' : 'left-0.5',
                    )}
                  />
                </button>
                <button
                  onClick={() => handleDelete(rule)}
                  className="p-2 rounded-lg text-[#86868b] hover:text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="Delete rule"
                  aria-label="Delete rule"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white border border-black/[0.1] shadow-[0_24px_64px_rgba(0,0,0,0.16)] space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <h3 className="text-base font-bold text-[#1d1d1f]">New Automation Rule</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.05] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-medium text-[#6e6e73] block mb-1">
                  Rule name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Price enquiry auto-reply"
                  className="bh-input w-full"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-medium text-[#6e6e73] block mb-1">
                    When message contains
                  </label>
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder="price"
                    className="bh-input w-full"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#6e6e73] block mb-1">
                    Match type
                  </label>
                  <select
                    value={matchType}
                    onChange={(e) => setMatchType(e.target.value as Rule['matchType'])}
                    className="bh-input w-full"
                  >
                    {Object.entries(MATCH_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label.replace('Message ', '')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-[#6e6e73] block mb-1">
                  Reply with
                </label>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Hi! Our catalogue starts at ₹499 — reply CATALOG to browse."
                  rows={3}
                  className="bh-input w-full h-auto py-2.5 resize-none"
                />
                <p className="text-[10px] text-[#86868b] mt-1">
                  Replies use the same free-message rules — they work while the
                  customer&apos;s 24-hour window is open.
                </p>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="bh-btn-primary w-full cursor-pointer disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                <span>{saving ? 'Saving…' : 'Save rule'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
