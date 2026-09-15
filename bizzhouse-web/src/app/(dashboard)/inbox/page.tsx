'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { messagesApi, contactsApi, templatesApi, teamApi, OutboundMediaUpload } from '@/lib/api';
import { normalizeMessageContent } from '@/lib/normalize';
import { MessageContent } from '@/components/messages/MessageContent';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/hooks/useAuth';
import { formatPhone, relativeTime, getInitials, cn, getErrorMessage } from '@/lib/utils';
import {
  Search,
  Send,
  Paperclip,
  Check,
  CheckCheck,
  Loader2,
  MessageSquare,
  Plus,
  Phone,
  ArrowLeft,
  X,
  Sparkles,
  ShieldCheck,
  Clock,
  Smile,
  Zap,
  FileText,
  ImageIcon,
  Film,
  Music,
} from 'lucide-react';
import { toast } from 'sonner';

interface Contact {
  id: string;
  waId: string;
  name: string | null;
  optedIn: boolean;
  tags: string[];
  sessionOpen?: boolean;
  assignedUserId?: string | null;
}

interface MessageItem {
  id: string;
  direction: 'inbound' | 'outbound';
  messageType: string;
  status: string;
  payload: {
    body?: string;
    caption?: string;
    mediaUrl?: string;
    filename?: string;
    failureReason?: { code?: number | null; title?: string } | null;
  } | null;
  createdAt: string;
  gupshupMessageId?: string;
}

interface Conversation {
  contact: Contact;
  lastMessage: MessageItem | null;
  unreadCount: number;
}

/** An attachment staged in the composer, ready to send. */
interface PendingAttachment {
  file: File;
  type: 'image' | 'video' | 'document' | 'audio';
  upload?: OutboundMediaUpload;
  uploading: boolean;
}

const quickTemplates = [
  'Namaste! Welcome to BizzHouse support. How may we assist you today?',
  'Your order has been confirmed and is being processed for dispatch.',
  'Thanks for reaching out! A dedicated customer stylist will connect shortly.',
  'Please share your 6-digit pin code to verify delivery availability.',
];

function mediaTypeOf(file: File): PendingAttachment['type'] | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('application/') || file.type === 'text/plain') return 'document';
  return null;
}

export default function InboxPage() {
  const { shop } = useAuthStore();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'unread'>('all');
  const [showNewChat, setShowNewChat] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [team, setTeam] = useState<Array<{ id: string; name: string }>>([]);
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [waTemplates, setWaTemplates] = useState<Array<{ elementName: string; body: string }>>([]);
  const [waTemplateSel, setWaTemplateSel] = useState('');
  const [waTemplateVars, setWaTemplateVars] = useState<string[]>([]);
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [newChatPhone, setNewChatPhone] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const { data } = await messagesApi.getConversations();
      setConversations(data.data || []);
      if (!activeContact && data.data?.length > 0) {
        setActiveContact(data.data[0].contact);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [activeContact]);

  useEffect(() => {
    loadConversations();
    teamApi
      .list()
      .then(({ data }: { data: { data?: Array<{ id: string; name: string }> } }) =>
        setTeam((data.data || []).map((m) => ({ id: m.id, name: m.name }))),
      )
      .catch(() => {});
    templatesApi
      .list()
      .then(({ data }) => {
        const rows: Array<{ elementName: string; body: string; status: string }> = Array.isArray(
          data,
        )
          ? data
          : data?.data || [];
        setWaTemplates(
          rows
            .filter((t) => t.status === 'APPROVED')
            .map((t) => ({ elementName: t.elementName, body: t.body })),
        );
      })
      .catch(() => {});
  }, [loadConversations]);

  // Load messages for active contact
  const loadMessages = useCallback(async (contactId: string) => {
    setLoadingMessages(true);
    try {
      const { data } = await messagesApi.getConversation(contactId);
      setMessages(data.messages || []);
    } catch {
      toast.error('Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (activeContact) {
      loadMessages(activeContact.id);
    }
  }, [activeContact, loadMessages]);

  // WebSocket for real-time messages
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNewMessage = (data: { message: MessageItem; contact: Contact }) => {
      if (activeContact && data.contact?.id === activeContact.id) {
        setMessages((prev) => {
          const exists = prev.some(
            (m) =>
              m.id === data.message.id ||
              (m.gupshupMessageId && m.gupshupMessageId === data.message.gupshupMessageId)
          );
          if (exists) return prev;
          return [...prev, data.message];
        });
      }

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.contact.id === data.contact.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            lastMessage: data.message,
            unreadCount:
              activeContact?.id === data.contact.id
                ? 0
                : (updated[idx].unreadCount || 0) + (data.message.direction === 'inbound' ? 1 : 0),
          };
          const [moved] = updated.splice(idx, 1);
          return [moved, ...updated];
        } else {
          return [
            {
              contact: data.contact,
              lastMessage: data.message,
              unreadCount: data.message.direction === 'inbound' ? 1 : 0,
            },
            ...prev,
          ];
        }
      });
    };

    const handleStatusUpdate = (data: {
      messageId: string;
      status: string;
      gupshupMessageId?: string;
      failureReason?: { code?: number; title?: string } | null;
    }) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (
            m.id === data.messageId ||
            (data.gupshupMessageId && m.gupshupMessageId === data.gupshupMessageId)
          ) {
            return {
              ...m,
              status: data.status,
              payload: {
                ...m.payload,
                failureReason: data.failureReason ?? m.payload?.failureReason ?? null,
              },
            };
          }
          return m;
        })
      );
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:status', handleStatusUpdate);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:status', handleStatusUpdate);
    };
  }, [activeContact]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message (text, or the staged attachment)
  const handleSend = async (overrideText?: string) => {
    const textToSend = (overrideText || messageText).trim();
    const att = attachment;
    if ((!textToSend && !att) || !activeContact || sending) return;
    if (att && (att.uploading || !att.upload)) {
      toast.error('Attachment is still uploading');
      return;
    }

    setMessageText('');
    setShowQuickReplies(false);
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: MessageItem = att?.upload
      ? {
          id: tempId,
          direction: 'outbound',
          messageType: att.type,
          status: 'sending',
          payload: {
            mediaUrl: att.upload.url,
            caption: textToSend || undefined,
            filename: att.upload.filename,
          },
          createdAt: new Date().toISOString(),
        }
      : {
          id: tempId,
          direction: 'outbound',
          messageType: 'text',
          status: 'sending',
          payload: { body: textToSend },
          createdAt: new Date().toISOString(),
        };
    setMessages((prev) => [...prev, optimisticMsg]);
    if (att) setAttachment(null);

    try {
      const { data } = att?.upload
        ? await messagesApi.send({
            contactWaId: activeContact.waId,
            type: att.type,
            mediaId: att.upload.mediaId,
            mediaPreviewUrl: att.upload.url,
            caption: textToSend || undefined,
            filename: att.type === 'document' ? att.upload.filename : undefined,
            contactName: activeContact.name || undefined,
          })
        : await messagesApi.send({
            contactWaId: activeContact.waId,
            type: 'text',
            text: textToSend,
            contactName: activeContact.name || undefined,
          });
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...data, status: data.status || 'sent' } : m))
      );

      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.contact.id === activeContact.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], lastMessage: data };
          const [moved] = updated.splice(idx, 1);
          return [moved, ...updated];
        }
        return prev;
      });
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m))
      );
      // Give the attachment back so the shop can retry without re-uploading
      if (att?.upload) setAttachment(att);
      toast.error(getErrorMessage(err, 'Failed to deliver message'));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Stage an attachment: upload happens immediately (durable preview copy +
  // real Gupshup mediaIds) so the send itself is one quick API call.
  const handleAttach = async (file: File) => {
    const type = mediaTypeOf(file);
    if (!type) {
      toast.error('Send images, videos, audio or documents');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error('File exceeds the 100MB limit');
      return;
    }
    const staged: PendingAttachment = { file, type, uploading: true };
    setAttachment(staged);
    try {
      const upload = await messagesApi.uploadMedia(file);
      setAttachment({ ...staged, upload, uploading: false });
    } catch (err) {
      setAttachment(null);
      toast.error(getErrorMessage(err, 'Attachment upload failed'));
    }
  };

  // Start new chat
  const handleNewChat = async () => {
    if (!newChatPhone.trim()) {
      toast.error('Enter a phone number');
      return;
    }
    const cleanPhone = newChatPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      toast.error('Enter a valid phone number with country code (e.g. 919876543210)');
      return;
    }

    try {
      const { data } = await contactsApi.create({
        waId: cleanPhone,
        name: newChatName.trim() || undefined,
      });
      setShowNewChat(false);
      setNewChatPhone('');
      setNewChatName('');
      setActiveContact(data);
      setMobileShowChat(true);
      await loadConversations();
      toast.success(`Chat opened with ${data.name || data.waId}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to create contact'));
    }
  };

  const handleTemplateSend = async () => {
    const tpl = waTemplates.find((t) => t.elementName === waTemplateSel);
    if (!tpl || !activeContact || sendingTemplate) return;
    const varCount = new Set(tpl.body.match(/\{\{\d+\}\}/g) || []).size;
    if (varCount > 0 && waTemplateVars.filter((v) => v.trim()).length !== varCount) {
      toast.error(`Fill all ${varCount} template variables`);
      return;
    }

    setSendingTemplate(true);
    const tempId = `temp-${Date.now()}`;
    const preview = tpl.body.replace(/\{\{\d+\}\}/g, () => '*');
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        direction: 'outbound',
        messageType: 'template',
        status: 'sending',
        payload: { body: preview },
        createdAt: new Date().toISOString(),
      } as MessageItem,
    ]);

    try {
      const { data } = await messagesApi.send({
        contactWaId: activeContact.waId,
        type: 'template',
        templateName: tpl.elementName,
        templateValues: varCount > 0 ? waTemplateVars : undefined,
        contactName: activeContact.name || undefined,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...data, status: data.status || 'sent' } : m)),
      );
      setWaTemplateSel('');
      setWaTemplateVars([]);
      toast.success('Template message sent');
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, status: 'failed' } : m)));
      toast.error(getErrorMessage(err, 'Failed to send template'));
    } finally {
      setSendingTemplate(false);
    }
  };

  const handleAssign = async (userId: string | null) => {
    if (!activeContact) return;
    try {
      const { data } = await messagesApi.assign(activeContact.id, userId);
      setActiveContact((prev) =>
        prev ? { ...prev, assignedUserId: data.assignedUserId } : prev,
      );
      setConversations((prev) =>
        prev.map((c) =>
          c.contact.id === activeContact.id
            ? { ...c, contact: { ...c.contact, assignedUserId: data.assignedUserId } }
            : c,
        ),
      );
      toast.success(
        data.assignedUserId
          ? 'Conversation assigned'
          : 'Conversation unassigned',
      );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not assign the conversation'));
    }
  };

  const selectContact = (contact: Contact) => {
    setActiveContact(contact);
    setMobileShowChat(true);
    setConversations((prev) =>
      prev.map((c) => (c.contact.id === contact.id ? { ...c, unreadCount: 0 } : c))
    );
  };

  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'sending':
        return <Loader2 className="w-3 h-3 animate-spin text-[#86868b]" />;
      case 'sent':
        return <Check className="w-3.5 h-3.5 text-[#86868b]" />;
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-[#86868b]" />;
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-[#0071e3]" />;
      case 'failed':
        return <span className="text-[10px] text-rose-400 font-bold">Failed</span>;
      default:
        return null;
    }
  };

  const filteredConversations = conversations.filter((c) => {
    const matchesSearch =
      (!searchQuery ||
        c.contact.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.contact.waId.includes(searchQuery)) &&
      (!assignedToMe || c.contact.assignedUserId === useAuthStore.getState().user?.id);
    const matchesTab = filterTab === 'all' || (filterTab === 'unread' && c.unreadCount > 0);
    return matchesSearch && matchesTab;
  });

  return (
    <div className="flex-1 flex h-full w-full overflow-hidden bg-transparent select-none">
      {/* â”€â”€â”€ Left Pane: Conversation List (320px) â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div
        className={cn(
          'w-full md:w-[320px] lg:w-[340px] md:min-w-[320px] lg:min-w-[340px] border-r border-black/[0.08] flex flex-col bg-[#f5f5f7]/60 shrink-0',
          mobileShowChat ? 'hidden md:flex' : 'flex'
        )}
      >
        {/* Header */}
        <div className="h-[60px] flex items-center justify-between px-4 border-b border-black/[0.08] shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-bold tracking-tight text-[#1d1d1f]">Inbox</h2>
            <span className="text-[11px] font-medium text-[#86868b] bg-black/[0.04] px-2 py-0.5 rounded-full tabular-nums">
              {conversations.length}
            </span>
          </div>
          <button
            onClick={() => setShowNewChat(true)}
            className="h-7 px-2.5 rounded-lg bg-black/[0.04] hover:bg-white/[0.1] border border-black/[0.08] text-[#1d1d1f] flex items-center gap-1 text-[11px] font-semibold transition-all cursor-pointer"
            title="Start new conversation"
          >
            <Plus className="w-3.5 h-3.5 text-[#0071e3]" />
            <span>New</span>
          </button>
        </div>

        {/* Search & Tabs */}
        <div className="p-3 space-y-2 border-b border-black/[0.08] shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#86868b]" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 h-[34px] rounded-lg bg-black/[0.04] border border-black/[0.08] text-[12px] text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[rgba(56,189,248,0.55)] focus:bg-black/[0.05] focus:outline-none transition-all"
            />
          </div>

          <div className="flex gap-1">
            <button
              onClick={() => setAssignedToMe(!assignedToMe)}
              className={cn(
                'py-1 px-2 rounded-md text-[11px] font-semibold transition-all cursor-pointer',
                assignedToMe
                  ? 'bg-[#0071e3]/10 text-[#0071e3] border border-[#0071e3]/30'
                  : 'text-[#86868b] hover:text-[#1d1d1f] border border-transparent'
              )}
              title="Show only conversations assigned to me"
            >
              Mine
            </button>
            <button
              onClick={() => setFilterTab('all')}
              className={cn(
                'flex-1 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer',
                filterTab === 'all'
                  ? 'bg-black/[0.05] text-[#1d1d1f]'
                  : 'text-[#86868b] hover:text-[#1d1d1f]'
              )}
            >
              All Threads
            </button>
            <button
              onClick={() => setFilterTab('unread')}
              className={cn(
                'flex-1 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer',
                filterTab === 'unread'
                  ? 'bg-black/[0.05] text-[#1d1d1f]'
                  : 'text-[#86868b] hover:text-[#1d1d1f]'
              )}
            >
              Unread
            </button>
          </div>
        </div>

        {/* New Chat Modal Box */}
        {showNewChat && (
          <div className="p-3.5 border-b border-black/[0.08] bg-[#f5f5f7] space-y-2.5 animate-fade-in shrink-0">
            <div className="flex items-center justify-between text-xs font-semibold text-[#1d1d1f]">
              <span>Start WhatsApp Chat</span>
              <button
                onClick={() => {
                  setShowNewChat(false);
                  setNewChatPhone('');
                  setNewChatName('');
                }}
                className="text-[#86868b] hover:text-[#1d1d1f] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              type="tel"
              placeholder="Phone (e.g. 919876543210)"
              value={newChatPhone}
              onChange={(e) => setNewChatPhone(e.target.value)}
              className="w-full h-8 px-2.5 rounded-lg bg-black/40 border border-black/[0.08] text-xs text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[rgba(56,189,248,0.55)] focus:outline-none"
              autoFocus
            />
            <input
              type="text"
              placeholder="Name (optional)"
              value={newChatName}
              onChange={(e) => setNewChatName(e.target.value)}
              className="w-full h-8 px-2.5 rounded-lg bg-black/40 border border-black/[0.08] text-xs text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[rgba(56,189,248,0.55)] focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleNewChat}
                className="bh-btn-primary flex-1 h-7 text-xs cursor-pointer"
              >
                Open Chat
              </button>
              <button
                onClick={() => setShowNewChat(false)}
                className="bh-btn-secondary h-7 text-xs px-2.5 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto divide-y divide-black/[0.06]">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 text-[#0071e3] animate-spin" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <MessageSquare className="w-8 h-8 text-[#86868b] mb-2" />
              <p className="text-xs font-medium text-[#6e6e73]">No conversations</p>
              <p className="text-[11px] text-[#86868b] mt-1 max-w-[200px]">
                Inbound customer messages will appear here.
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = activeContact?.id === conv.contact.id;
              return (
                <button
                  key={conv.contact.id}
                  onClick={() => selectContact(conv.contact)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3.5 py-3 text-left transition-all duration-150 relative cursor-pointer border-0',
                    isSelected
                      ? 'bg-black/[0.05] text-[#1d1d1f]'
                      : 'hover:bg-white/[0.035] text-[#6e6e73] active:bg-black/[0.04]'
                  )}
                >
                  {isSelected && (
                    <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[#0071e3] shadow-[0_2px_10px_rgba(0,113,227,0.2)]" />
                  )}

                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#1E293B] to-[#0F172A] border border-white/[0.1] flex items-center justify-center text-[11px] font-bold text-[#0077ed]">
                      {getInitials(conv.contact.name || conv.contact.waId.slice(-4))}
                    </div>
                    {conv.unreadCount > 0 && !isSelected && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#0071e3] ring-2 ring-[#0B0E17]" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className={cn('text-[13px] truncate', isSelected ? 'font-bold text-[#1d1d1f]' : 'font-semibold text-[#1d1d1f]/90')}>
                        {conv.contact.name || formatPhone(conv.contact.waId)}
                      </span>
                      {conv.lastMessage && (
                        <span className="text-[10px] text-[#86868b] tabular-nums">
                          {relativeTime(conv.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-[11px] text-[#86868b] truncate flex items-center gap-1">
                        {conv.lastMessage?.direction === 'outbound' && (
                          <StatusIcon status={conv.lastMessage.status} />
                        )}
                        <span className="truncate">
                          {conv.lastMessage?.payload?.body ||
                            conv.lastMessage?.messageType ||
                            'Ready to chat'}
                        </span>
                      </p>
                      {conv.unreadCount > 0 && (
                        <span className="ml-1.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-[#0071e3] text-[#07080D] text-[10px] font-bold tabular-nums shrink-0 shadow-[0_2px_10px_rgba(0,113,227,0.2)]">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* â”€â”€â”€ Right Pane: Message Canvas â”€â”€â”€ */}
      <div
        className={cn(
          'flex-1 flex flex-col bg-[#f5f5f7] relative overflow-hidden',
          !mobileShowChat ? 'hidden md:flex' : 'flex'
        )}
      >
        {activeContact ? (
          <>
            {/* Active Contact Header */}
            <div className="h-[60px] flex items-center justify-between px-5 border-b border-black/[0.08] bg-black/[0.03] backdrop-blur-md shrink-0 z-10">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={() => setMobileShowChat(false)}
                  className="md:hidden p-1 rounded-md text-[#86868b] hover:text-[#1d1d1f] cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0C1B2A] to-[#0A1226] border border-[#0071e3]/30 flex items-center justify-center text-[11px] font-bold text-[#0071e3] shrink-0">
                  {getInitials(activeContact.name || activeContact.waId.slice(-4))}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold text-[#1d1d1f] truncate">
                      {activeContact.name || formatPhone(activeContact.waId)}
                    </span>
                    <ShieldCheck className="w-3.5 h-3.5 text-[#0071e3] shrink-0" />
                  </div>
                  <div className="text-[10px] text-[#86868b] truncate flex items-center gap-1.5">
                    <span>{formatPhone(activeContact.waId)}</span>
                    <span className="text-[#86868b]">·</span>
                    {activeContact.sessionOpen ? (
                      <span className="text-emerald-600 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Session open (free replies)
                      </span>
                    ) : (
                      <span className="text-amber-600/90 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Window closed — template only
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={activeContact.assignedUserId ?? ''}
                  onChange={(e) => handleAssign(e.target.value || null)}
                  disabled={team.length === 0}
                  className="h-7 px-2 rounded-lg bg-black/[0.04] border border-black/[0.08] text-[11px] text-[#1d1d1f] focus:outline-none cursor-pointer disabled:opacity-50"
                  title="Assign conversation"
                >
                  <option value="">Unassigned</option>
                  {team.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowQuickReplies(!showQuickReplies)}
                  className="h-7 px-2.5 rounded-lg bg-black/[0.04] hover:bg-black/[0.03] border border-black/[0.08] text-[#6e6e73] hover:text-[#1d1d1f] flex items-center gap-1.5 text-[11px] font-medium transition-all cursor-pointer"
                  title="Quick reply templates"
                >
                  <Zap className="w-3 h-3 text-[#0071e3]" />
                  <span className="hidden sm:inline">Quick Reply</span>
                </button>
              </div>
            </div>

            {/* Quick Replies Tray */}
            {showQuickReplies && (
              <div className="p-3 bg-white border-b border-black/[0.08] flex flex-wrap gap-1.5 animate-fade-in shrink-0">
                {quickTemplates.map((tpl, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(tpl)}
                    className="text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-black/[0.04] hover:bg-[#0071e3]/10 hover:border-[#0071e3]/40 border border-black/[0.08] text-slate-200 hover:text-[#1d1d1f] transition-all cursor-pointer truncate max-w-sm"
                  >
                    {tpl}
                  </button>
                ))}
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/[0.01] to-transparent">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 text-[#0071e3] animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <Clock className="w-7 h-7 text-[#86868b] mb-2" />
                  <p className="text-sm font-semibold text-[#1d1d1f]">No message history yet</p>
                  <p className="text-xs text-[#86868b] max-w-xs mt-1">
                    Send a direct WhatsApp message below to initiate the live session.
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isOutbound = msg.direction === 'outbound';
                  const content = normalizeMessageContent(msg.payload, msg.messageType);
                  return (
                    <div
                      key={msg.id}
                      className={cn('flex flex-col animate-bubble-in', isOutbound ? 'items-end' : 'items-start')}
                    >
                      <div
                        className={cn(
                          'max-w-[78%] lg:max-w-[62%] px-3.5 py-2.5 text-[13px] leading-relaxed',
                          isOutbound ? 'bh-bubble-out' : 'bh-bubble-in'
                        )}
                      >
                        <MessageContent content={content} />

                        {msg.status === 'failed' && msg.payload?.failureReason?.title && (
                          <div className="mt-1.5 p-2 rounded-lg bg-red-500/10 border border-red-400/30 text-[11px] text-red-100 leading-snug">
                            <span className="font-semibold">
                              {msg.payload.failureReason.code
                                ? `Error ${msg.payload.failureReason.code}: `
                                : ''}
                            </span>
                            {msg.payload.failureReason.title}
                          </div>
                        )}

                        <div
                          className={cn(
                            'flex items-center gap-1 mt-1.5 text-[10px] tabular-nums',
                            isOutbound ? 'justify-end text-white/75' : 'text-[#86868b]'
                          )}
                        >
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {isOutbound && <StatusIcon status={msg.status} />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Composer Bar */}
            {activeContact.sessionOpen ? (
              <div className="border-t border-black/[0.08] bg-black/[0.03] backdrop-blur-md shrink-0">
                {/* Staged attachment preview */}
                {attachment && (
                  <div className="px-4 md:px-5 pt-3 animate-fade-in">
                    <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-black/[0.08] max-w-md">
                      <div className="w-11 h-11 rounded-lg bg-[#0071e3]/10 border border-[#0071e3]/20 flex items-center justify-center shrink-0 overflow-hidden">
                        {attachment.uploading ? (
                          <Loader2 className="w-4 h-4 text-[#0071e3] animate-spin" />
                        ) : attachment.type === 'image' && attachment.upload ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={attachment.upload.url}
                            alt={attachment.file.name}
                            className="w-full h-full object-cover"
                          />
                        ) : attachment.type === 'video' ? (
                          <Film className="w-4 h-4 text-[#0071e3]" />
                        ) : attachment.type === 'audio' ? (
                          <Music className="w-4 h-4 text-[#0071e3]" />
                        ) : (
                          <FileText className="w-4 h-4 text-[#0071e3]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-[#1d1d1f] truncate">
                          {attachment.file.name}
                        </div>
                        <div className="text-[10px] text-[#86868b] flex items-center gap-1">
                          {attachment.uploading ? (
                            <>
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              Uploading to WhatsApp…
                            </>
                          ) : attachment.upload ? (
                            <>
                              <Check className="w-2.5 h-2.5 text-emerald-600" />
                              Ready ·{' '}
                              {(attachment.file.size / 1024 / 1024).toLocaleString('en-IN', {
                                maximumFractionDigits: 1,
                              })}
                              MB
                            </>
                          ) : null}
                        </div>
                      </div>
                      <button
                        onClick={() => setAttachment(null)}
                        disabled={sending}
                        className="p-1.5 rounded-lg text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.04] cursor-pointer disabled:opacity-40"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <div className="h-[60px] px-4 md:px-5 flex items-center gap-2">
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleAttach(f);
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => mediaInputRef.current?.click()}
                    disabled={!!attachment || sending}
                    className="w-8 h-8 rounded-lg text-[#86868b] hover:text-[#1d1d1f] hover:bg-black/[0.03] flex items-center justify-center transition-all cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Attach image, video, audio or document"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <input
                    ref={inputRef}
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    placeholder={
                      attachment
                        ? 'Add a caption (optional)…'
                        : 'Type a WhatsApp message...'
                    }
                    className="flex-1 h-[38px] px-3.5 rounded-lg bg-black/[0.04] border border-black/[0.08] text-[13px] text-[#1d1d1f] placeholder:text-[#86868b] focus:border-[rgba(56,189,248,0.55)] focus:bg-black/[0.05] focus:shadow-[0_0_0_3px_rgba(56,189,248,0.12)] focus:outline-none transition-all"
                  />

                  <button
                    onClick={() => handleSend()}
                    disabled={sending || (!!attachment && !attachment.upload) || (!messageText.trim() && !attachment)}
                    className="bh-btn-primary h-[38px] px-4 text-xs shrink-0 !gap-1.5 disabled:opacity-50"
                  >
                    {sending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <span>Send</span>
                        <Send className="w-3 h-3" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="px-4 md:px-5 py-3 border-t border-black/[0.08] bg-white shrink-0 space-y-2.5">
                <div className="flex items-center gap-2 text-[11px] text-amber-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  24-hour window closed — send an approved template (Meta rule).
                </div>

                {waTemplates.length === 0 ? (
                  <p className="text-[11px] text-[#86868b]">
                    You have no approved templates yet — create one on the Templates page.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <select
                        value={waTemplateSel}
                        onChange={(e) => {
                          setWaTemplateSel(e.target.value);
                          setWaTemplateVars([]);
                        }}
                        className="bh-input h-[34px] text-xs flex-1"
                      >
                        <option value="">Choose a template…</option>
                        {waTemplates.map((t) => (
                          <option key={t.elementName} value={t.elementName}>
                            {t.elementName}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handleTemplateSend}
                        disabled={!waTemplateSel || sendingTemplate}
                        className="bh-btn-primary h-[34px] px-3.5 text-xs shrink-0 !gap-1.5"
                      >
                        {sendingTemplate ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <span>Send</span>
                            <Send className="w-3 h-3" />
                          </>
                        )}
                      </button>
                    </div>

                    {waTemplateSel &&
                      (() => {
                        const tpl = waTemplates.find((t) => t.elementName === waTemplateSel);
                        const varCount = tpl
                          ? new Set(tpl.body.match(/\{\{\d+\}\}/g) || []).size
                          : 0;
                        return varCount > 0 ? (
                          <div className="grid grid-cols-2 gap-2">
                            {Array.from({ length: varCount }).map((_, i) => (
                              <input
                                key={i}
                                type="text"
                                value={waTemplateVars[i] || ''}
                                onChange={(e) => {
                                  const next = [...waTemplateVars];
                                  next[i] = e.target.value;
                                  setWaTemplateVars(next);
                                }}
                                placeholder={`Variable ${i + 1}`}
                                className="bh-input h-8 text-xs"
                              />
                            ))}
                          </div>
                        ) : null;
                      })()}
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
            <div className="w-12 h-12 rounded-xl bg-black/[0.04] border border-black/[0.08] flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-[#0071e3]" />
            </div>
            <h2 className="text-base font-bold text-[#1d1d1f]">Select a conversation</h2>
            <p className="text-xs text-[#86868b] max-w-xs mt-1">
              Select a chat thread from the left or start a new WhatsApp conversation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
