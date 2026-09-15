'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { gupshupApi, ConnectedNumber } from '@/lib/api';
import { useAuthStore } from '@/hooks/useAuth';
import { cn, getErrorMessage } from '@/lib/utils';
import {
  MessageSquare,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Smartphone,
  PhoneForwarded,
  ExternalLink,
  Radio,
  ShieldCheck,
  Plus,
  Inbox,
} from 'lucide-react';
import { toast } from 'sonner';

type Step = 'choice' | 'connecting' | 'status';
type WabaStatus = 'pending' | 'live' | 'rejected';

const HEALTH_DOT: Record<string, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-500',
  red: 'bg-red-500',
};

export default function OnboardingPage() {
  const router = useRouter();
  const { shop, user, loadFromStorage } = useAuthStore();
  const [step, setStep] = useState<Step>('choice');
  const [onboardingType, setOnboardingType] = useState<'new_number' | 'existing_number'>('new_number');
  const [businessName, setBusinessName] = useState('');
  const [starting, setStarting] = useState(false);
  const [embedLink, setEmbedLink] = useState<string | null>(null);
  const [wabaStatus, setWabaStatus] = useState<WabaStatus>('pending');
  const [polling, setPolling] = useState(false);
  // All numbers the shop has connected so far (multi-number, spec §2.4)
  const [numbers, setNumbers] = useState<ConnectedNumber[]>([]);
  // The app currently being onboarded (this flow creates a NEW app when
  // none is pending — shops can connect several numbers over time)
  const [currentAppId, setCurrentAppId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const loadNumbers = useCallback(async () => {
    try {
      const { data } = await gupshupApi.getNumbers();
      setNumbers(data.numbers || []);
      return data.numbers || [];
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    loadNumbers();
  }, [loadNumbers]);

  useEffect(() => {
    if (shop?.businessName) setBusinessName(shop.businessName);
  }, [shop]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback((appId: string | null) => {
    setPolling(true);
    pollRef.current = setInterval(async () => {
      try {
        const list = await loadNumbers();
        const mine = appId ? list.find((n) => n.gupshupAppId === appId) : list.find((n) => n.wabaStatus === 'pending');
        const st = (mine?.wabaStatus || 'pending') as WabaStatus;
        setWabaStatus(st);
        if (st === 'live') {
          stopPolling();
          toast.success('WhatsApp number connected!');
        } else if (st === 'rejected') {
          stopPolling();
        }
      } catch {
        // keep polling through transient errors
      }
    }, 3000);
  }, [loadNumbers, stopPolling]);

  const handleStart = async () => {
    if (!businessName.trim()) {
      toast.error('Enter your business name');
      return;
    }
    setStarting(true);
    try {
      const { data } = await gupshupApi.startOnboarding({
        onboardingType,
      });
      setEmbedLink(data.embedSignupLink);
      setCurrentAppId(data.appId || null);
      setWabaStatus(data.wabaStatus || 'pending');
      setStep('connecting');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to start onboarding'));
    } finally {
      setStarting(false);
    }
  };

  const openSignup = () => {
    if (!embedLink) return;
    window.open(embedLink, '_blank', 'width=680,height=860');
    setStep('status');
    startPolling(currentAppId);
  };

  const connectAnother = () => {
    stopPolling();
    setWabaStatus('pending');
    setEmbedLink(null);
    setCurrentAppId(null);
    setStep('choice');
  };

  const liveNumbers = numbers.filter((n) => n.wabaStatus === 'live');
  const pendingNumbers = numbers.filter((n) => n.wabaStatus === 'pending');

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative">
      <div className="w-full max-w-lg animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <div className="w-9 h-9 rounded-[10px] bg-[#0071e3] flex items-center justify-center shadow-[0_2px_10px_rgba(0,113,227,0.2)]">
            <MessageSquare className="w-4 h-4 text-[#061015]" />
          </div>
          <span className="text-[21px] font-bold text-[#F7FAFF] tracking-tight">BizzHouse</span>
        </div>

        <div className="bh-panel p-8 relative overflow-hidden">
          {/* ─── Step 1: Choice ─── */}
          {step === 'choice' && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <div className="type-overline text-[#0077ed] mb-1.5">CONNECT WHATSAPP</div>
                <h1 className="type-h2">How do you want to use WhatsApp?</h1>
                <p className="type-small text-[var(--bh-text-secondary)] mt-1.5">
                  We&apos;ll set everything up — you&apos;ll never need Meta&apos;s developer console.
                </p>
              </div>

              {/* Connected numbers (multi-number, spec §2.4) */}
              {numbers.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-[#1d1d1f]">
                    Your numbers ({liveNumbers.length} live)
                  </div>
                  {numbers.map((n) => (
                    <div
                      key={n.gupshupAppId}
                      className="p-3 rounded-xl bg-black/[0.03] border border-black/[0.08] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            'w-2 h-2 rounded-full',
                            n.wabaStatus === 'live'
                              ? HEALTH_DOT[n.health?.light || 'green']
                              : 'bg-[#86868b] animate-pulse',
                          )}
                        />
                        <div>
                          <div className="text-xs font-bold text-[#1d1d1f]">
                            {n.phoneNumber ? `+${n.phoneNumber}` : 'Number pending…'}
                          </div>
                          {n.wabaStatus === 'live' && n.health?.light !== 'green' && n.health?.reasons?.[0] && (
                            <div className="text-[10px] text-[#86868b]">{n.health.reasons[0]}</div>
                          )}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'badge text-[10px]',
                          n.wabaStatus === 'live' && 'badge-green',
                          n.wabaStatus === 'pending' && 'badge-yellow',
                          n.wabaStatus === 'rejected' && 'badge-red',
                        )}
                      >
                        {n.wabaStatus === 'live' ? 'LIVE' : n.wabaStatus === 'pending' ? 'PENDING' : 'REJECTED'}
                      </span>
                    </div>
                  ))}
                  <p className="text-[10px] text-[#86868b]">
                    You can connect more numbers — campaigns route across all of them automatically.
                  </p>
                </div>
              )}

              {/* Business name */}
              <div>
                <label htmlFor="ob-business" className="type-small text-[var(--bh-text-secondary)] block mb-1.5 font-medium">
                  Business name on WhatsApp
                </label>
                <input
                  id="ob-business"
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="bh-input w-full"
                  placeholder="Priya Luxury Silks"
                />
              </div>

              {/* Choice cards */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setOnboardingType('new_number')}
                  className={cn(
                    'w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer active:scale-[0.99]',
                    onboardingType === 'new_number'
                      ? 'bg-[#0071e3]/10 border-[#0071e3]/50 shadow-[0_2px_10px_rgba(0,113,227,0.2)]'
                      : 'bg-black/[0.03] border-black/[0.08] hover:border-black/[0.1]'
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border',
                    onboardingType === 'new_number'
                      ? 'bg-[#0071e3]/10 border-[#0071e3]/40 text-[#0077ed]'
                      : 'bg-black/[0.04] border-black/[0.08] text-[#86868b]'
                  )}>
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-[#1d1d1f] flex items-center gap-2">
                      Set up a new WhatsApp number
                      <span className="badge badge-green text-[9px]">RECOMMENDED</span>
                    </div>
                    <p className="text-xs text-[#86868b] mt-1 leading-relaxed">
                      Point us to a number that isn&apos;t on WhatsApp yet. Fully self-serve — connects in minutes.
                    </p>
                  </div>
                  <div className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5',
                    onboardingType === 'new_number' ? 'border-[#0071e3]' : 'border-slate-600'
                  )}>
                    {onboardingType === 'new_number' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#0071e3] shadow-[0_2px_10px_rgba(0,113,227,0.2)]" />
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setOnboardingType('existing_number')}
                  className={cn(
                    'w-full flex items-start gap-4 p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer active:scale-[0.99]',
                    onboardingType === 'existing_number'
                      ? 'bg-[#0071e3]/10 border-[#0071e3]/50 shadow-[0_2px_10px_rgba(0,113,227,0.2)]'
                      : 'bg-black/[0.03] border-black/[0.08] hover:border-black/[0.1]'
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border',
                    onboardingType === 'existing_number'
                      ? 'bg-[#0071e3]/10 border-[#0071e3]/40 text-[#0077ed]'
                      : 'bg-black/[0.04] border-black/[0.08] text-[#86868b]'
                  )}>
                    <PhoneForwarded className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-[#1d1d1f]">Connect my existing WhatsApp number</div>
                    <p className="text-xs text-[#86868b] mt-1 leading-relaxed">
                      Migrate your current Business number. Your number stays the same — may need a quick verification.
                    </p>
                  </div>
                  <div className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5',
                    onboardingType === 'existing_number' ? 'border-[#0071e3]' : 'border-slate-600'
                  )}>
                    {onboardingType === 'existing_number' && (
                      <span className="w-2.5 h-2.5 rounded-full bg-[#0071e3] shadow-[0_2px_10px_rgba(0,113,227,0.2)]" />
                    )}
                  </div>
                </button>
              </div>

              <button
                onClick={handleStart}
                disabled={starting || !businessName.trim()}
                className="bh-btn-primary w-full h-11 text-sm"
              >
                {starting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Preparing connection...</span>
                  </>
                ) : (
                  <>
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--bh-text-muted)]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#0071e3] opacity-70" />
                <span>Official Meta Cloud API · 100% policy compliant</span>
              </div>
            </div>
          )}

          {/* ─── Step 2: Connect ─── */}
          {step === 'connecting' && (
            <div className="space-y-6 text-center animate-fade-in">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-[#0071e3]/10 border border-[#0071e3]/35 flex items-center justify-center">
                <Radio className="w-8 h-8 text-[#0077ed]" />
              </div>
              <div>
                <h1 className="type-h2">Ready to connect</h1>
                <p className="type-small text-[var(--bh-text-secondary)] mt-2 max-w-sm mx-auto leading-relaxed">
                  A secure Meta window will open. Sign in with your Facebook account, pick your number, and accept
                  WhatsApp&apos;s terms — that&apos;s it.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-black/[0.03] border border-black/[0.08] text-left space-y-2.5">
                {[
                  'Sign in with your Facebook account',
                  onboardingType === 'new_number'
                    ? 'Choose or verify your new phone number'
                    : 'Select your existing Business number',
                  'Accept the WhatsApp Business terms',
                ].map((t, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs text-[#6e6e73]">
                    <span className="w-5 h-5 rounded-full bg-[#0071e3]/10 border border-[#0071e3]/35 text-[#0077ed] text-[10px] font-bold flex items-center justify-center shrink-0 font-mono">
                      {i + 1}
                    </span>
                    {t}
                  </div>
                ))}
              </div>

              <button onClick={openSignup} className="bh-btn-primary w-full h-11 text-sm">
                <span>Open Meta signup</span>
                <ExternalLink className="w-4 h-4" />
              </button>
              <button
                onClick={() => setStep('choice')}
                className="text-xs text-[#86868b] hover:text-[#1d1d1f] transition-colors bg-transparent border-0 cursor-pointer"
              >
                ← Back to choose a different option
              </button>
            </div>
          )}

          {/* ─── Step 3: Status ─── */}
          {step === 'status' && (
            <div className="space-y-6 text-center animate-fade-in">
              {wabaStatus === 'pending' && (
                <>
                  <div className="relative w-16 h-16 mx-auto">
                    <div className="absolute inset-0 border-2 border-[#0071e3]/30 border-t-[#0071e3] rounded-full animate-spin" />
                    <Clock className="absolute inset-0 m-auto w-6 h-6 text-[#0077ed]" />
                  </div>
                  <div>
                    <h1 className="type-h2">Waiting for connection…</h1>
                    <p className="type-small text-[var(--bh-text-secondary)] mt-2 max-w-sm mx-auto leading-relaxed">
                      Complete the steps in the Meta window. This page updates automatically — keep it open.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-[11px] text-[#86868b]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Polling status every 3 seconds
                  </div>
                  <button
                    onClick={openSignup}
                    className="bh-btn-secondary w-full h-10 text-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Reopen Meta signup window</span>
                  </button>
                </>
              )}

              {wabaStatus === 'live' && (
                <>
                  <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center shadow-[0_0_32px_rgba(52,211,153,0.25)]">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <div>
                    <h1 className="type-h2 text-emerald-600">WhatsApp connected!</h1>
                    <p className="type-small text-[var(--bh-text-secondary)] mt-2">
                      Your number is live on the official API. Import contacts, get a template
                      approved, and start broadcasting.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => router.push('/inbox')}
                      className="bh-btn-primary h-10 text-xs cursor-pointer"
                    >
                      <Inbox className="w-3.5 h-3.5" />
                      <span>Go to Inbox</span>
                    </button>
                    <button
                      onClick={connectAnother}
                      className="bh-btn-secondary h-10 text-xs cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Connect another number</span>
                    </button>
                  </div>
                </>
              )}

              {wabaStatus === 'rejected' && (
                <>
                  <div className="w-16 h-16 mx-auto rounded-full bg-rose-500/15 border border-rose-500/40 flex items-center justify-center">
                    <XCircle className="w-8 h-8 text-rose-400" />
                  </div>
                  <div>
                    <h1 className="type-h2 text-rose-400">Connection rejected</h1>
                    <p className="type-small text-[var(--bh-text-secondary)] mt-2">
                      Meta couldn&apos;t verify this number. Contact support or try again with a different number.
                    </p>
                  </div>
                  <button
                    onClick={() => { setStep('choice'); setWabaStatus('pending'); }}
                    className="bh-btn-secondary w-full h-10 text-xs"
                  >
                    Start over
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Skip for admins */}
        {user?.role === 'super_admin' && (
          <button
            onClick={() => router.push('/admin/overview')}
            className="mt-6 mx-auto flex items-center gap-1.5 text-xs text-[#86868b] hover:text-[#1d1d1f] transition-colors bg-transparent border-0 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Skip — go to admin dashboard
          </button>
        )}
      </div>
    </div>
  );
}
