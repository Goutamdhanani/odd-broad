'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/hooks/useAuth';
import { MessageSquare, Eye, EyeOff, Loader2, ArrowRight, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { getErrorMessage } from '@/lib/utils';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.login({ email, password });
      setAuth(data.user, data.shop, data.token);
      toast.success('Welcome back to BizzHouse');
      if (data.user.role === 'super_admin') {
        router.push('/admin/overview');
      } else {
        router.push('/overview');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Invalid email or password'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row relative overflow-hidden bg-[var(--bh-bg-base)]">
      {/* ═══ Left Branding Panel ═══════════════════════════ */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12 xl:p-16 border-r border-[var(--bh-hairline)] bg-[var(--bh-bg-base)]/70 backdrop-blur-2xl">
        {/* Atmospheric gradient orbs */}
        <div className="absolute top-0 left-0 w-[70%] h-[60%] rounded-full bg-[radial-gradient(circle,rgba(0,113,227,0.07)_0%,rgba(88,86,214,0.05)_40%,transparent_65%)] blur-3xl pointer-events-none animate-float" />
        <div className="absolute bottom-0 right-0 w-[55%] h-[50%] rounded-full bg-[radial-gradient(circle,rgba(175,82,222,0.05)_0%,transparent_60%)] blur-3xl pointer-events-none" />

        {/* Top Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="relative w-10 h-10 rounded-[12px] bg-[#0071e3] flex items-center justify-center shadow-[0_2px_10px_rgba(0,113,227,0.3)]">
            <MessageSquare className="w-[18px] h-[18px] text-white" />
          </div>
          <span className="text-[24px] font-[700] text-[#1d1d1f] tracking-[-0.02em]">
            BizzHouse
          </span>
        </div>

        {/* Center Headline */}
        <div className="relative z-10 max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/[0.04] border border-[var(--bh-hairline)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--bh-accent)] animate-pulse" />
            <span className="type-micro text-[var(--bh-accent-bright)]">WhatsApp Business Platform</span>
          </div>

          <h2 className="text-[30px] xl:text-[36px] font-[700] tracking-[-0.025em] leading-[1.08] text-[#1d1d1f]">
            Good conversations move{' '}
            <span className="bh-text-gradient">business forward</span>.
          </h2>

          <p className="text-[15px] text-[var(--bh-text-secondary)] leading-relaxed max-w-md">
            Manage conversations, launch high-delivery broadcasts, and monitor wallet balances
            in real time through official Meta Cloud infrastructure.
          </p>

          {/* Trust points */}
          <div className="grid grid-cols-3 gap-5 pt-5 border-t border-[var(--bh-hairline-subtle)]">
            <div>
              <div className="text-[15px] font-[650] tracking-[-0.01em] text-[var(--bh-accent)]">Official API</div>
              <div className="text-[11px] font-semibold text-[var(--bh-text-muted)] mt-0.5">Meta Cloud Platform</div>
            </div>
            <div>
              <div className="text-[15px] font-[650] tracking-[-0.01em] text-[#1d1d1f]">Real-time inbox</div>
              <div className="text-[11px] font-semibold text-[var(--bh-text-muted)] mt-0.5">Instant delivery ticks</div>
            </div>
            <div>
              <div className="text-[15px] font-[650] tracking-[-0.01em] text-[#1d1d1f]">Transparent wallet</div>
              <div className="text-[11px] font-semibold text-[var(--bh-text-muted)] mt-0.5">Per-message ledger</div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-[11px] text-[var(--bh-text-muted)] flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[var(--bh-accent)] opacity-70" />
          <span>Meta Verified Cloud Solution Provider</span>
        </div>
      </div>

      {/* ═══ Right Form Panel ══════════════════════════════ */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 relative z-10 w-full lg:w-1/2">
        <div className="w-full max-w-md animate-float-in space-y-6">
          {/* Mobile Brand */}
          <div className="lg:hidden flex items-center gap-2.5 justify-center mb-6">
            <div className="w-10 h-10 rounded-[12px] bg-[#0071e3] flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span className="text-2xl font-[700] text-[#1d1d1f] tracking-[-0.02em]">
              BizzHouse
            </span>
          </div>

          <div className="bh-glass-premium p-7 lg:p-8 relative overflow-hidden">
            <div className="mb-6">
              <h1 className="text-[22px] font-[800] tracking-[-0.03em] text-[#1d1d1f]">Sign in to BizzHouse</h1>
              <p className="text-[13px] text-[var(--bh-text-secondary)] mt-1.5">
                Enter your credentials to access your WhatsApp console
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="login-email"
                  className="text-[12px] font-medium text-[var(--bh-text-secondary)] block mb-1.5"
                >
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bh-input w-full"
                  placeholder="name@business.com"
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="login-password"
                    className="text-[12px] font-medium text-[var(--bh-text-secondary)] block"
                  >
                    Password
                  </label>
                </div>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bh-input w-full pr-10"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--bh-text-muted)] hover:text-[#1d1d1f] transition-colors cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="bh-btn-primary bh-btn-glow w-full flex items-center justify-center gap-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing in...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="mt-5 pt-4 border-t border-[var(--bh-hairline-subtle)] text-center">
              <p className="text-[13px] text-[var(--bh-text-muted)]">
                Don&apos;t have a shop account yet?{' '}
                <Link
                  href="/register"
                  className="text-[var(--bh-accent)] font-semibold hover:text-[var(--bh-accent-bright)] transition-colors"
                >
                  Create one now
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
