'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/hooks/useAuth';
import Link from 'next/link';
import {
  MessageSquare,
  Radio,
  FileText,
  ShieldCheck,
  Zap,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  Send,
  ExternalLink,
  ChevronRight,
  Layers,
  IndianRupee,
  Users,
} from 'lucide-react';
import { LiquidGlass } from '@/components/ui/glass/LiquidGlass';
import { GlassChip } from '@/components/ui/glass/GlassChip';
import { Badge } from '@/components/ui/primitives/Badge';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, loadFromStorage } = useAuthStore();
  const [demoInput, setDemoInput] = useState('');
  const [demoMessages, setDemoMessages] = useState([
    {
      id: 1,
      sender: 'business',
      text: 'Namaste Priya! ✨ Your festive order #BH-9821 has been dispatched via Priority BlueDart. Expected delivery tomorrow by 2 PM.',
      time: '11:42 AM',
      status: 'read',
    },
    {
      id: 2,
      sender: 'customer',
      text: 'Thank you! Can I change delivery address to my office?',
      time: '11:43 AM',
      status: 'received',
    },
    {
      id: 3,
      sender: 'business',
      text: 'Certainly! Tap below to update your drop location or confirm via pin code.',
      time: '11:44 AM',
      status: 'read',
      quickReply: '📍 Update Pin Location',
    },
  ]);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const handleSendDemo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!demoInput.trim()) return;

    setDemoMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        sender: 'business',
        text: demoInput,
        time: 'Just now',
        status: 'read',
      },
    ]);
    setDemoInput('');
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden bg-[#f5f5f7] selection:bg-[#0071e3] selection:text-white">
      {/* â”€â”€â”€ Edge-to-Edge Atmospheric Color Field â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="bh-atmosphere" />

      {/* Hero Optical Floating Lens */}
      <div className="absolute top-20 right-1/4 pointer-events-none opacity-30 z-0">
        <LiquidGlass shape="blob" tone="cyan" intensity="hero" decorative />
      </div>

      {/* â”€â”€â”€ 72px Floating Glass Navigation Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="w-full px-5 md:px-10 pt-5 sticky top-0 z-50">
        <header className="h-[72px] max-w-[1400px] mx-auto bh-glass-toolbar px-6 md:px-8 flex items-center justify-between shadow-[0_4px_16px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[11px] bg-[#0071e3] flex items-center justify-center shadow-[0_2px_10px_rgba(0,113,227,0.2)]">
              <MessageSquare className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-[22px] font-[700] text-[#1d1d1f] tracking-[-0.02em]">
              BizzHouse
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 type-ui text-[var(--bh-text-secondary)]">
            <a href="#features" className="hover:text-[#1d1d1f] transition-colors">
              Capabilities
            </a>
            <a href="#simulator" className="hover:text-[#1d1d1f] transition-colors">
              Live Simulator
            </a>
            <a href="#pricing" className="hover:text-[#1d1d1f] transition-colors">
              Pricing
            </a>
            <a href="#compliance" className="hover:text-[#1d1d1f] transition-colors">
              Meta API
            </a>
          </nav>

          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <button
                onClick={() => router.push('/inbox')}
                className="bh-btn-primary h-11 px-5 text-sm flex items-center gap-2 cursor-pointer shadow-[0_2px_10px_rgba(0,113,227,0.2)]"
              >
                <span>Go to Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => router.push('/login')}
                  className="px-4 py-2 text-sm font-semibold text-[var(--bh-text-secondary)] hover:text-[#1d1d1f] transition-colors cursor-pointer border-0 bg-transparent"
                >
                  Sign in
                </button>
                <button
                  onClick={() => router.push('/register')}
                  className="bh-btn-primary h-11 px-5 text-sm flex items-center gap-2 cursor-pointer shadow-[0_2px_10px_rgba(0,113,227,0.2)]"
                >
                  <span>Get started</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </header>
      </div>

      {/* â”€â”€â”€ Padded Bounded 2-Column Hero â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section className="relative z-10 w-full max-w-[1400px] mx-auto px-6 md:px-12 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
        {/* Left Column: Hero Typography & Actions */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#f5f5f7] border border-[var(--bh-hairline)] shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
            <span className="w-2 h-2 rounded-full bg-[#0071e3] animate-pulse" />
            <span className="type-overline text-[#0077ed]">
              OFFICIAL WHATSAPP BUSINESS PLATFORM
            </span>
          </div>

          <h1 className="type-hero-display text-[#1d1d1f]">
            Good conversations move{' '}
            <span className="bh-text-gradient">business forward</span>.
          </h1>

          <p className="type-hero-support text-[var(--bh-text-secondary)] leading-relaxed">
            Plan broadcasts, keep every reply in one place, and know exactly where your
            balance goes. Built for high-throughput Indian merchant commerce.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-3">
            <button
              onClick={() => router.push('/register')}
              className="bh-btn-primary h-12 px-7 text-base flex items-center gap-2.5 cursor-pointer shadow-[0_0_30px_rgba(56, 189, 248,0.4)]"
            >
              <span>Create broadcast</span>
              <ArrowRight className="w-4.5 h-4.5" />
            </button>
            <a
              href="#simulator"
              className="bh-btn-secondary h-12 px-6 text-base flex items-center gap-2 cursor-pointer"
            >
              <span>View live demo</span>
            </a>
          </div>

          {/* Metric Strip */}
          <div className="grid grid-cols-3 gap-6 pt-8 border-t border-[var(--bh-hairline)] max-w-lg">
            <div>
              <div className="type-metric-secondary text-[#1d1d1f] tabular-nums">99.8%</div>
              <div className="type-label text-[var(--bh-text-muted)] mt-1">Delivery rate</div>
            </div>
            <div>
              <div className="type-metric-secondary text-[#0077ed] tabular-nums">91.4%</div>
              <div className="type-label text-[var(--bh-text-muted)] mt-1">Avg read rate</div>
            </div>
            <div>
              <div className="type-metric-secondary text-[#1d1d1f] tabular-nums">&lt; 90s</div>
              <div className="type-label text-[var(--bh-text-muted)] mt-1">Reply window</div>
            </div>
          </div>
        </div>

        {/* Right Column: Phone on Dedicated Material Platform */}
        <div id="simulator" className="lg:col-span-5 flex justify-center lg:justify-end">
          <div className="relative p-5 sm:p-7 rounded-[38px] bg-[#1d1d1f] border border-black/40 shadow-[0_24px_64px_rgba(0,0,0,0.18)]">
            {/* Platform Radial Backdrop Glow */}
            <div className="absolute inset-0 rounded-[38px] bg-[radial-gradient(circle_at_50%_40%,rgba(0,113,227,0.08)_0%,rgba(88,86,214,0.05)_50%,transparent_75%)] pointer-events-none" />

            {/* 430px Device Shell */}
            <div className="bh-device-shell w-[360px] sm:w-[410px] h-[750px] relative shrink-0">
              <div className="bh-device-screen w-full h-full flex flex-col">
              {/* Dynamic Island (116x34px) */}
              <div className="bh-dynamic-island" />

              {/* Status Header */}
              <div className="pt-12 px-6 pb-3.5 border-b border-black/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8.5 h-8.5 rounded-full bg-[#0071e3] flex items-center justify-center text-xs font-bold text-white">
                    BH
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#1d1d1f] flex items-center gap-1">
                      <span>BizzHouse Luxury</span>
                      <ShieldCheck className="w-3.5 h-3.5 text-[#0071e3]" />
                    </div>
                    <div className="text-[10px] text-emerald-600">Online • Official WABA</div>
                  </div>
                </div>
                <Badge variant="cyan" className="scale-80 origin-right">
                  LIVE DEMO
                </Badge>
              </div>

              {/* Chat Area */}
              <div className="p-4 space-y-3.5 h-[560px] overflow-y-auto flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="text-center">
                    <span className="text-[11px] text-[var(--bh-text-muted)] bg-[#f5f5f7] px-3.5 py-1 rounded-full border border-[var(--bh-hairline)]">
                      Today • Official WhatsApp Channel
                    </span>
                  </div>

                  {demoMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        msg.sender === 'business' ? 'items-end' : 'items-start'
                      } animate-fade-in`}
                    >
                      <div
                        className={`max-w-[88%] p-3.5 rounded-[18px] text-xs leading-relaxed shadow-sm ${
                          msg.sender === 'business'
                            ? 'bh-bubble-out'
                            : 'bg-[#e9e9eb] text-[#1d1d1f]'
                        }`}
                      >
                        <p>{msg.text}</p>

                        {msg.quickReply && (
                          <div className="mt-2.5 pt-2 border-t border-white/15">
                            <span className="inline-block py-1 px-2.5 rounded-[8px] bg-white/15 border border-white/25 text-white text-[11px] font-semibold">
                              {msg.quickReply}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-[var(--bh-text-muted)]">
                          <span>{msg.time}</span>
                          {msg.sender === 'business' && (
                            <span className="text-white/85 font-bold">✓✓</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Composer Inside Phone Shell */}
                <form
                  onSubmit={handleSendDemo}
                  className="pt-2 border-t border-black/[0.06] flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={demoInput}
                    onChange={(e) => setDemoInput(e.target.value)}
                    placeholder="Type a WhatsApp reply..."
                    className="flex-1 bg-[#f5f5f7] border border-[var(--bh-hairline)] rounded-[14px] px-3.5 py-2.5 text-xs text-[#1d1d1f] placeholder:text-[var(--bh-text-muted)] focus:outline-none focus:border-[#0071e3]"
                  />
                  <button
                    type="submit"
                    className="w-9 h-9 rounded-[14px] bg-[#0071e3] flex items-center justify-center text-white shadow-[0_2px_10px_rgba(0,113,227,0.2)] cursor-pointer shrink-0 border-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* â”€â”€â”€ Bounded Capability Panels (Not Outline on Black) â”€â”€ */}
      <section id="features" className="relative z-10 w-full max-w-[1400px] mx-auto px-6 md:px-12 py-20">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="type-overline text-[#0077ed] mb-2">
            OPERATIONAL ARCHITECTURE
          </div>
          <h2 className="type-page-title text-[#1d1d1f]">
            Engineered for high-volume WhatsApp commerce.
          </h2>
          <p className="type-body text-[var(--bh-text-secondary)] mt-2">
            BizzHouse replaces scattered tools with one unified, prepaid operating platform.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: MessageSquare,
              title: 'Multi-agent Team Inbox',
              desc: 'Handle thousands of simultaneous WhatsApp customer chats in real time with agent assignment, custom labels, and quick canned responses.',
            },
            {
              icon: Radio,
              title: 'High-throughput Broadcasts',
              desc: 'Deliver announcements, flash drops, and catalog updates to verified opted-in customer lists with automated read tracking.',
            },
            {
              icon: FileText,
              title: 'Meta-Approved Templates',
              desc: 'Author and submit rich WhatsApp templates with dynamic variables, CTA buttons, and quick replies directly through Meta WABA API.',
            },
            {
              icon: IndianRupee,
              title: 'Transparent Prepaid Wallet',
              desc: 'No expensive recurring lock-ins. Top up credits via UPI or Card; pay only per WhatsApp conversation delivered.',
            },
            {
              icon: Users,
              title: 'Opt-in & Consent Safeguards',
              desc: 'Strict opt-in status tagging, automated STOP handling, and compliance records protect your WhatsApp phone number quality rating.',
            },
            {
              icon: ShieldCheck,
              title: 'Official Cloud API Routing',
              desc: '100% compliant with WhatsApp Business Terms. Zero unapproved APKs, zero account ban risks, and ultra-low latency webhooks.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="bh-card-solid p-7 relative flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-[16px] bg-[#f5f5f7] border border-[var(--bh-hairline)] flex items-center justify-center mb-5 shadow-[0_4px_20px_rgba(0,0,0,0.35)]">
                  <f.icon className="w-6 h-6 text-[#0077ed]" />
                </div>
                <h3 className="type-card-title text-[#1d1d1f] mb-2">{f.title}</h3>
                <p className="type-body text-sm text-[var(--bh-text-secondary)] leading-relaxed">
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* â”€â”€â”€ Pricing Plane â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <section id="pricing" className="relative z-10 w-full max-w-[1400px] mx-auto px-6 md:px-12 py-16">
        <div className="bh-card-solid p-8 md:p-12 relative overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="type-overline text-[#0077ed]">
                ZERO MONTHLY RETAINERS
              </div>
              <h2 className="type-page-title text-[#1d1d1f]">
                Prepaid credit wallet. Pay only for what you send.
              </h2>
              <p className="type-body text-[var(--bh-text-secondary)] max-w-xl">
                Recharge ₹500 or ₹50,000 whenever needed. Deductions occur only per 24-hour
                customer conversation window.
              </p>
              <div className="flex flex-wrap gap-4 pt-3">
                <div className="p-4 rounded-[16px] bg-white border border-[var(--bh-hairline)]">
                  <div className="type-label">Marketing Conversation</div>
                  <div className="text-xl font-bold text-[#1d1d1f] tabular-nums mt-0.5">
                    ₹0.78 <span className="text-xs text-[var(--bh-text-muted)] font-normal">/ 24h</span>
                  </div>
                </div>
                <div className="p-4 rounded-[16px] bg-white border border-[var(--bh-hairline)]">
                  <div className="type-label">Utility & Alerts</div>
                  <div className="text-xl font-bold text-[#0077ed] tabular-nums mt-0.5">
                    ₹0.32 <span className="text-xs text-[var(--bh-text-muted)] font-normal">/ 24h</span>
                  </div>
                </div>
                <div className="p-4 rounded-[16px] bg-white border border-[var(--bh-hairline)]">
                  <div className="type-label">Service (Customer Inbound)</div>
                  <div className="text-xl font-bold text-emerald-600 tabular-nums mt-0.5">
                    ₹0.30 <span className="text-xs text-[var(--bh-text-muted)] font-normal">/ 24h</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col items-center justify-center p-8 rounded-[24px] bg-[#f5f5f7] border border-[var(--bh-hairline)] shadow-[0_8px_24px_rgba(0,0,0,0.08)] text-center">
              <div className="w-14 h-14 rounded-full bg-[#f5f5f7] border border-[var(--bh-hairline)] flex items-center justify-center mb-4 shadow-[0_2px_10px_rgba(0,113,227,0.2)]">
                <IndianRupee className="w-7 h-7 text-[#0077ed]" />
              </div>
              <h3 className="type-section-title text-[#1d1d1f]">Get ₹100 Free Credits</h3>
              <p className="type-table text-[var(--bh-text-secondary)] mt-2 mb-6 max-w-xs">
                Sign up today and test your first 100 WhatsApp broadcasts completely on us.
              </p>
              <button
                onClick={() => router.push('/register')}
                className="bh-btn-primary w-full py-3.5 text-sm cursor-pointer shadow-[0_2px_10px_rgba(0,113,227,0.2)]"
              >
                Claim Free Credits Now
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[var(--bh-hairline)] mt-auto bg-[#f5f5f7]">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[var(--bh-text-muted)]">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[#1d1d1f]">BizzHouse</span>
            <span>• © 2026 BizzHouse Technologies. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-[var(--bh-text-secondary)]">
              Official WhatsApp Business Platform Partner
            </span>
            <Link href="/login" className="text-[#0077ed] hover:underline">
              Partner Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
