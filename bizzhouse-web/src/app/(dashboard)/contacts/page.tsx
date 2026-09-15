'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { contactsApi } from '@/lib/api';
import { formatPhone, getInitials, relativeTime, cn, getErrorMessage } from '@/lib/utils';
import {
  Users,
  Search,
  Plus,
  Tag,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  MessageSquare,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface CsvRow {
  waId: string;
  name?: string;
  tags?: string[];
}

/** Parse a CSV string into contact rows. Expects columns: phone/waId, name, tags */
function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];

  // Detect header row
  const headerLine = lines[0].toLowerCase();
  const hasHeader = headerLine.includes('phone') || headerLine.includes('waid') || headerLine.includes('name');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  // Detect column indices from header (or default: col0=phone, col1=name, col2=tags)
  let phoneIdx = 0, nameIdx = 1, tagsIdx = 2;
  if (hasHeader) {
    const cols = lines[0].split(',').map(c => c.trim().toLowerCase().replace(/["']/g, ''));
    phoneIdx = cols.findIndex(c => c === 'phone' || c === 'waid' || c === 'wa_id' || c === 'number');
    nameIdx = cols.findIndex(c => c === 'name' || c === 'contact_name');
    tagsIdx = cols.findIndex(c => c === 'tags' || c === 'segments' || c === 'labels');
    if (phoneIdx === -1) phoneIdx = 0;
    if (nameIdx === -1) nameIdx = 1;
    if (tagsIdx === -1) tagsIdx = 2;
  }

  const rows: CsvRow[] = [];
  for (const line of dataLines) {
    // Naive CSV split (handles quoted fields simply)
    const parts = line.match(/("[^"]*"|[^,]*)(?:,|$)/g)?.map(p =>
      p.replace(/,$/,'').replace(/^"|"$/g, '').trim()
    ) || line.split(',').map(s => s.trim());

    const phone = (parts[phoneIdx] || '').replace(/\D/g, '');
    if (phone.length < 10) continue;

    const name = parts[nameIdx] || undefined;
    const tagsStr = parts[tagsIdx] || '';
    const tags = tagsStr ? tagsStr.split(/[;|]/).map(t => t.trim()).filter(Boolean) : undefined;

    rows.push({ waId: phone, name, tags });
  }
  return rows;
}

interface Contact {
  id: string;
  waId: string;
  name: string | null;
  optedIn: boolean;
  tags: string[];
  createdAt: string;
}

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newContact, setNewContact] = useState({ waId: '', name: '', tags: '' });
  const [adding, setAdding] = useState(false);
  // CSV import
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [csvOptInConfirmed, setCsvOptInConfirmed] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; skipped: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const loadContacts = useCallback(async (p: number, search?: string) => {
    setLoading(true);
    try {
      const { data } = await contactsApi.list(p, 20, search);
      setContacts(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setPage(p);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContacts(1);
  }, [loadContacts]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadContacts(1, searchQuery || undefined);
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery, loadContacts]);

  const handleAddContact = async () => {
    if (!newContact.waId.trim()) return;
    setAdding(true);
    try {
      const waId = newContact.waId.replace(/\D/g, '');
      await contactsApi.create({
        waId,
        name: newContact.name || undefined,
        tags: newContact.tags
          ? newContact.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
      });
      toast.success('Contact added to audience list');
      setShowAddModal(false);
      setNewContact({ waId: '', name: '', tags: '' });
      loadContacts(1);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to add contact'));
    } finally {
      setAdding(false);
    }
  };

  const toggleOptIn = async (contact: Contact) => {
    try {
      await contactsApi.update(contact.id, { optedIn: !contact.optedIn });
      setContacts((prev) =>
        prev.map((c) => (c.id === contact.id ? { ...c, optedIn: !c.optedIn } : c))
      );
      toast.success(contact.optedIn ? 'Opt-in revoked' : 'Contact opted in for broadcasts');
    } catch {
      toast.error('Failed to update opt-in status');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10 space-y-8 select-none animate-fade-in">
      {/* â”€â”€â”€ 140â€“156 px Page Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="min-h-[144px] flex flex-col justify-center border-b border-[var(--bh-hairline)] pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="type-overline text-[var(--bh-text-muted)]">
              AUDIENCE & CONSENT MANAGEMENT
            </div>
            <h1 className="type-page-title text-[#1d1d1f]">Contacts & Opt-ins</h1>
            <p className="type-body text-[var(--bh-text-secondary)] max-w-2xl">
              Manage saved customer segments, WhatsApp marketing consent records, and phone numbers.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0 self-start md:self-auto">
            <button
              onClick={() => { setShowImportModal(true); setCsvRows([]); setImportResult(null); setCsvOptInConfirmed(false); }}
              className="bh-btn-secondary h-12 px-5 text-sm flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Import CSV</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="bh-btn-primary h-12 px-6 text-sm flex items-center gap-2 cursor-pointer shadow-[0_2px_10px_rgba(0,113,227,0.2)]"
            >
              <Plus className="w-4.5 h-4.5" />
              <span>Add Contact</span>
            </button>
          </div>
        </div>
      </div>

      {/* â”€â”€â”€ Search Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--bh-text-muted)]" />
        <input
          type="text"
          placeholder="Search by name or phone number..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-11 pr-4 h-11 rounded-[14px] bg-[#f5f5f7] border border-[var(--bh-hairline)] text-sm text-[#1d1d1f] placeholder:text-[var(--bh-text-muted)] focus:border-[#0071e3] focus:outline-none"
        />
      </div>

      {/* â”€â”€â”€ Bounded Table Plane (60px Rows) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="bh-card-solid overflow-hidden border border-[var(--bh-hairline)] shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
        <div className="p-6 border-b border-[var(--bh-hairline)] flex items-center justify-between bg-[#f5f5f7]">
          <div>
            <h2 className="type-section-title text-xl text-[#1d1d1f]">Customer Directory</h2>
            <p className="type-table text-[var(--bh-text-muted)] mt-1">
              Verified phone numbers and marketing opt-in consent status
            </p>
          </div>
          <span className="type-label font-bold tabular-nums">
            {total} contacts
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-7 h-7 text-[#0071e3] animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <Users className="w-12 h-12 text-[var(--bh-text-muted)] mb-3 opacity-30" />
            <p className="type-ui font-semibold text-[#1d1d1f]">No contacts found</p>
            <p className="type-label text-[var(--bh-text-muted)] mt-1 mb-4">
              Add your first opted-in contact to start broadcast selling.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="bh-btn-secondary h-9 text-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Contact
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--bh-hairline)] text-[12px] font-semibold text-[var(--bh-text-muted)] uppercase tracking-wider bg-[#fafafa]">
                  <th className="py-4 px-6">Contact Name</th>
                  <th className="py-4 px-5">Phone Number</th>
                  <th className="py-4 px-5">Broadcast Opt-in</th>
                  <th className="py-4 px-5">Segments</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--bh-hairline)]">
                {contacts.map((contact) => (
                  <tr key={contact.id} className="bh-table-row">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1C2C3E] to-[#0F1824] border border-black/[0.08] flex items-center justify-center text-xs font-bold text-[#0077ed] shrink-0">
                          {getInitials(contact.name || contact.waId.slice(-4))}
                        </div>
                        <span className="type-ui font-semibold text-[#1d1d1f] truncate">
                          {contact.name || 'Anonymous Customer'}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-5 type-table font-mono text-[var(--bh-text-secondary)] tabular-nums">
                      {formatPhone(contact.waId)}
                    </td>
                    <td className="py-4 px-5">
                      <button
                        onClick={() => toggleOptIn(contact)}
                        className="cursor-pointer border-0 bg-transparent"
                      >
                        <span
                          className={`badge ${
                            contact.optedIn ? 'badge-green' : 'badge-red'
                          }`}
                        >
                          {contact.optedIn ? 'OPTED IN' : 'NO CONSENT'}
                        </span>
                      </button>
                    </td>
                    <td className="py-4 px-5">
                      <div className="flex flex-wrap gap-1.5">
                        {contact.tags?.length > 0 ? (
                          contact.tags.map((tag, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-[6px] bg-[#f5f5f7] border border-[var(--bh-hairline)] text-[11px] text-[var(--bh-text-secondary)] font-mono"
                            >
                              {tag}
                            </span>
                          ))
                        ) : (
                          <span className="type-label text-[var(--bh-text-muted)]">â€”</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => router.push('/inbox')}
                        className="p-2 rounded-[10px] bg-[#f5f5f7] border border-[var(--bh-hairline)] hover:border-[var(--bh-hairline-strong)] text-[var(--bh-text-secondary)] hover:text-[#1d1d1f] transition-colors cursor-pointer"
                        title="Chat on WhatsApp"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-[var(--bh-hairline)] flex items-center justify-between bg-[#f5f5f7]">
            <span className="type-label text-[var(--bh-text-muted)]">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => loadContacts(page - 1)}
                disabled={page <= 1}
                className="p-2 rounded-[10px] bg-[#f5f5f7] border border-[var(--bh-hairline)] hover:border-[var(--bh-hairline-strong)] disabled:opacity-30 cursor-pointer text-[#1d1d1f]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => loadContacts(page + 1)}
                disabled={page >= totalPages}
                className="p-2 rounded-[10px] bg-[#f5f5f7] border border-[var(--bh-hairline)] hover:border-[var(--bh-hairline-strong)] disabled:opacity-30 cursor-pointer text-[#1d1d1f]"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* â”€â”€â”€ Add Contact Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <div className="bh-card-solid w-full max-w-md p-8 relative overflow-hidden border border-black/[0.08] shadow-[0_24px_64px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--bh-hairline)] mb-6">
              <div>
                <div className="type-overline text-[#0077ed] mb-1">
                  NEW AUDIENCE ENTRY
                </div>
                <h3 className="type-section-title text-[#1d1d1f]">Add Contact</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[var(--bh-text-muted)] hover:text-[#1d1d1f] transition-colors cursor-pointer border-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="type-ui text-[var(--bh-text-secondary)] block mb-1.5 font-medium">
                  WhatsApp Phone Number (with Country Code)
                </label>
                <input
                  type="tel"
                  placeholder="919876543210"
                  value={newContact.waId}
                  onChange={(e) => setNewContact({ ...newContact, waId: e.target.value })}
                  className="bh-input w-full font-mono text-sm"
                  autoFocus
                />
              </div>

              <div>
                <label className="type-ui text-[var(--bh-text-secondary)] block mb-1.5 font-medium">
                  Contact Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Priya Sharma"
                  value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  className="bh-input w-full text-sm"
                />
              </div>

              <div>
                <label className="type-ui text-[var(--bh-text-secondary)] block mb-1.5 font-medium">
                  Segment Tags (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="vip, repeat, diwali"
                  value={newContact.tags}
                  onChange={(e) => setNewContact({ ...newContact, tags: e.target.value })}
                  className="bh-input w-full text-sm"
                />
              </div>

              <div className="p-3.5 rounded-[12px] bg-[#f5f5f7] border border-[var(--bh-hairline)] type-label text-[var(--bh-text-muted)]">
                ðŸ›¡ï¸ Ensure customer has explicitly opted in to receive WhatsApp Business notifications from your brand.
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="bh-btn-secondary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddContact}
                  disabled={adding || !newContact.waId}
                  className="bh-btn-primary flex items-center gap-2 cursor-pointer shadow-[0_2px_10px_rgba(0,113,227,0.2)]"
                >
                  {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>Save Contact</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── CSV Import Modal ─────────────────────────────────────── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
          <div className="bh-card-solid w-full max-w-2xl p-8 relative overflow-hidden border border-black/[0.08] shadow-[0_24px_64px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--bh-hairline)] mb-6">
              <div>
                <div className="type-overline text-[#0077ed] mb-1">
                  BULK AUDIENCE IMPORT
                </div>
                <h3 className="type-section-title text-[#1d1d1f]">Import Contacts from CSV</h3>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-[var(--bh-text-muted)] hover:text-[#1d1d1f] transition-colors cursor-pointer border-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* File upload zone */}
            {csvRows.length === 0 && !importResult && (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const text = ev.target?.result as string;
                      const rows = parseCsv(text);
                      setCsvRows(rows);
                      if (rows.length === 0) toast.error('No valid contacts found in file');
                    };
                    reader.readAsText(file);
                  }
                }}
                className={cn(
                  'border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200',
                  dragOver
                    ? 'border-[#0071e3]/70 bg-[#0071e3]/5'
                    : 'border-black/[0.1] hover:border-white/[0.25]'
                )}
              >
                <FileSpreadsheet className="w-10 h-10 mx-auto text-[#86868b] mb-4" />
                <p className="type-ui font-semibold text-[#1d1d1f] mb-1">
                  Drop your CSV file here
                </p>
                <p className="type-label text-[var(--bh-text-muted)] mb-4">
                  or click to browse. Expects columns: <span className="font-mono text-[#0077ed]">phone</span>, <span className="font-mono text-[#0077ed]">name</span>, <span className="font-mono text-[#0077ed]">tags</span>
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="bh-btn-secondary h-9 px-4 text-xs cursor-pointer"
                >
                  Browse Files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        const text = ev.target?.result as string;
                        const rows = parseCsv(text);
                        setCsvRows(rows);
                        if (rows.length === 0) toast.error('No valid contacts found in file');
                      };
                      reader.readAsText(file);
                    }
                    e.target.value = '';
                  }}
                />
              </div>
            )}

            {/* Preview table */}
            {csvRows.length > 0 && !importResult && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="type-ui font-semibold text-[#1d1d1f]">
                    {csvRows.length} contacts parsed
                  </span>
                  <button
                    type="button"
                    onClick={() => setCsvRows([])}
                    className="text-xs text-[#86868b] hover:text-[#1d1d1f] transition-colors cursor-pointer bg-transparent border-0"
                  >
                    ← Choose different file
                  </button>
                </div>

                <div className="max-h-[280px] overflow-y-auto rounded-xl border border-[var(--bh-hairline)]">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--bh-hairline)] text-[11px] font-semibold text-[var(--bh-text-muted)] uppercase tracking-wider bg-[#fafafa] sticky top-0">
                        <th className="py-2.5 px-4">#</th>
                        <th className="py-2.5 px-4">Phone</th>
                        <th className="py-2.5 px-4">Name</th>
                        <th className="py-2.5 px-4">Tags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--bh-hairline)]">
                      {csvRows.slice(0, 50).map((row, i) => (
                        <tr key={i} className="text-xs">
                          <td className="py-2 px-4 text-[#86868b] font-mono">{i + 1}</td>
                          <td className="py-2 px-4 font-mono text-[var(--bh-text-secondary)]">{formatPhone(row.waId)}</td>
                          <td className="py-2 px-4 text-[#1d1d1f]">{row.name || '—'}</td>
                          <td className="py-2 px-4">
                            <div className="flex flex-wrap gap-1">
                              {row.tags?.map((t, j) => (
                                <span key={j} className="px-1.5 py-0.5 rounded bg-[#f5f5f7] border border-[var(--bh-hairline)] text-[10px] text-[#86868b] font-mono">{t}</span>
                              )) || <span className="text-[#86868b]">—</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {csvRows.length > 50 && (
                    <div className="text-center text-[11px] text-[#86868b] py-2 bg-[#fafafa] border-t border-[var(--bh-hairline)]">
                      … and {csvRows.length - 50} more rows
                    </div>
                  )}
                </div>

                {csvRows.length > 5000 && (
                  <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/25 p-3 rounded-xl">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    Maximum 5,000 contacts per batch. Only the first 5,000 will be imported.
                  </div>
                )}

                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#0071e3]/[0.05] border border-[#0071e3]/25 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={csvOptInConfirmed}
                    onChange={(e) => setCsvOptInConfirmed(e.target.checked)}
                    className="mt-0.5 accent-[#0071e3]"
                  />
                  <span className="text-[11px] text-[#6e6e73] leading-relaxed">
                    I confirm these contacts have <span className="font-semibold text-[#1d1d1f]">opted in</span> to
                    receive WhatsApp messages from my business. Meta policy requires recorded
                    opt-in consent before sending — violations can get the number restricted.
                  </span>
                </label>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowImportModal(false)}
                    className="bh-btn-secondary flex-1 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      setImporting(true);
                      try {
                        const batch = csvRows.slice(0, 5000);
                        const { data } = await contactsApi.import(batch);
                        setImportResult(data);
                        toast.success(`Import complete: ${data.created} created, ${data.updated} updated`);
                        loadContacts(1);
                      } catch (err) {
                        toast.error(getErrorMessage(err, 'Import failed'));
                      } finally {
                        setImporting(false);
                      }
                    }}
                    disabled={importing || !csvOptInConfirmed}
                    className="bh-btn-primary flex-1 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {importing ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /><span>Importing…</span></>
                    ) : (
                      <><Upload className="w-4 h-4" /><span>Import {Math.min(csvRows.length, 5000)} Contacts</span></>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Import results */}
            {importResult && (
              <div className="space-y-5 text-center animate-fade-in">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600" />
                </div>
                <div>
                  <h3 className="type-h2 text-emerald-600 mb-1">Import Complete</h3>
                  <p className="type-small text-[var(--bh-text-secondary)]">Your audience list has been updated.</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-lg font-bold text-emerald-600 tabular-nums">{importResult.created}</div>
                    <div className="type-label text-[#86868b]">Created</div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#0071e3]/8 border border-[#0071e3]/25">
                    <div className="text-lg font-bold text-[#0077ed] tabular-nums">{importResult.updated}</div>
                    <div className="type-label text-[#86868b]">Updated</div>
                  </div>
                  <div className="p-3 rounded-xl bg-black/[0.03] border border-black/[0.08]">
                    <div className="text-lg font-bold text-[#86868b] tabular-nums">{importResult.skipped}</div>
                    <div className="type-label text-[#86868b]">Skipped</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="bh-btn-primary h-10 px-6 text-sm cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
