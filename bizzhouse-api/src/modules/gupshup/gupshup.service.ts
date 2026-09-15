import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  GupshupLoginResponse,
  GupshupCreateAppResponse,
  GupshupEmbedLinkResponse,
  GupshupSendMessageResponse,
  GupshupAppTokenResponse,
  GupshupCreateTemplateResponse,
  GupshupSubscriptionResponse,
  GupshupTemplateButton,
  GupshupCarouselCard,
  GupshupMediaUploadResponse,
  GupshupRatingsResponse,
  GupshupRemoteTemplate,
} from './gupshup.types';

export interface CreateTemplateParams {
  elementName: string;
  category: string;
  languageCode: string;
  content: string;
  templateType?: string;
  exampleContent?: string;
  headerText?: string;
  exampleHeader?: string;
  footerText?: string;
  vertical?: string;
  buttons?: GupshupTemplateButton[];
  cards?: GupshupCarouselCard[];
  allowTemplateCategoryChange?: boolean;
}

/**
 * Spec §3.2 caching rule: Gupshup embed links live 5 days and the quota is
 * tight (5 new links / 40 regenerations per app) — reuse the cached link
 * while it has a 5-minute safety margin left, fetch a fresh one only after.
 */
export function isEmbedLinkFresh(
  app: { embedLink: string | null; embedLinkExpiresAt: Date | null },
  now: number = Date.now(),
): boolean {
  if (!app.embedLink || !app.embedLinkExpiresAt) return false;
  const marginMs = 5 * 60 * 1000;
  return new Date(app.embedLinkExpiresAt).getTime() > now + marginMs;
}

/**
 * Thin, real HTTP client for the Gupshup Partner API
 * (https://partner.gupshup.io — shapes verified against
 * partner-docs.gupshup.io; see docs/GUPSHUP-MASTER-SPEC.md).
 *
 * There is NO mock mode: every method performs the real call or throws a
 * clear configuration error. Never fake a response to make the UI look
 * like it works.
 */
@Injectable()
export class GupshupService {
  private readonly logger = new Logger(GupshupService.name);
  private readonly client: AxiosInstance;

  private partnerToken: string | null = null;
  private partnerTokenExpiresAt: number = 0;
  private appTokenCache = new Map<string, { token: string; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {
    this.client = axios.create({
      baseURL: config.get<string>('gupshup.baseUrl') || 'https://partner.gupshup.io',
      timeout: 30000,
      headers: { Accept: 'application/json' },
    });
  }

  /** Clear, actionable error when partner credentials are absent. */
  private assertPartnerCredentials(): { email: string; password: string } {
    const email = this.config.get<string>('gupshup.email');
    const password = this.config.get<string>('gupshup.clientSecret');
    if (!email || !password) {
      throw new Error(
        'GUPSHUP_EMAIL / GUPSHUP_CLIENT_SECRET are not set — cannot call the Gupshup Partner API. ' +
          'Set them in the environment (see .env.example); this build has no mock mode by design.',
      );
    }
    return { email, password };
  }

  async getPartnerToken(): Promise<string> {
    if (this.partnerToken && Date.now() < this.partnerTokenExpiresAt) {
      return this.partnerToken;
    }
    return this.refreshPartnerToken();
  }

  private async refreshPartnerToken(): Promise<string> {
    // Official: POST /partner/account/login with email + password
    // (form-urlencoded). Env keeps the GUPSHUP_CLIENT_SECRET name; the
    // wire field is `password`.
    const { email, password } = this.assertPartnerCredentials();

    const params = new URLSearchParams();
    params.append('email', email);
    params.append('password', password);

    const { data } = await this.retryRequest(() =>
      this.client.post<GupshupLoginResponse>(
        '/partner/account/login',
        params,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    );
    if (!data?.token) {
      throw new Error(`Gupshup partner login failed: ${JSON.stringify(data).slice(0, 300)}`);
    }

    this.partnerToken = data.token;
    this.partnerTokenExpiresAt = Date.now() + 11 * 60 * 60 * 1000; // JWT valid ~12-24h; refresh early
    this.logger.log('Partner token refreshed successfully');
    return this.partnerToken;
  }

  async getAppToken(appId: string): Promise<string> {
    const cached = this.appTokenCache.get(appId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    const { data } = await this.retryRequest(async () => {
      const partnerToken = await this.getPartnerToken();
      return this.client.get<GupshupAppTokenResponse>(
        `/partner/app/${appId}/token`,
        { headers: { Authorization: partnerToken } },
      );
    });
    if (!data?.token) {
      throw new Error(`Could not fetch app token for ${appId}: ${JSON.stringify(data).slice(0, 300)}`);
    }

    this.appTokenCache.set(appId, {
      token: data.token,
      expiresAt: Date.now() + 11 * 60 * 60 * 1000,
    });
    return data.token;
  }

  /** Headers app-token endpoints accept. Gupshup docs show both forms
   *  (`Authorization:` on most pages, `token:` in some OpenAPI blocks) —
   *  send both so either server-side check passes. */
  private async appAuthHeaders(appId: string) {
    const appToken = await this.getAppToken(appId);
    return { Authorization: appToken, token: appToken };
  }

  async createApp(name: string): Promise<GupshupCreateAppResponse> {
    const params = new URLSearchParams();
    params.append('name', name);
    params.append('templateMessaging', 'true');
    params.append('disableOptinPrefUrl', 'false');

    const { data } = await this.retryRequest(async () => {
      const partnerToken = await this.getPartnerToken();
      return this.client.post<GupshupCreateAppResponse>('/partner/app', params, {
        headers: {
          Authorization: partnerToken,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    });
    if (!data?.appId) {
      throw new Error(`Gupshup app creation failed: ${JSON.stringify(data).slice(0, 300)}`);
    }
    this.logger.log(`Created Gupshup App: ${data.appId}`);
    return data;
  }

  async getEmbedSignupLink(appId: string, userName: string): Promise<GupshupEmbedLinkResponse> {
    const { data } = await this.retryRequest(async () => {
      const partnerToken = await this.getPartnerToken();
      return this.client.get<GupshupEmbedLinkResponse>(
        `/partner/app/${appId}/onboarding/embed/link`,
        {
          params: { regenerate: false, user: userName, lang: 'en' },
          headers: { Authorization: partnerToken },
        },
      );
    });
    if (!data?.link) {
      throw new Error(`Embed signup link missing in response: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return data;
  }

  async markForMigration(appId: string, migrationStatus = 'META_EMBED_MIGRATION'): Promise<any> {
    const params = new URLSearchParams();
    params.append('migrationStatus', migrationStatus);

    const { data } = await this.retryRequest(async () => {
      const partnerToken = await this.getPartnerToken();
      return this.client.post(`/partner/app/${appId}/onboarding/phoneMigration`, params, {
        headers: {
          Authorization: partnerToken,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    });
    return data;
  }

  /**
   * Send any message through the v3 passthrough endpoint. The body mirrors
   * Meta's Cloud API shape exactly and is sent as JSON
   * (Content-Type: application/json, Authorization: app token).
   *
   * `payload` is the type-specific object, e.g. for type "text":
   *   { body: "hello" }  →  { ..., "type": "text", "text": { "body": "hello" } }
   * for type "template" it is the full Meta `template` object
   * (name/language/components, incl. the carousel component).
   */
  async sendMessage(
    appId: string,
    to: string,
    type: string,
    payload: Record<string, any>,
  ): Promise<GupshupSendMessageResponse> {
    if (!to || !type || !payload) {
      throw new Error('sendMessage requires appId, to, type and a payload object');
    }

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type,
      [type]: payload,
    };

    const { data } = await this.retryRequest(async () => {
      const headers = await this.appAuthHeaders(appId);
      return this.client.post<GupshupSendMessageResponse>(
        `/partner/app/${appId}/v3/message`,
        body,
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      );
    });
    return data;
  }

  async getHealth(appId: string): Promise<any> {
    const { data } = await this.retryRequest(async () => {
      const headers = await this.appAuthHeaders(appId);
      return this.client.get(`/partner/app/${appId}/health`, { headers });
    });
    return data;
  }

  async getWalletBalance(): Promise<any> {
    const { data } = await this.retryRequest(async () => {
      const partnerToken = await this.getPartnerToken();
      return this.client.get('/partner/account/wallet-balance', {
        headers: { Authorization: partnerToken },
      });
    });
    return data;
  }

  /**
   * Real quality rating + messaging tier for a number. App-token
   * authenticated. "no event update available" is a normal response —
   * it just means nothing changed; callers keep their cached values.
   * Rate-limited to 10 req/min upstream — poll on a schedule, never
   * per-message.
   */
  async getRatings(appId: string): Promise<GupshupRatingsResponse> {
    const { data } = await this.retryRequest(async () => {
      const headers = await this.appAuthHeaders(appId);
      return this.client.get<GupshupRatingsResponse>(`/partner/app/${appId}/ratings`, {
        headers,
      });
    });
    return data;
  }

  /**
   * Upload media and get a real `mediaId` — mandatory before any
   * image/video template or carousel card can be created.
   * POST /partner/app/{appId}/media (multipart), 100MB max.
   */
  async uploadMedia(
    appId: string,
    fileType: string,
    file: Buffer | Uint8Array | ReadableStream | Blob,
    filename = 'upload',
  ): Promise<GupshupMediaUploadResponse> {
    if (!fileType || !file) {
      throw new Error('uploadMedia requires fileType (e.g. image/jpeg) and file content');
    }
    const form = new FormData();
    form.append('file_type', fileType);
    form.append('file', file as any, filename);

    const { data } = await this.retryRequest(async () => {
      const headers = await this.appAuthHeaders(appId);
      return this.client.post<GupshupMediaUploadResponse>(
        `/partner/app/${appId}/media`,
        form,
        { headers: { ...headers }, timeout: 120000 },
      );
    });
    if (!data?.mediaId) {
      throw new Error(`Media upload failed: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return data;
  }

  /**
   * Register the v3 callback subscription for an app — MANDATORY to receive
   * inbound messages and status events in Meta format.
   *
   * modes=ALL forwards inbound messages + sent/delivered/read/deleted
   * receipts. The optional shared secret is delivered back to us as an
   * X-Gupshup-Webhook-Secret header on every callback.
   */
  async setSubscription(appId: string, callbackUrl: string): Promise<GupshupSubscriptionResponse> {
    const tag = `bizzhouse-${appId.slice(0, 12)}`;
    const webhookSecret = this.config.get<string>('gupshup.webhookSecret');

    const params = new URLSearchParams();
    params.append('modes', 'ALL');
    params.append('tag', tag);
    params.append('url', callbackUrl);
    params.append('version', '3');
    if (webhookSecret) {
      params.append('meta', JSON.stringify({ headers: { 'X-Gupshup-Webhook-Secret': webhookSecret } }));
    }

    const { data } = await this.retryRequest(async () => {
      const headers = await this.appAuthHeaders(appId);
      return this.client.post<GupshupSubscriptionResponse>(
        `/partner/app/${appId}/subscription`,
        params,
        {
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
    });

    this.logger.log(`v3 subscription registered for app ${appId}: ${data?.subscription?.id ?? 'ok'}`);
    return data;
  }

  /** Idempotency check before setSubscription — avoids duplicate subscriptions. */
  async getSubscriptions(appId: string): Promise<GupshupSubscriptionResponse> {
    const { data } = await this.retryRequest(async () => {
      const headers = await this.appAuthHeaders(appId);
      return this.client.get<GupshupSubscriptionResponse>(`/partner/app/${appId}/subscription`, {
        headers,
      });
    });
    return data;
  }

  /** True when the app already has at least one active v3 subscription. */
  async hasActiveSubscription(appId: string): Promise<boolean> {
    try {
      const res = await this.getSubscriptions(appId);
      const subs = res?.subscription
        ? [res.subscription]
        : Array.isArray((res as any)?.subscriptions)
          ? (res as any).subscriptions
          : [];
      return subs.some((s: any) => s?.active !== false && Number(s?.version ?? 3) === 3);
    } catch {
      return false; // app token may not be live yet — caller will retry later
    }
  }

  /**
   * Create a template — TEXT, IMAGE, VIDEO, DOCUMENT or CAROUSEL.
   * For CAROUSEL pass templateType='CAROUSEL', cards (2-10, each with a
   * real mediaId from uploadMedia) and a vertical; Gupshup requires
   * `example` and `vertical` for carousel submissions.
   */
  async createTemplate(
    appId: string,
    data: CreateTemplateParams,
  ): Promise<GupshupCreateTemplateResponse> {
    const templateType = data.templateType || 'TEXT';

    if (templateType === 'CAROUSEL') {
      if (!data.cards?.length) {
        throw new Error('CAROUSEL templates require a cards array (2-10 cards)');
      }
      if (data.cards.length < 2 || data.cards.length > 10) {
        throw new Error(`Carousel needs 2-10 cards, got ${data.cards.length} (Meta limit)`);
      }
      for (const [i, card] of data.cards.entries()) {
        if (!card.mediaId && !card.mediaUrl) {
          throw new Error(
            `Card ${i + 1} is missing media — upload the image first via uploadMedia() to get a mediaId`,
          );
        }
        if (!card.body?.trim()) {
          throw new Error(`Card ${i + 1} needs body text`);
        }
      }
    }

    // Meta requires `example` (body with variables filled) whenever the
    // content carries {{N}} placeholders, otherwise submission is rejected.
    const hasVariables = /\{\{\d+\}\}/.test(data.content);
    const exampleContent =
      data.exampleContent ||
      (hasVariables ? data.content.replace(/\{\{\d+\}\}/g, () => 'sample') : undefined);

    const params = new URLSearchParams();
    params.append('elementName', data.elementName);
    params.append('languageCode', data.languageCode || 'en_US');
    params.append('category', data.category);
    params.append('content', data.content);
    params.append('templateType', templateType);
    params.append('appId', appId);
    if (templateType === 'CAROUSEL') {
      // vertical + example are required for carousel submissions
      params.append('vertical', data.vertical || 'marketing');
      params.append('enableSample', 'true');
    }
    if (exampleContent) params.append('example', exampleContent);
    if (data.headerText) params.append('header', data.headerText);
    if (data.exampleHeader) params.append('exampleHeader', data.exampleHeader);
    if (data.footerText) params.append('footer', data.footerText);
    if (data.buttons?.length) {
      params.append('buttons', JSON.stringify(data.buttons));
    }
    if (data.cards?.length) {
      params.append('cards', JSON.stringify(data.cards));
    }
    params.append(
      'allowTemplateCategoryChange',
      String(data.allowTemplateCategoryChange ?? false),
    );

    const { data: res } = await this.retryRequest(async () => {
      const headers = await this.appAuthHeaders(appId);
      return this.client.post<GupshupCreateTemplateResponse>(
        `/partner/app/${appId}/templates`,
        params,
        {
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
    });
    return res;
  }

  /**
   * Edit a template still in an editable state.
   * NOTE: carousel template media cannot be edited after creation
   * (Gupshup/Meta rule) — pass identical card media.
   */
  async editTemplate(
    appId: string,
    templateId: string,
    data: CreateTemplateParams,
  ): Promise<GupshupCreateTemplateResponse> {
    const params = new URLSearchParams();
    params.append('elementName', data.elementName);
    params.append('languageCode', data.languageCode || 'en_US');
    params.append('category', data.category);
    params.append('content', data.content);
    params.append('templateType', data.templateType || 'TEXT');
    if (data.exampleContent) params.append('example', data.exampleContent);
    if (data.headerText) params.append('header', data.headerText);
    if (data.footerText) params.append('footer', data.footerText);
    if (data.buttons?.length) params.append('buttons', JSON.stringify(data.buttons));
    if (data.vertical) params.append('vertical', data.vertical);

    const { data: res } = await this.retryRequest(async () => {
      const headers = await this.appAuthHeaders(appId);
      return this.client.put<GupshupCreateTemplateResponse>(
        `/partner/app/${appId}/templates/${templateId}`,
        params,
        {
          headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
    });
    return res;
  }

  /**
   * Fetch all remote templates for an app (GET /partner/app/{appId}/templates)
   * — including ones created outside this UI. Used by sync.
   */
  async getTemplates(appId: string): Promise<GupshupRemoteTemplate[]> {
    const { data } = await this.retryRequest(async () => {
      const headers = await this.appAuthHeaders(appId);
      return this.client.get(`/partner/app/${appId}/templates`, { headers });
    });
    const list = data?.templates || data?.data || [];
    return Array.isArray(list) ? list : [];
  }

  private async retryRequest<T>(fn: () => Promise<T>, retries = 3, delayMs = 500): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        const status = err?.response?.status;

        // On 401: refresh partner token and retry immediately (one chance)
        if (status === 401 && attempt < retries) {
          this.logger.warn(`Gupshup 401 — refreshing partner token and retrying...`);
          this.partnerToken = null;
          this.partnerTokenExpiresAt = 0;
          this.appTokenCache.clear();
          await this.refreshPartnerToken();
          continue;
        }

        if (attempt === retries || (status && status >= 400 && status < 500 && status !== 429 && status !== 401)) {
          const detail = err?.response?.data
            ? typeof err.response.data === 'string'
              ? err.response.data.slice(0, 300)
              : JSON.stringify(err.response.data).slice(0, 300)
            : err?.message;
          this.logger.error(`Gupshup request failed (HTTP ${status ?? 'n/a'}): ${detail}`);
          err.message = `${err.message} — Gupshup said: ${detail}`;
          throw err;
        }
        const wait = delayMs * Math.pow(2, attempt - 1);
        this.logger.warn(`Gupshup request attempt ${attempt} failed, retrying in ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw new Error('Unreachable');
  }
}
