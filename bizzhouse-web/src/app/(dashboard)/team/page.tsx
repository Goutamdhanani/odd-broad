'use client';

import { useCallback, useEffect, useState } from 'react';
import { teamApi } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { Users, UserPlus, Loader2, Trash2, X, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invited, setInvited] = useState<{ name: string; password: string } | null>(null);

  // Invite form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await teamApi.list();
      setMembers(data.data || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Only the shop owner can manage the team'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await teamApi.invite({ email, password, name });
      setInvited({ name: data.name, password });
      setName('');
      setEmail('');
      setPassword('');
      load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not invite the team member'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (member: TeamMember) => {
    try {
      await teamApi.remove(member.id);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      toast.success(`${member.name} removed from the team`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not remove the team member'));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 md:p-6 lg:p-8 space-y-6 select-none animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-black/[0.08]">
        <div>
          <div className="text-[10px] font-bold tracking-wider uppercase text-[#86868b]">
            YOUR TEAM
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#1d1d1f] mt-0.5">
            Team Members
          </h1>
          <p className="text-xs text-[#86868b] mt-0.5">
            Agents can sign in and work the shop inbox. Only the owner manages the team.
          </p>
        </div>
        <button
          onClick={() => {
            setShowInvite(true);
            setInvited(null);
          }}
          className="bh-btn-primary h-9 px-4 text-xs flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>Invite Agent</span>
        </button>
      </div>

      {loading ? (
        <div className="p-12 flex items-center justify-center text-[#86868b]">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {members.map((m) => (
            <div
              key={m.id}
              className="p-4.5 rounded-xl bg-white border border-black/[0.08] shadow-[0_1px_2px_rgba(0,0,0,0.04)] flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-[#0071e3]/10 border border-[#0071e3]/20 flex items-center justify-center text-[13px] font-bold text-[#0071e3] shrink-0">
                {m.name?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[#1d1d1f]">{m.name}</span>
                  <span
                    className={cn(
                      'badge text-[10px]',
                      m.role === 'shop_owner' ? 'badge-cyan' : 'bg-black/[0.05] text-[#6e6e73]',
                    )}
                  >
                    {m.role === 'shop_owner' ? (
                      <>
                        <Crown className="w-3 h-3" /> Owner
                      </>
                    ) : (
                      'Agent'
                    )}
                  </span>
                </div>
                <div className="text-[11px] text-[#86868b]">{m.email}</div>
              </div>
              {m.role !== 'shop_owner' && (
                <button
                  onClick={() => handleRemove(m)}
                  className="p-2 rounded-lg text-[#86868b] hover:text-red-600 hover:bg-red-500/10 transition-colors cursor-pointer"
                  title="Remove from team"
                  aria-label={`Remove ${m.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <div className="p-10 rounded-xl border border-black/[0.08] bg-white text-center text-sm text-[#86868b]">
              <Users className="w-7 h-7 mx-auto mb-2" />
              Invite your first agent to share the inbox.
            </div>
          )}
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-white border border-black/[0.1] shadow-[0_24px_64px_rgba(0,0,0,0.16)] space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06]">
              <h3 className="text-base font-bold text-[#1d1d1f]">Invite Team Member</h3>
              <button
                onClick={() => setShowInvite(false)}
                className="p-1.5 rounded-lg text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.05] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {invited ? (
              <div className="space-y-3 text-center">
                <div className="text-sm font-semibold text-emerald-600">
                  {invited.name} invited!
                </div>
                <p className="text-xs text-[#6e6e73]">
                  Share this one-time password — they will sign in with their email:
                </p>
                <div className="p-3 rounded-xl bg-black/[0.03] border border-black/[0.08] font-mono text-sm select-all">
                  {invited.password}
                </div>
                <button
                  onClick={() => setShowInvite(false)}
                  className="bh-btn-primary w-full cursor-pointer"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-3.5">
                <div>
                  <label className="text-[11px] font-medium text-[#6e6e73] block mb-1">Name</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="bh-input w-full"
                    placeholder="Priya Sharma"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#6e6e73] block mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bh-input w-full"
                    placeholder="priya@yourshop.com"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-[#6e6e73] block mb-1">
                    Temporary password
                  </label>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="bh-input w-full font-mono"
                    placeholder="min 8 chars, letter + number"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="bh-btn-primary w-full cursor-pointer disabled:opacity-60"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  <span>{saving ? 'Inviting…' : 'Send invite'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
