'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/hooks/useAuth';
import { MessageSquare, Eye, EyeOff, Loader2, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { getErrorMessage } from '@/lib/utils';
import { LiquidGlass } from '@/components/ui/glass/LiquidGlass';
import { GlassChip } from '@/components/ui/glass/GlassChip';

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    businessName: '',
    category: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [field]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.register(form);
      setAuth(data.user, data.shop, data.token);
      toast.success('Account created! Welcome to BizzHouse.');
      router.push('/onboarding');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Registration failed. Please check your details.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row relative overflow-hidden bg-[#f5f5f7]">
      {/* â”€â”€â”€ Left Branding Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12 xl:p-16 border-r border-[var(--bh-hairline)] bg-[#f5f5f7]/70 backdrop-blur-2xl">
        {/* Optical refractive lens */}
        <div className="absolute top-1/4 -left-20 pointer-events-none opacity-60">
          <LiquidGlass shape="blob" tone="cyan" intensity="hero" decorative />
        </div>

        {/* Top Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-[12px] bg-[#0071e3] flex items-center justify-center shadow-[0_2px_10px_rgba(0,113,227,0.2)]">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <span className="text-[24px] font-[700] text-[#1d1d1f] tracking-[-0.02em]">
            <span className="bg-gradient-to-r from-[#0077ed] to-[#0071e3] bg-clip-text text-transparent">
              B
            </span>
            izzHouse
          </span>
        </div>

        {/* Center Content */}
        <div className="relative z-10 max-w-lg space-y-6">
          <div className="inline-flex items-center gap-2">
            <GlassChip tone="cyan" label="Onboard in 3 minutes" />
          </div>

          <h2 className="type-h1 text-[#1d1d1f] text-3xl xl:text-4xl">
            Scale your brand on official WhatsApp Business.
          </h2>

          <p className="type-body text-[var(--bh-text-secondary)] leading-relaxed">
            Provision your dedicated WhatsApp Business API number, top up your messaging
            wallet, and start broadcasts with zero fixed commitments.
          </p>

          {/* Stepper list */}
          <div className="space-y-4 pt-4 border-t border-[var(--bh-hairline)]">
            {[
              { n: '01', t: 'Create your account', d: 'Business identity and primary administrator' },
              { n: '02', t: 'Connect WhatsApp number', d: 'New dedicated virtual number or migrate existing' },
              { n: '03', t: 'Top up & broadcast', d: 'Instant UPI recharge and template broadcasts' },
            ].map((s) => (
              <div key={s.n} className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-[#0071e3]/10 border border-[#0071e3]/35 flex items-center justify-center text-xs font-bold text-[#0077ed] shrink-0 font-mono">
                  {s.n}
                </div>
                <div>
                  <div className="text-sm font-bold text-[#1d1d1f]">{s.t}</div>
                  <div className="text-xs text-[var(--bh-text-muted)]">{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 text-xs text-[var(--bh-text-muted)] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#0071e3]" />
          <span>Meta Verified Cloud Solution Provider â€¢ 100% Policy Compliant</span>
        </div>
      </div>

      {/* â”€â”€â”€ Right Form Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12 relative z-10 w-full lg:w-1/2 overflow-y-auto">
        <div className="w-full max-w-md animate-fade-in space-y-6 py-6">
          {/* Mobile Brand */}
          <div className="lg:hidden flex items-center gap-2.5 justify-center mb-4">
            <div className="w-9 h-9 rounded-[10px] bg-[#0071e3] flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <span className="text-2xl font-[700] text-[#1d1d1f] tracking-[-0.02em]">
              BizzHouse
            </span>
          </div>

          <div className="bh-panel p-8 relative overflow-hidden">
            <div className="mb-6">
              <h1 className="type-h2 text-[#1d1d1f]">Create your account</h1>
              <p className="type-small text-[var(--bh-text-secondary)] mt-1">
                Set up your business on WhatsApp in minutes
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="reg-name"
                  className="type-small text-[var(--bh-text-secondary)] block mb-1.5 font-medium"
                >
                  Your full name
                </label>
                <input
                  id="reg-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={update('name')}
                  className="bh-input w-full"
                  placeholder="Priya Sharma"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-business"
                  className="type-small text-[var(--bh-text-secondary)] block mb-1.5 font-medium"
                >
                  Business / Brand name
                </label>
                <input
                  id="reg-business"
                  type="text"
                  required
                  value={form.businessName}
                  onChange={update('businessName')}
                  className="bh-input w-full"
                  placeholder="Priya Luxury Silks"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-category"
                  className="type-small text-[var(--bh-text-secondary)] block mb-1.5 font-medium"
                >
                  Industry Category
                </label>
                <select
                  id="reg-category"
                  value={form.category}
                  onChange={update('category')}
                  className="bh-input w-full"
                >
                  <option value="">Select industry category</option>
                  <option value="retail">Retail & Fashion</option>
                  <option value="ecommerce">E-Commerce</option>
                  <option value="food">Food & Beverage</option>
                  <option value="health">Health & Wellness</option>
                  <option value="services">Professional Services</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="reg-email"
                  className="type-small text-[var(--bh-text-secondary)] block mb-1.5 font-medium"
                >
                  Business email
                </label>
                <input
                  id="reg-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={update('email')}
                  className="bh-input w-full"
                  placeholder="priya@luxurysilks.in"
                />
              </div>

              <div>
                <label
                  htmlFor="reg-password"
                  className="type-small text-[var(--bh-text-secondary)] block mb-1.5 font-medium"
                >
                  Password (min 8 characters, with a letter and a number)
                </label>
                <div className="relative">
                  <input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={form.password}
                    onChange={update('password')}
                    className="bh-input w-full pr-10"
                    placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
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

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="bh-btn-primary w-full flex items-center justify-center gap-2 cursor-pointer shadow-[0_2px_10px_rgba(0,113,227,0.2)]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating shop...</span>
                    </>
                  ) : (
                    <>
                      <span>Start on BizzHouse</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>

            <div className="mt-6 pt-5 border-t border-[var(--bh-hairline)] text-center">
              <p className="type-small text-[var(--bh-text-muted)]">
                Already registered?{' '}
                <Link
                  href="/login"
                  className="text-[#0071e3] font-semibold hover:underline"
                >
                  Sign in here
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
