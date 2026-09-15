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

export interface GupshupSendMessageResponse {
  messages: Array<{ id: string }>;
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
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
  containerMeta?: { rejection_reason?: string; [key: string]: any };
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
          image?: { id: string; mime_type: string; sha256: string };
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
