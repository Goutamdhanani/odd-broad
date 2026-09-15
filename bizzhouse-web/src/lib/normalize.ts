/**
 * Normalization layer between backend/provider payloads and React.
 *
 * Raw provider shapes (Gupshup/Meta payloads, template buttons, media
 * bundles) must NEVER reach JSX directly — components consume these
 * normalized types only.
 */

// ── Template buttons ──────────────────────────────────────
export interface TemplateButtonObject {
  type?: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | string;
  text?: string;
  url?: string;
  phoneNumber?: string;
}

export type TemplateButtonInput = string | TemplateButtonObject | null | undefined;

/** Buttons are stored as objects (Gupshup API shape); older rows may hold plain strings. */
export function normalizeButtonLabel(btn: TemplateButtonInput): string {
  if (!btn) return '';
  if (typeof btn === 'string') return btn;
  return btn.text || btn.url || btn.phoneNumber || '';
}

/** Full normalized view of a template button for rendering. */
export function normalizeButton(
  btn: TemplateButtonInput,
): { label: string; type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER' | 'UNKNOWN' } {
  if (!btn) return { label: '', type: 'UNKNOWN' };
  if (typeof btn === 'string') return { label: btn, type: 'QUICK_REPLY' };
  const knownTypes = ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'] as const;
  const type = knownTypes.includes(btn.type as (typeof knownTypes)[number])
    ? (btn.type as (typeof knownTypes)[number])
    : 'UNKNOWN';
  return { label: normalizeButtonLabel(btn), type };
}

// ── Message content ───────────────────────────────────────
export type NormalizedMessageContent =
  | { kind: 'text'; text: string }
  | {
      kind: 'media';
      mediaType: 'image' | 'video' | 'audio' | 'document' | 'sticker';
      url?: string;
      caption?: string;
      filename?: string;
      mimeType?: string;
    }
  | { kind: 'location'; latitude?: number; longitude?: number; address?: string }
  | { kind: 'template'; templateName: string; body: string; variables?: string[] }
  | { kind: 'unsupported'; label: string };

type AnyRecord = Record<string, unknown>;

/** Fill {{N}} placeholders with positional values for template previews. */
function fillTemplateBody(body: string, values?: string[]): string {
  if (!values?.length) return body;
  let i = 0;
  return body.replace(/\{\{\d+\}\}/g, () => values[i++] ?? '');
}

/**
 * Normalize an arbitrary message payload into a render-safe shape.
 * Returns 'unsupported' (never raw objects) for anything unrecognized.
 */
export function normalizeMessageContent(
  payload: unknown,
  messageType?: string,
  templateVars?: string[],
): NormalizedMessageContent {
  const p: AnyRecord = (payload ?? {}) as AnyRecord;
  const type = String(messageType || p.messageType || 'text').toLowerCase();

  // Template message payload: { name, language, components } and/or bodyText
  if (type === 'template') {
    const name = typeof p.name === 'string' ? p.name : '';
    // Newer rows carry the human-readable body used at send time
    if (typeof p.bodyText === 'string' && p.bodyText) {
      return { kind: 'template', templateName: name, body: p.bodyText, variables: templateVars };
    }
    const bodyParam = Array.isArray(p.components)
      ? (p.components as AnyRecord[]).find((c) => c?.type === 'body')
      : null;
    const params = Array.isArray(bodyParam?.parameters) ? bodyParam!.parameters : [];
    const variables = params.map((v) =>
      typeof v === 'string' ? v : typeof v?.text === 'string' ? v.text : '',
    );
    return {
      kind: 'template',
      templateName: name,
      body: name || 'Template message',
      variables: variables.length ? variables : templateVars,
    };
  }

  // Media types share a link/caption shape
  if (['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
    const media = (p[type] || {}) as AnyRecord;
    const url =
      (typeof p.mediaUrl === 'string' && p.mediaUrl) ||
      (typeof media.link === 'string' && media.link) ||
      (typeof media.url === 'string' && media.url) ||
      undefined;
    const caption = typeof p.caption === 'string' ? p.caption : typeof media.caption === 'string' ? media.caption : undefined;
    return {
      kind: 'media',
      mediaType: type as 'image' | 'video' | 'audio' | 'document' | 'sticker',
      url,
      caption,
      filename: typeof media.filename === 'string' ? media.filename : undefined,
      mimeType: typeof p.mimeType === 'string' ? p.mimeType : typeof media.mime_type === 'string' ? media.mime_type : undefined,
    };
  }

  if (type === 'location') {
    const loc = (p.location || {}) as AnyRecord;
    return {
      kind: 'location',
      latitude: typeof loc.latitude === 'number' ? loc.latitude : undefined,
      longitude: typeof loc.longitude === 'number' ? loc.longitude : undefined,
      address: typeof loc.address === 'string' ? loc.address : undefined,
    };
  }

  // Text (the common case) — accept string payload or { body }
  const text =
    typeof p === 'string'
      ? p
      : typeof p.body === 'string'
        ? p.body
        : typeof p.text === 'string'
          ? p.text
          : typeof p.caption === 'string'
            ? p.caption
            : '';

  if (text) {
    return { kind: 'text', text };
  }

  return { kind: 'unsupported', label: type !== 'text' ? type : 'message' };
}

export { fillTemplateBody };
