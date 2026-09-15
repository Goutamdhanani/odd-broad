'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/hooks/useAuth';
import Link from 'next/link';
import {
  MessageSquare,
  Users,
  Wallet,
  Settings,
  LogOut,
  LayoutDashboard,
  Shield,
  Radio,
  FileText,
  Smartphone,
  Home,
  Zap,
  UsersRound,
  IndianRupee,
} from 'lucide-react';
import { cn, formatPaise } from '@/lib/utils';

const shopNav = [
  { href: '/overview', icon: Home, label: 'Overview' },
  { href: '/inbox', icon: MessageSquare, label: 'Inbox' },
  { href: '/automation', icon: Zap, label: 'Automation' },
  { href: '/broadcasts', icon: Radio, label: 'Broadcasts' },
  { href: '/templates', icon: FileText, label: 'Templates' },
  { href: '/contacts', icon: Users, label: 'Contacts' },
  { href: '/wallet', icon: Wallet, label: 'Wallet' },
  { href: '/team', icon: UsersRound, label: 'Team' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

const adminNav = [
  { href: '/admin/overview', icon: LayoutDashboard, label: 'Overview' },
  { href: '/admin/shops', icon: Shield, label: 'Shops' },
  { href: '/admin/wallet', icon: Wallet, label: 'Wallet Admin' },
  { href: '/admin/pricing', icon: IndianRupee, label: 'Pricing' },
];

const routeTitles: Record<string, { title: string; subtitle: string; category?: string }> = {
  '/overview': { title: 'Overview', subtitle: 'Your messaging activity, wallet and audience at a glance', category: 'DASHBOARD' },
  '/automation': { title: 'Automation Rules', subtitle: 'Keyword auto-replies that run on incoming messages', category: 'AUTOMATION' },
  '/team': { title: 'Team Members', subtitle: 'Agents who share this shop inbox', category: 'TEAM' },
  '/admin/pricing': { title: 'Message Pricing', subtitle: 'Rate card by category and country', category: 'ADMIN' },
  '/inbox': { title: 'Conversations', subtitle: 'WhatsApp Business API multi-agent team inbox', category: 'MESSAGING' },
  '/onboarding': { title: 'WhatsApp Onboarding', subtitle: 'Provision WABA cloud API number via Gupshup', category: 'SETUP' },
  '/broadcasts': { title: 'Broadcast Campaigns', subtitle: 'Approved template broadcasting & delivery analytics', category: 'GROWTH' },
  '/templates': { title: 'Message Templates', subtitle: 'Pre-approved Meta WhatsApp templates repository', category: 'MANAGEMENT' },
  '/contacts': { title: 'Customer Directory', subtitle: 'Verified WhatsApp opt-in directory & segmentation', category: 'AUDIENCE' },
  '/wallet': { title: 'Messaging Balance', subtitle: 'Prepaid conversation credit wallet & transaction ledger', category: 'FINANCE' },
  '/settings': { title: 'Account Settings', subtitle: 'WhatsApp Business profile & cloud webhook credentials', category: 'SYSTEM' },
  '/admin/overview': { title: 'Platform Overview', subtitle: 'Global throughput and server health', category: 'ADMIN' },
  '/admin/shops': { title: 'Manage Shops', subtitle: 'Tenant provisioning & WhatsApp binding', category: 'ADMIN' },
  '/admin/wallet': { title: 'Wallet Admin', subtitle: 'Platform escrow audit & manual credits', category: 'ADMIN' },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, shop, isLoading, isAuthenticated, loadFromStorage, logout } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  const isAdmin = user?.role === 'super_admin';

  useEffect(() => {
    if (!isLoading && isAuthenticated && isAdmin && !shop) {
      if (pathname === '/inbox' || pathname === '/contacts' || pathname === '/wallet') {
        router.replace('/admin/overview');
      }
    }
  }, [isLoading, isAuthenticated, isAdmin, shop, pathname, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bh-bg-base)]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-[var(--bh-accent)] border-t-transparent animate-spin" />
            <div className="absolute inset-1 rounded-full border border-[var(--bh-indigo)] border-b-transparent animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          </div>
          <span className="text-xs font-medium text-[var(--bh-text-muted)]">Loading BizzHouse…</span>
        </div>
      </div>
    );
  }

  const currentRouteInfo = routeTitles[pathname] || {
    title: 'BizzHouse',
    subtitle: 'WhatsApp Business Platform',
    category: 'WORKSPACE',
  };

  return (
    <div className="h-screen max-h-screen w-screen overflow-hidden p-2.5 md:p-3.5 bg-[var(--bh-bg-base)] flex gap-2.5 md:gap-3.5 relative select-none">
      {/* ═══ 260px Left Navigation Sidebar ════ */}
      <aside className="hidden md:flex flex-col w-[256px] lg:w-[272px] h-full bh-glass-rail shrink-0 z-20 overflow-hidden">
        {/* Brand Header */}
        <div className="h-[68px] flex items-center justify-between px-5 border-b border-black/[0.08] shrink-0">
          <Link href="/inbox" className="flex items-center gap-3 group">
            <div className="relative w-9 h-9 rounded-[10px] bg-[#0071e3] flex items-center justify-center shadow-[0_2px_8px_rgba(0,113,227,0.3)] transition-transform duration-300 group-hover:scale-105">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-[17px] font-[700] text-[#1d1d1f] tracking-[-0.02em] leading-none">
                BizzHouse
              </span>
              <span className="text-[9.5px] font-semibold text-[var(--bh-text-muted)] tracking-[0.06em] uppercase mt-0.5">
                WhatsApp API
              </span>
            </div>
          </Link>
          <span className="badge badge-cyan text-[9px] font-mono font-bold py-0.5 px-2">
            v21.0
          </span>
        </div>

        {/* Shop Balance Card (Merchant View) */}
        {shop && (
          <div className="mx-3 mt-3 p-4 rounded-2xl shrink-0 bg-[#0071e3] shadow-[0_4px_14px_rgba(0,113,227,0.25)]">
            <div className="flex items-center justify-between text-xs mb-2 relative">
              <span className="truncate max-w-[130px] font-semibold text-white/75 text-[11px]">
                {shop.businessName}
              </span>
              <Link
                href="/wallet"
                className="text-[9px] uppercase tracking-[0.1em] font-bold text-white/80 hover:text-white transition-colors"
              >
                Recharge →
              </Link>
            </div>
            <div className="flex items-baseline justify-between mt-1 relative">
              <div className="text-[24px] font-[700] tracking-[-0.02em] text-white tabular-nums leading-none" style={{ fontFamily: 'var(--font-display)' }}>
                {formatPaise(shop.walletBalancePaise)}
              </div>
              <div className="flex items-center gap-1 text-[9px] text-white/80 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-white/90 animate-pulse" />
                <span>Live</span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {isAdmin && !shop ? (
            <>
              <div className="type-micro text-[var(--bh-text-muted)] px-3 mb-2 mt-1">
                Platform Admin
              </div>
              {adminNav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3.5 h-[40px] rounded-xl text-[13px] font-medium transition-all duration-200 active:scale-[0.97]',
                      active
                        ? 'bh-nav-active'
                        : 'text-[var(--bh-text-secondary)] hover:text-[#1d1d1f] hover:bg-black/[0.03]'
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </>
          ) : (
            <>
              <div className="type-micro text-[var(--bh-text-muted)] px-3 mb-2 mt-1">
                WORKSPACE
              </div>
              {shopNav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center gap-3 px-3.5 h-[40px] rounded-xl text-[13px] font-medium transition-all duration-200 active:scale-[0.97]',
                      active
                        ? 'bh-nav-active'
                        : 'text-[var(--bh-text-secondary)] hover:text-[#1d1d1f] hover:bg-black/[0.03] hover:translate-x-0.5'
                    )}
                  >
                    <item.icon
                      className={cn(
                        'w-4 h-4 shrink-0 transition-transform duration-200',
                        !active && 'group-hover:scale-110'
                      )}
                    />
                    <span className="flex-1">{item.label}</span>
                    {active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--bh-accent)] shadow-[0_2px_10px_rgba(0,113,227,0.2)]" />
                    )}
                  </Link>
                );
              })}

              {isAdmin && (
                <>
                  <div className="type-micro text-[var(--bh-text-muted)] px-3 mt-5 mb-2">
                    ADMINISTRATION
                  </div>
                  {adminNav.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'group flex items-center gap-3 px-3.5 h-[40px] rounded-xl text-[13px] font-medium transition-all duration-200 active:scale-[0.97]',
                          active
                            ? 'bh-nav-active'
                            : 'text-[var(--bh-text-secondary)] hover:text-[#1d1d1f] hover:bg-black/[0.03] hover:translate-x-0.5'
                        )}
                      >
                        <item.icon
                          className={cn(
                            'w-4 h-4 shrink-0 transition-transform duration-200',
                            !active && 'group-hover:scale-110'
                          )}
                        />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </>
              )}
            </>
          )}
        </nav>

        {/* User Session Footer */}
        <div className="px-3 py-3 border-t border-black/[0.08] shrink-0">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-black/[0.03] border border-black/[0.06] transition-colors duration-200 hover:border-black/[0.1]">
            {/* Avatar with glow ring */}
            <div className="relative w-8 h-8 shrink-0">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[var(--bh-accent)]/20 to-[var(--bh-indigo)]/25 animate-pulse-glow" style={{ animationDuration: '4s' }} />
              <div className="relative w-8 h-8 rounded-full bg-gradient-to-br from-[var(--bh-accent)]/15 to-[var(--bh-indigo)]/25 border border-[var(--bh-accent)]/30 flex items-center justify-center text-[11px] font-bold text-[var(--bh-accent)]">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-semibold truncate text-[#1d1d1f] leading-tight">
                {user?.name}
              </div>
              <div className="text-[10px] text-[var(--bh-text-muted)] truncate leading-tight">
                {user?.email}
              </div>
            </div>
            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-[var(--bh-text-muted)] hover:text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer border-0 bg-transparent"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ═══ Main Workspace Canvas ═════════════════════════ */}
      <div className="flex-1 h-full min-w-0 flex flex-col gap-2.5 md:gap-3.5 overflow-hidden relative z-10">
        {/* ═══ Top Header Toolbar ═════════════════ */}
        <header className="bh-glass-toolbar flex items-center justify-between px-5 md:px-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[16px] md:text-[18px] font-[750] text-[#1d1d1f] tracking-[-0.02em] truncate leading-tight">
                  {currentRouteInfo.title}
                </h1>
                <span className="hidden sm:inline-block type-micro text-[var(--bh-text-muted)] bg-black/[0.04] px-1.5 py-0.5 rounded">
                  {currentRouteInfo.category}
                </span>
              </div>
              <p className="text-[11px] text-[var(--bh-text-muted)] hidden sm:block truncate mt-0.5">
                {currentRouteInfo.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {shop && (
              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-600 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Meta Cloud API</span>
              </div>
            )}
            
            <Link
              href="/wallet"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/[0.04] border border-black/[0.08] hover:border-[var(--bh-accent)]/40 hover:bg-[var(--bh-accent)]/8 text-xs font-semibold text-[#1d1d1f] transition-all duration-200 shadow-sm"
              title="View wallet & ledger"
            >
              <Wallet className="w-3.5 h-3.5 text-[var(--bh-accent)]" />
              <span className="tabular-nums font-mono text-[var(--bh-accent-bright)]">
                {shop ? formatPaise(shop.walletBalancePaise) : 'Admin'}
              </span>
            </Link>
          </div>
        </header>

        {/* ═══ Primary Workspace Content Canvas ═════════════ */}
        <main className="flex-1 h-full min-h-0 overflow-hidden bh-content-plane flex flex-col relative">
          {children}
        </main>
      </div>

      {/* ═══ Mobile Bottom Nav (Small screens) ═════════ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--bh-bg-base)]/92 backdrop-blur-2xl border-t border-black/[0.08] flex items-center justify-around px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {(isAdmin && !shop ? adminNav : shopNav).map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-semibold transition-all duration-200',
                active
                  ? 'text-[var(--bh-accent)] bg-[var(--bh-accent)]/10'
                  : 'text-[var(--bh-text-muted)] hover:text-[#1d1d1f] active:scale-95'
              )}
            >
              <item.icon className={cn('w-[18px] h-[18px] transition-transform duration-200', active && 'scale-110')} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
