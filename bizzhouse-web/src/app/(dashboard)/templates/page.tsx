'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Info,
  Layers,
  Send,
  X,
  Smartphone,
  ShieldCheck,
  Loader2,
  AlertCircle,
  Phone,
} from 'lucide-react';
import { normalizeButton } from '@/lib/normalize';
import { toast } from 'sonner';
import { cn, getErrorMessage } from '@/lib/utils';
import { templatesApi } from '@/lib/api';

interface Template {
  id: string;
  name: string;
  category: 'Marketing' | 'Utility' | 'Authentication';
  language: string;
  status: 'Approved' | 'In Review' | 'Rejected';
  body: string;
  buttons?: Array<string | { type?: string; text?: string }>;
  rejectionReason?: string | null;
  updatedAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [activeCategory, setActiveCategory] = useState<'All' | 'Marketing' | 'Utility' | 'Authentication'>('All');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // New template form
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'Marketing' | 'Utility' | 'Authentication'>('Marketing');
  const [bodyText, setBodyText] = useState('');

  const mapBackendCategory = (cat: string): 'Marketing' | 'Utility' | 'Authentication' => {
    if (cat === 'MARKETING') return 'Marketing';
    if (cat === 'UTILITY') return 'Utility';
    if (cat === 'AUTHENTICATION') return 'Authentication';
    return 'Marketing';
  };

  const mapBackendStatus = (st: string): 'Approved' | 'In Review' | 'Rejected' => {
    if (st === 'APPROVED') return 'Approved';
    if (st === 'REJECTED' || st === 'FAILED') return 'Rejected';
    return 'In Review';
  };

  const loadTemplates = useCallback(async () => {
    try {
      const { data } = await templatesApi.list();
      if (Array.isArray(data)) {
        const mapped: Template[] = data.map((t) => ({
          id: t.id as string,
          name: t.elementName as string,
          category: mapBackendCategory(t.category as string),
          language: (t.language as string) || 'English (US)',
          status: mapBackendStatus(t.status as string),
          body: t.body as string,
          buttons: (t.buttons as string[]) || [],
          rejectionReason: (t.rejectionReason as string) || null,
          updatedAt: new Date(t.createdAt as string).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }),
        }));
        setTemplates(mapped);
        setActiveTemplate((prev) => mapped.find((t) => t.id === prev?.id) || mapped[0] || null);
      }
    } catch {
      toast.error('Could not load templates');
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !bodyText.trim()) {
      toast.error('Please enter template name and message body');
      return;
    }

    const elementName = name.toLowerCase().replace(/\s+/g, '_');
    const backendCategoryMap: Record<string, string> = {
      Marketing: 'MARKETING',
      Utility: 'UTILITY',
      Authentication: 'AUTHENTICATION',
    };

    setSubmitting(true);
    try {
      await templatesApi.create({
        elementName,
        category: backendCategoryMap[category] || 'MARKETING',
        body: bodyText,
        buttons: ['Visit Store', 'Stop Promotions'],
      });

      // Reload the real rows — the backend holds the authoritative status
      // (IN_REVIEW) and the Gupshup template id.
      await loadTemplates();
      setShowModal(false);
      setName('');
      setBodyText('');
      toast.success('Template submitted to Meta for verification');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create template'));
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    if (activeCategory === 'All') return true;
    return t.category === activeCategory;
  });

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-6 lg:p-8 space-y-6 select-none animate-fade-in">
      {/* â”€â”€â”€ Compact Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-black/[0.08]">
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-[#86868b]">
            MESSAGE TEMPLATES
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#1d1d1f] mt-0.5">
            Message Templates
          </h1>
          <p className="text-xs text-[#86868b] mt-0.5">
            Pre-approved Meta WhatsApp templates with dynamic parameter substitution.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="bh-btn-primary h-9 px-4 text-xs flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Template</span>
        </button>
      </div>

      {/* â”€â”€â”€ Filter Pills â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex flex-wrap gap-1.5">
        {(['All', 'Marketing', 'Utility', 'Authentication'] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer',
              activeCategory === cat
                ? 'bg-[#0071e3]/10 text-[#0077ed] border border-[#0071e3]/40 shadow-sm'
                : 'bg-black/[0.04] text-[#86868b] hover:text-[#1d1d1f] border border-black/[0.06]'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* â”€â”€â”€ Split Screen: List & Live WhatsApp Preview â”€â”€â”€ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Template Cards List */}
        <div className="lg:col-span-7 space-y-3">
          {filteredTemplates.length === 0 && (
            <div className="p-10 rounded-xl border border-black/[0.08] bg-white text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-[#86868b] mx-auto" />
              <div className="text-sm font-semibold text-[#1d1d1f]">No templates yet</div>
              <p className="text-xs text-[#86868b] max-w-sm mx-auto">
                Submit your first message template for Meta approval. Approved templates
                can be used in broadcasts and for reaching contacts outside the 24-hour window.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="bh-btn-primary h-8 px-3.5 text-xs cursor-pointer mt-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Template</span>
              </button>
            </div>
          )}
          {filteredTemplates.map((tpl) => (
            <div
              key={tpl.id}
              onClick={() => setActiveTemplate(tpl)}
              className={cn(
                'p-4.5 rounded-xl border transition-all duration-200 cursor-pointer relative active:scale-[0.995]',
                activeTemplate?.id === tpl.id
                  ? 'bg-[#0071e3]/10 border-[#0071e3]/50 shadow-[0_2px_10px_rgba(0,113,227,0.2)]'
                  : 'bg-white border-black/[0.08] hover:border-black/[0.1] hover:bg-black/[0.03]'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold text-[#1d1d1f]">{tpl.name}</span>
                <span
                  className={cn(
                    'badge text-[10px]',
                    tpl.status === 'Approved' && 'badge-green',
                    tpl.status === 'In Review' && 'badge-yellow',
                    tpl.status === 'Rejected' && 'badge-red'
                  )}
                >
                  {tpl.status === 'Approved' && <CheckCircle2 className="w-3 h-3 mr-0.5" />}
                  {tpl.status}
                </span>
              </div>

              <p className="text-xs text-[#6e6e73] leading-relaxed font-normal">{tpl.body}</p>

              <div className="mt-3 pt-2.5 border-t border-black/[0.06] flex items-center justify-between text-[11px] text-[#86868b]">
                <span className="badge badge-cyan text-[10px]">{tpl.category}</span>
                <span className="text-[10px] text-[#86868b]">{tpl.updatedAt}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Right: Phone Mockup Live Preview */}
        <div className="lg:col-span-5 sticky top-4">
          <div className="p-5 rounded-2xl bg-white border border-black/[0.08] shadow-[0_2px_12px_rgba(0,0,0,0.06)] space-y-4">
            <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#0071e3]" />
                <span className="text-xs font-bold text-[#1d1d1f]">Live Customer Preview</span>
              </div>
              {activeTemplate?.status === 'Approved' && (
                <span className="badge badge-green text-[10px]">Approved</span>
              )}
            </div>

            {/* Mobile Device Mockup Frame */}
            <div className="p-4 rounded-xl bg-white border border-black/[0.08] shadow-inner space-y-3">
              {/* Header inside phone */}
              <div className="flex items-center gap-2 pb-2.5 border-b border-black/[0.06]">
                <div className="w-7 h-7 rounded-full bg-[#0071e3]/10 border border-[#0071e3]/35 flex items-center justify-center text-[10px] font-bold text-[#0071e3]">
                  BH
                </div>
                <div>
                  <div className="text-[12px] font-bold text-[#1d1d1f] flex items-center gap-1">
                    <span>BizzHouse Official</span>
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  </div>
                  <div className="text-[9px] text-emerald-600">Official Business Account</div>
                </div>
              </div>

              {activeTemplate ? (
                <>
                  {/* Message Bubble */}
                  <div className="p-3.5 rounded-xl bh-bubble-out text-xs leading-relaxed space-y-2.5">
                    <p className="whitespace-pre-wrap">{activeTemplate.body}</p>
                    <div className="text-[10px] text-right text-white/75 font-mono">12:45 PM ✓✓</div>
                  </div>

                  {/* Interactive Buttons */}
                  {activeTemplate.buttons && activeTemplate.buttons.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {activeTemplate.buttons.map((btn, i) => {
                        const normalized = normalizeButton(btn);
                        if (!normalized.label) return null;
                        return (
                          <div
                            key={i}
                            className="py-2 px-3 rounded-lg bg-black/[0.04] border border-black/[0.08] text-center text-xs font-semibold text-[#0071e3] hover:bg-black/[0.03] transition-colors flex items-center justify-center gap-1.5"
                          >
                            {normalized.type === 'URL' && <ExternalLink className="w-3 h-3" />}
                            {normalized.type === 'PHONE_NUMBER' && <Phone className="w-3 h-3" />}
                            {normalized.label}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <div className="p-6 text-center text-xs text-[#86868b]">
                  Select a template to preview what your customers will see.
                </div>
              )}
            </div>

            <div className="text-[11px] text-[#86868b] text-center">
              Variables such as {'{{1}}'}, {'{{2}}'} will automatically interpolate with customer data.
            </div>
          </div>
        </div>
      </div>

      {/* â”€â”€â”€ Create Template Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-[#f5f5f7] border border-black/[0.1] shadow-[0_24px_64px_rgba(0,0,0,0.14)] space-y-4 animate-scale-in">
            <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
              <h3 className="text-base font-bold text-[#1d1d1f]">Create Meta Template</h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.03] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5">
              <div>
                <label className="text-xs font-medium text-[#6e6e73] block mb-1">
                  Template Identifier Name (lowercase_snake_case)
                </label>
                <input
                  type="text"
                  placeholder="e.g. festive_drop_october"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bh-input w-full font-mono text-xs"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[#6e6e73] block mb-1">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as 'Marketing' | 'Utility' | 'Authentication')
                  }
                  className="bh-input w-full"
                >
                  <option value="Marketing" className="bg-[#f5f5f7] text-[#1d1d1f]">Marketing</option>
                  <option value="Utility" className="bg-[#f5f5f7] text-[#1d1d1f]">Utility / Transactional</option>
                  <option value="Authentication" className="bg-[#f5f5f7] text-[#1d1d1f]">Authentication / OTP</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-[#6e6e73] block mb-1">
                  Message Body (Use {'{{1}}'}, {'{{2}}'} for dynamic values)
                </label>
                <textarea
                  rows={4}
                  placeholder="Hello {{1}}, your order {{2}} has been confirmed..."
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  className="w-full p-3 rounded-xl bg-black/40 border border-white/[0.1] text-xs text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[rgba(56,189,248,0.55)] focus:shadow-[0_0_0_3px_rgba(56,189,248,0.12)] focus:outline-none transition-all resize-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="bh-btn-secondary h-9 px-3.5 text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bh-btn-primary h-9 px-4 text-xs cursor-pointer flex items-center gap-1.5"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Submit for Approval</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
