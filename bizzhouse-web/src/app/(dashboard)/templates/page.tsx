'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileText,
  Plus,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Layers,
  X,
  Smartphone,
  Loader2,
  AlertCircle,
  Phone,
  RefreshCw,
  ImageIcon,
  Trash2,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { normalizeButton } from '@/lib/normalize';
import { toast } from 'sonner';
import { cn, getErrorMessage } from '@/lib/utils';
import { templatesApi, CarouselCardInput } from '@/lib/api';

interface Template {
  id: string;
  name: string;
  category: 'Marketing' | 'Utility' | 'Authentication';
  language: string;
  status: 'Approved' | 'In Review' | 'Rejected';
  body: string;
  templateType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'CAROUSEL';
  cards?: CarouselCardInput[] | null;
  buttons?: Array<string | { type?: string; text?: string }>;
  rejectionReason?: string | null;
  updatedAt: string;
}

interface CardDraft {
  headerType: 'IMAGE';
  file: File | null;
  mediaId: string | null;
  uploading: boolean;
  body: string;
  buttonType: 'none' | 'URL' | 'QUICK_REPLY';
  buttonText: string;
  buttonUrl: string;
}

const emptyCard = (): CardDraft => ({
  headerType: 'IMAGE',
  file: null,
  mediaId: null,
  uploading: false,
  body: '',
  buttonType: 'none',
  buttonText: '',
  buttonUrl: '',
});

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<Template | null>(null);
  const [activeCategory, setActiveCategory] = useState<'All' | 'Marketing' | 'Utility' | 'Authentication'>('All');
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // New template form
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'Marketing' | 'Utility' | 'Authentication'>('Marketing');
  const [templateType, setTemplateType] = useState<'TEXT' | 'CAROUSEL'>('TEXT');
  const [bodyText, setBodyText] = useState('');
  const [buttonType, setButtonType] = useState<'none' | 'URL' | 'QUICK_REPLY'>('none');
  const [buttonText, setButtonText] = useState('');
  const [buttonUrl, setButtonUrl] = useState('');
  const [footerText, setFooterText] = useState('');
  // Carousel cards (2-10 — Meta's media-card carousel limit)
  const [cards, setCards] = useState<CardDraft[]>([emptyCard(), emptyCard()]);
  const [previewCard, setPreviewCard] = useState(0);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

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
          templateType: (t.templateType as Template['templateType']) || 'TEXT',
          cards: (t.cards as CarouselCardInput[]) || null,
          buttons: (t.buttons as Template['buttons']) || [],
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

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await templatesApi.sync();
      await loadTemplates();
      toast.success(
        `Synced with Gupshup — ${data.imported} imported, ${data.updated} updated`,
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Sync failed — check that a number is connected'));
    } finally {
      setSyncing(false);
    }
  };

  // ─── Carousel card media: upload happens FIRST, synchronously, and the
  // returned mediaId is what gets attached to the card (spec §2.2/§3.3.5).
  const uploadCardMedia = async (idx: number, file: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error('Card images must be JPEG, PNG or WebP');
      return;
    }
    const next = [...cards];
    next[idx] = { ...next[idx], file, uploading: true, mediaId: null };
    setCards(next);
    try {
      const res = await templatesApi.uploadMedia(file);
      const after = [...cards];
      after[idx] = { ...after[idx], mediaId: res.mediaId, uploading: false };
      setCards(after);
      toast.success(`Card ${idx + 1} image uploaded to WhatsApp`);
    } catch (err) {
      const after = [...cards];
      after[idx] = { ...after[idx], file: null, uploading: false };
      setCards(after);
      toast.error(getErrorMessage(err, `Card ${idx + 1} upload failed`));
    }
  };

  const updateCard = (idx: number, patch: Partial<CardDraft>) => {
    const next = [...cards];
    next[idx] = { ...next[idx], ...patch };
    setCards(next);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || (templateType === 'TEXT' && !bodyText.trim())) {
      toast.error('Please enter a template name and message body');
      return;
    }
    if (templateType === 'CAROUSEL') {
      if (cards.length < 2) {
        toast.error('A carousel needs at least 2 cards (Meta limit)');
        return;
      }
      for (const [i, c] of cards.entries()) {
        if (!c.mediaId) {
          toast.error(`Card ${i + 1}: upload its image first — every card needs real media`);
          return;
        }
        if (!c.body.trim()) {
          toast.error(`Card ${i + 1}: add the card text`);
          return;
        }
      }
    }
    if (buttonType !== 'none' && !buttonText.trim()) {
      toast.error('Button needs a label');
      return;
    }
    if (buttonType === 'URL' && !buttonUrl.trim()) {
      toast.error('URL button needs a link');
      return;
    }

    const elementName = name.toLowerCase().replace(/\s+/g, '_');
    const backendCategoryMap: Record<string, string> = {
      Marketing: 'MARKETING',
      Utility: 'UTILITY',
      Authentication: 'AUTHENTICATION',
    };
    const button =
      buttonType === 'none'
        ? undefined
        : buttonType === 'URL'
          ? [{ type: 'URL', text: buttonText.trim(), url: buttonUrl.trim() }]
          : [{ type: 'QUICK_REPLY', text: buttonText.trim() }];

    const carouselCards: CarouselCardInput[] | undefined =
      templateType === 'CAROUSEL'
        ? cards.map((c) => ({
            headerType: 'IMAGE',
            mediaId: c.mediaId!,
            body: c.body.trim(),
            buttons:
              c.buttonType === 'none'
                ? undefined
                : c.buttonType === 'URL'
                  ? [{ type: 'URL', text: c.buttonText.trim(), url: c.buttonUrl.trim() }]
                  : [{ type: 'QUICK_REPLY', text: c.buttonText.trim() }],
          }))
        : undefined;

    setSubmitting(true);
    try {
      await templatesApi.create({
        elementName,
        category: backendCategoryMap[category] || 'MARKETING',
        body: templateType === 'CAROUSEL' ? bodyText.trim() || 'Explore our collection' : bodyText.trim(),
        templateType,
        cards: carouselCards,
        vertical: 'products',
        footerText: footerText.trim() || undefined,
        buttons: button,
      });

      await loadTemplates();
      setShowModal(false);
      setName('');
      setBodyText('');
      setButtonType('none');
      setButtonText('');
      setButtonUrl('');
      setFooterText('');
      setTemplateType('TEXT');
      setCards([emptyCard(), emptyCard()]);
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

  const activeCards = activeTemplate?.cards || [];

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-6 lg:p-8 space-y-6 select-none animate-fade-in">
      {/* ─── Compact Header ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-black/[0.08]">
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-[#86868b]">
            MESSAGE TEMPLATES
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#1d1d1f] mt-0.5">
            Message Templates
          </h1>
          <p className="text-xs text-[#86868b] mt-0.5">
            Meta-approved templates — text or carousel collages of up to 10 product cards.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="bh-btn-secondary h-9 px-4 text-xs flex items-center gap-1.5 cursor-pointer"
            title="Pull templates that exist on Gupshup/Meta — including ones created outside BizzHouse"
          >
            {syncing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>Sync from Gupshup</span>
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bh-btn-primary h-9 px-4 text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Template</span>
          </button>
        </div>
      </div>

      {/* ─── Filter Pills ───────────────────────────────── */}
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

      {/* ─── Split Screen: List & Live WhatsApp Preview ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Template Cards List */}
        <div className="lg:col-span-7 space-y-3">
          {filteredTemplates.length === 0 && (
            <div className="p-10 rounded-xl border border-black/[0.08] bg-white text-center space-y-2">
              <FileText className="w-8 h-8 text-[#86868b] mx-auto" />
              <div className="text-sm font-semibold text-[#1d1d1f]">No templates yet</div>
              <p className="text-xs text-[#86868b] max-w-sm mx-auto">
                Submit a template for Meta approval, or sync to import ones already approved on
                Gupshup. Approved templates power broadcasts and carousel collages.
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
              onClick={() => { setActiveTemplate(tpl); setPreviewCard(0); }}
              className={cn(
                'p-4.5 rounded-xl border transition-all duration-200 cursor-pointer relative active:scale-[0.995]',
                activeTemplate?.id === tpl.id
                  ? 'bg-[#0071e3]/10 border-[#0071e3]/50 shadow-[0_2px_10px_rgba(0,113,227,0.2)]'
                  : 'bg-white border-black/[0.08] hover:border-black/[0.1] hover:bg-black/[0.03]'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-bold text-[#1d1d1f] flex items-center gap-1.5">
                  {tpl.templateType === 'CAROUSEL' && <Layers className="w-3.5 h-3.5 text-[#0071e3]" />}
                  {tpl.name}
                </span>
                <span
                  className={cn(
                    'badge text-[10px]',
                    tpl.status === 'Approved' && 'badge-green',
                    tpl.status === 'In Review' && 'badge-yellow',
                    tpl.status === 'Rejected' && 'badge-red'
                  )}
                >
                  {tpl.status === 'Approved' && <CheckCircle2 className="w-3 h-3 mr-0.5" />}
                  {tpl.status === 'Rejected' && <XCircle className="w-3 h-3 mr-0.5" />}
                  {tpl.status}
                </span>
              </div>

              <p className="text-xs text-[#6e6e73] leading-relaxed font-normal">{tpl.body}</p>

              {tpl.templateType === 'CAROUSEL' && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="badge badge-cyan text-[10px] flex items-center gap-1">
                    <Layers className="w-3 h-3" />
                    Carousel · {tpl.cards?.length ?? 0} cards
                  </span>
                </div>
              )}

              {tpl.status === 'Rejected' && tpl.rejectionReason && (
                <div className="mt-2 flex items-start gap-1.5 p-2 rounded-lg bg-red-50 border border-red-100">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                  <span className="text-[11px] text-red-700 leading-snug">{tpl.rejectionReason}</span>
                </div>
              )}

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
                activeTemplate.templateType === 'CAROUSEL' && activeCards.length > 0 ? (
                  <>
                    {/* Carousel bubble */}
                    <div className="p-3 rounded-xl bh-bubble-out text-xs leading-relaxed space-y-2.5">
                      <p className="whitespace-pre-wrap">{activeTemplate.body}</p>
                      <div className="relative">
                        <div className="rounded-lg overflow-hidden bg-black/[0.06] border border-black/[0.08] space-y-2">
                          {/* Card image — real uploaded media renders when the
                              template row carries an accessible url; mediaId-only
                              rows show the structured placeholder */}
                          <div className="h-36 flex items-center justify-center bg-gradient-to-br from-[#0071e3]/10 to-[#0071e3]/5">
                            <ImageIcon className="w-8 h-8 text-[#0071e3]/40" />
                          </div>
                          <div className="px-2.5 pb-2 space-y-1.5">
                            <p className="text-[11px] text-[#1d1d1f] leading-snug">
                              {activeCards[previewCard]?.body || ''}
                            </p>
                            {(activeCards[previewCard]?.buttons || []).map((b, i) => {
                              const normalized = normalizeButton(b);
                              if (!normalized.label) return null;
                              return (
                                <div
                                  key={i}
                                  className="py-1.5 rounded-md bg-black/[0.04] border border-black/[0.08] text-center text-[11px] font-semibold text-[#0071e3] flex items-center justify-center gap-1"
                                >
                                  {normalized.type === 'URL' && <ExternalLink className="w-3 h-3" />}
                                  {normalized.label}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {/* Card pager */}
                        <div className="mt-2 flex items-center justify-center gap-2">
                          <button
                            onClick={() => setPreviewCard((p) => Math.max(0, p - 1))}
                            disabled={previewCard === 0}
                            className="p-1 rounded-full bg-black/[0.05] disabled:opacity-30 cursor-pointer"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[10px] text-[#86868b] font-mono">
                            {previewCard + 1} / {activeCards.length}
                          </span>
                          <button
                            onClick={() => setPreviewCard((p) => Math.min(activeCards.length - 1, p + 1))}
                            disabled={previewCard >= activeCards.length - 1}
                            className="p-1 rounded-full bg-black/[0.05] disabled:opacity-30 cursor-pointer"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] text-right text-white/75 font-mono">12:45 PM ✓✓</div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Message Bubble */}
                    <div className="p-3.5 rounded-xl bh-bubble-out text-xs leading-relaxed space-y-2.5">
                      <p className="whitespace-pre-wrap">{activeTemplate.body}</p>
                      <div className="text-[10px] text-right text-white/75 font-mono">12:45 PM ✓✓</div>
                    </div>

                    {/* Interactive Buttons — exactly the buttons saved with the template */}
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
                )
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

      {/* ─── Create Template Modal ──────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fade-in overflow-y-auto">
          <div className="w-full max-w-lg p-6 rounded-2xl bg-[#f5f5f7] border border-black/[0.1] shadow-[0_24px_64px_rgba(0,0,0,0.14)] space-y-4 animate-scale-in my-8">
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[#6e6e73] block mb-1">Category</label>
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
                  <label className="text-xs font-medium text-[#6e6e73] block mb-1">Type</label>
                  <select
                    value={templateType}
                    onChange={(e) => setTemplateType(e.target.value as 'TEXT' | 'CAROUSEL')}
                    className="bh-input w-full"
                  >
                    <option value="TEXT" className="bg-[#f5f5f7] text-[#1d1d1f]">Text message</option>
                    <option value="CAROUSEL" className="bg-[#f5f5f7] text-[#1d1d1f]">
                      Carousel collage (2-10 image cards)
                    </option>
                  </select>
                </div>
              </div>

              {templateType === 'TEXT' ? (
                <div>
                  <label className="text-xs font-medium text-[#6e6e73] block mb-1">
                    Message Body (Use {'{{1}}'}, {'{{2}}'} for dynamic values)
                  </label>
                  <textarea
                    rows={4}
                    placeholder="Hello {{1}}, your order {{2}} has been confirmed..."
                    value={bodyText}
                    onChange={(e) => setBodyText(e.target.value)}
                    className="bh-input w-full text-xs resize-none"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-[#6e6e73] block mb-1">
                      Intro text (optional, appears above the cards)
                    </label>
                    <input
                      type="text"
                      placeholder="New arrivals just for you"
                      value={bodyText}
                      onChange={(e) => setBodyText(e.target.value)}
                      className="bh-input w-full text-xs"
                      maxLength={1028}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-[#1d1d1f]">
                      Cards ({cards.length}/10) — each needs an uploaded image
                    </label>
                    <div className="flex gap-1.5">
                      {cards.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setCards(cards.slice(0, -1))}
                          className="p-1.5 rounded-lg bg-black/[0.05] text-[#86868b] hover:text-[#1d1d1f] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {cards.length < 10 && (
                        <button
                          type="button"
                          onClick={() => setCards([...cards, emptyCard()])}
                          className="p-1.5 rounded-lg bg-[#0071e3]/10 text-[#0071e3] cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                    {cards.map((card, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-white border border-black/[0.08] space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-[#1d1d1f]">Card {idx + 1}</span>
                          {card.mediaId ? (
                            <span className="badge badge-green text-[10px] flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Uploaded · {card.mediaId.slice(0, 8)}…
                            </span>
                          ) : card.uploading ? (
                            <span className="badge badge-yellow text-[10px] flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Uploading…
                            </span>
                          ) : (
                            <span className="badge badge-red text-[10px]">No image</span>
                          )}
                        </div>

                        <input
                          ref={(el) => { fileInputs.current[idx] = el; }}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadCardMedia(idx, f);
                            e.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputs.current[idx]?.click()}
                          disabled={card.uploading}
                          className="w-full py-2 rounded-lg border border-dashed border-black/[0.15] text-[11px] font-semibold text-[#0071e3] hover:bg-[#0071e3]/5 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          {card.file ? card.file.name : 'Upload card image (JPEG/PNG/WebP)'}
                        </button>

                        <input
                          type="text"
                          placeholder="Card text — e.g. Summer sale, {{1}} off!"
                          value={card.body}
                          onChange={(e) => updateCard(idx, { body: e.target.value })}
                          className="bh-input w-full text-xs"
                          maxLength={160}
                        />

                        <div className="flex gap-1.5">
                          <select
                            value={card.buttonType}
                            onChange={(e) =>
                              updateCard(idx, { buttonType: e.target.value as CardDraft['buttonType'] })
                            }
                            className="bh-input text-[11px] w-28"
                          >
                            <option value="none">No button</option>
                            <option value="URL">Open URL</option>
                            <option value="QUICK_REPLY">Quick reply</option>
                          </select>
                          {card.buttonType !== 'none' && (
                            <input
                              type="text"
                              placeholder="Button label"
                              value={card.buttonText}
                              onChange={(e) => updateCard(idx, { buttonText: e.target.value })}
                              className="bh-input text-[11px] flex-1"
                              maxLength={25}
                            />
                          )}
                        </div>
                        {card.buttonType === 'URL' && (
                          <input
                            type="url"
                            placeholder="https://yourshop.com/product"
                            value={card.buttonUrl}
                            onChange={(e) => updateCard(idx, { buttonUrl: e.target.value })}
                            className="bh-input w-full text-[11px]"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {templateType === 'TEXT' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-[#6e6e73] block mb-1">Button</label>
                    <select
                      value={buttonType}
                      onChange={(e) => setButtonType(e.target.value as typeof buttonType)}
                      className="bh-input w-full"
                    >
                      <option value="none">None</option>
                      <option value="URL">Visit website</option>
                      <option value="QUICK_REPLY">Quick reply</option>
                    </select>
                  </div>
                  {buttonType !== 'none' && (
                    <div>
                      <label className="text-xs font-medium text-[#6e6e73] block mb-1">Button label</label>
                      <input
                        type="text"
                        placeholder="Shop now"
                        value={buttonText}
                        onChange={(e) => setButtonText(e.target.value)}
                        className="bh-input w-full text-xs"
                        maxLength={25}
                      />
                    </div>
                  )}
                </div>
              )}

              {buttonType === 'URL' && (
                <input
                  type="url"
                  placeholder="https://yourshop.com/promo"
                  value={buttonUrl}
                  onChange={(e) => setButtonUrl(e.target.value)}
                  className="bh-input w-full text-xs"
                />
              )}

              <div>
                <label className="text-xs font-medium text-[#6e6e73] block mb-1">
                  Footer (optional)
                </label>
                <input
                  type="text"
                  placeholder="Thank you"
                  value={footerText}
                  onChange={(e) => setFooterText(e.target.value)}
                  className="bh-input w-full text-xs"
                  maxLength={60}
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
