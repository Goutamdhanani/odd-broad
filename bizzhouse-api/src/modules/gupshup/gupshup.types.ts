/** Type definitions for Gupshup Partner API responses */

export interface GupshupLoginResponse {
  token: string;
  status: string;
}

export interface GupshupCreateAppResponse {
  appId: string;
  status: string;
}

export interface GupshupEmbedLinkResponse {
  status: string;
  link: string;
}

/**
 * v3 passthrough send response. The official shape is
 * `{messages:[{id}], messaging_product, contacts}`; some Gupshup send
 * endpoints return `{status, messageId}` instead — accept both and read
 * the id through `extractMessageId()`.
 */
export interface GupshupSendMessageResponse {
  messages?: Array<{ id: string }>;
  messaging_product?: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  status?: string;
  messageId?: string;
}

export function extractMessageId(res: GupshupSendMessageResponse): string | undefined {
  return res?.messages?.[0]?.id || res?.messageId || undefined;
}

export interface GupshupHealthResponse {
  status: string;
  [key: string]: any;
}

export interface GupshupWalletBalanceResponse {
  balance: number;
  currency: string;
}

export interface GupshupAppTokenResponse {
  token: string;
}

export interface GupshupCreateTemplateResponse {
  status: string;
  templateId?: string;
  template?: { id?: string; elementName?: string; status?: string };
  elementName?: string;
  message?: string;
  [key: string]: any;
}

export interface GupshupSubscriptionResponse {
  status: string;
  subscription?: {
    id: string;
    active: boolean;
    url: string;
    mode: number | string;
    version: number;
    tag: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface GupshupTemplateButton {
  type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';
  text: string;
  url?: string;
  phone_number?: string;
  example?: string[];
}

/**
 * One card of a CAROUSEL template, exactly as Gupshup expects it in the
 * `cards` form field of POST /partner/app/{appId}/templates.
 */
export interface GupshupCarouselCard {
  headerType: 'IMAGE' | 'VIDEO';
  /** From POST /partner/app/{appId}/media — mandatory unless mediaUrl is set */
  mediaId?: string;
  /** Public HTTPS URL alternative to mediaId */
  mediaUrl?: string;
  body: string;
  sampleText?: string;
  /** Carousel cards allow URL and QUICK_REPLY buttons only (max 1 per card) */
  buttons?: Array<{
    type: 'URL' | 'QUICK_REPLY';
    text: string;
    url?: string;
    example?: string[];
  }>;
}

export interface GupshupMediaUploadResponse {
  mediaId: string;
  status: string;
}

/** GET /partner/app/{appId}/ratings */
export interface GupshupRatingsResponse {
  oldLimit?: string;
  currentLimit?: string;
  event?: string;
  eventTime?: number;
  phoneQuality?: 'GREEN' | 'YELLOW' | 'RED' | string;
  /** Normal "nothing changed since last check" response */
  message?: string;
  status?: string;
}

/** A template row as returned by GET /partner/app/{appId}/templates */
export interface GupshupRemoteTemplate {
  id?: string;
  templateId?: string;
  elementName?: string;
  name?: string;
  category?: string;
  languageCode?: string;
  language?: string;
  status?: string;
  templateType?: string;
  /** Template body text with {{N}} placeholders */
  data?: string;
  quality?: string;
  vertical?: string;
  /** Stringified JSON — carries `cards` for CAROUSEL templates */
  containerMeta?: string | Record<string, any>;
  createdOn?: number;
  modifiedOn?: number;
  wabaId?: string;
  rejection_reason?: string;
  [key: string]: any;
}

export interface GupshupInboundMessage {
  entry: Array<{
    changes: Array<{
      field: string;
      value: {
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          text?: { body: string };
          image?: { id: string; mime_type: string; sha256: string; link?: string; url?: string };
          video?: { id: string; mime_type: string; sha256: string; link?: string; url?: string };
          audio?: { id: string; mime_type: string; sha256: string; link?: string; url?: string };
          document?: { id: string; mime_type: string; sha256: string; link?: string; url?: string; filename?: string };
          timestamp: string;
          type: string;
          [key: string]: any;
        }>;
        statuses?: Array<{
          gs_id: string;
          id: string;
          recipient_id: string;
          status: string;
          timestamp: string;
          errors?: Array<{ code: number; title: string }>;
        }>;
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
      };
    }>;
    id: string;
  }>;
  gs_app_id: string;
  object: string;
}
