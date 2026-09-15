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
  GupshupRemoteTemplate,
} from './gupshup.types';

@Injectable()
export class GupshupService {
  private readonly logger = new Logger(GupshupService.name);
  private readonly client: AxiosInstance;
  private readonly mockMode: boolean;

  private partnerToken: string | null = null;
  private partnerTokenExpiresAt: number = 0;
  private appTokenCache = new Map<string, { token: string; expiresAt: number }>();

  constructor(private readonly config: ConfigService) {
    this.mockMode = config.get<boolean>('gupshup.mockMode') ?? true;

    this.client = axios.create({
      baseURL: config.get<string>('gupshup.baseUrl') || 'https://partner.gupshup.io',
      timeout: 15000,
      headers: { Accept: 'application/json' },
    });

    if (this.mockMode) {
      this.logger.warn('🔶 Gupshup running in MOCK MODE');
    }
  }

  async getPartnerToken(): Promise<string> {
    if (this.partnerToken && Date.now() < this.partnerTokenExpiresAt) {
      return this.partnerToken;
    }
    return this.refreshPartnerToken();
  }

  private async refreshPartnerToken(): Promise<string> {
    if (this.mockMode) {
      this.partnerToken = 'mock-partner-token-' + Date.now();
      this.partnerTokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
      return this.partnerToken;
    }

    const params = new URLSearchParams();
    params.append('email', this.config.get<string>('gupshup.email') || '');
    params.append('secret', this.config.get<string>('gupshup.clientSecret') || '');

    const { data } = await this.retryRequest(() =>
      this.client.post<GupshupLoginResponse>(
        '/partner/account/login',
        params,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    );

    this.partnerToken = data.token;
    this.partnerTokenExpiresAt = Date.now() + 23 * 60 * 60 * 1000;
    this.logger.log('Partner token refreshed successfully');
    return this.partnerToken;
  }

  async getAppToken(appId: string): Promise<string> {
    const cached = this.appTokenCache.get(appId);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.token;
    }

    if (this.mockMode) {
      const token = `mock-app-token-${appId}-${Date.now()}`;
      this.appTokenCache.set(appId, {
        token,
        expiresAt: Date.now() + 23 * 60 * 60 * 1000,
      });
      return token;
    }

    const { data } = await this.retryRequest(async () => {
      const partnerToken = await this.getPartnerToken();
      return this.client.get<GupshupAppTokenResponse>(
        `/partner/app/${appId}/token`,
        { headers: { token: partnerToken } },
      );
    });

    this.appTokenCache.set(appId, {
      token: data.token,
      expiresAt: Date.now() + 23 * 60 * 60 * 1000,
    });
    return data.token;
  }

  async createApp(name: string): Promise<GupshupCreateAppResponse> {
    if (this.mockMode) {
      const mockId = `mock-app-${Date.now()}`;
      this.logger.log(`[MOCK] Created app: ${mockId}`);
      return { appId: mockId, status: 'success' };
    }

    const params = new URLSearchParams();
    params.append('name', name);
    params.append('templateMessaging', 'true');
    params.append('disableOptinPrefUrl', 'false');

    const { data } = await this.retryRequest(async () => {
      const partnerToken = await this.getPartnerToken();
      return this.client.post<GupshupCreateAppResponse>('/partner/app', params, {
        headers: {
          token: partnerToken,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    });

    this.logger.log(`Created Gupshup App: ${data.appId}`);
    return data;
  }

  async getEmbedSignupLink(appId: string, userName: string): Promise<GupshupEmbedLinkResponse> {
    if (this.mockMode) {
      return {
        status: 'success',
        link: `https://mock-embed-signup.gupshup.io/${appId}?user=${userName}`,
      };
    }

    const { data } = await this.retryRequest(async () => {
      const partnerToken = await this.getPartnerToken();
      return this.client.get<GupshupEmbedLinkResponse>(
        `/partner/app/${appId}/onboarding/embed/link`,
        {
          params: { regenerate: false, user: userName, lang: 'en' },
          headers: { token: partnerToken },
        },
      );
    });
    return data;
  }

  async markForMigration(appId: string, migrationStatus = 'META_EMBED_MIGRATION'): Promise<any> {
    if (this.mockMode) {
      return { status: 'success', message: 'Mock migration marked' };
    }

    const params = new URLSearchParams();
    params.append('migrationStatus', migrationStatus);

    const { data } = await this.retryRequest(async () => {
      const partnerToken = await this.getPartnerToken();
      return this.client.post(`/partner/app/${appId}/onboarding/phoneMigration`, params, {
        headers: {
          token: partnerToken,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
    });
    return data;
  }

  async sendMessage(
    appId: string,
    to: string,
    type: string,
    payload: Record<string, any>,
  ): Promise<GupshupSendMessageResponse> {
    if (this.mockMode) {
      const mockId = `mock-msg-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
      this.logger.log(`[MOCK] Sent ${type} message to ${to}: ${mockId}`);
      return {
        messages: [{ id: mockId }],
        messaging_product: 'whatsapp',
        contacts: [{ input: to, wa_id: to }],
      };
    }

    const params = new URLSearchParams();
    params.append('messaging_product', 'whatsapp');
    params.append('recipient_type', 'individual');
    params.append('to', to);
    params.append('type', type);

    if (type === 'text') {
      params.append('text', JSON.stringify(payload));
    } else if (type === 'template') {
      params.append('template', JSON.stringify(payload));
    } else {
      params.append(type, JSON.stringify(payload));
    }

    const { data } = await this.retryRequest(async () => {
      const appToken = await this.getAppToken(appId);
      return this.client.post<GupshupSendMessageResponse>(
        `/partner/app/${appId}/v3/message`,
        params,
        {
          headers: {
            Authorization: appToken,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
    });
    return data;
  }

  async getHealth(appId: string): Promise<any> {
    if (this.mockMode) return { status: 'healthy', mock: true };
    const partnerToken = await this.getPartnerToken();
    const { data } = await this.client.get(`/partner/app/${appId}/health`, {
      headers: { token: partnerToken },
    });
    return data;
  }

  async getWalletBalance(): Promise<any> {
    if (this.mockMode) return { balance: 99.5, currency: 'USD', mock: true };
    const partnerToken = await this.getPartnerToken();
    const { data } = await this.client.get('/partner/account/wallet-balance', {
      headers: { token: partnerToken },
    });
    return data;
  }

  async getRatings(appId: string): Promise<any> {
    if (this.mockMode) return { quality: 'GREEN', mock: true };
    const partnerToken = await this.getPartnerToken();
    const { data } = await this.client.get(`/partner/app/${appId}/ratings`, {
      headers: { token: partnerToken },
    });
    return data;
  }

  /**
   * Register the v3 callback subscription for an app — MANDATORY to receive
   * inbound messages and status events in Meta format (Gupshup docs:
   * POST /partner/app/{appId}/subscription, auth = app token).
   *
   * modes=ALL forwards inbound messages + sent/delivered/read/deleted
   * receipts. The optional shared secret is delivered back to us as an
   * X-Gupshup-Webhook-Secret header on every callback.
   */
  async setSubscription(appId: string, callbackUrl: string): Promise<GupshupSubscriptionResponse> {
    const tag = `bizzhouse-${appId.slice(0, 12)}`;
    const webhookSecret = this.config.get<string>('gupshup.webhookSecret');

    if (this.mockMode) {
      this.logger.log(`[MOCK] Subscription set for ${appId} → ${callbackUrl}`);
      return { status: 'success', subscription: { id: 'mock-sub', active: true, url: callbackUrl, mode: 2047, version: 3, tag } };
    }

    const params = new URLSearchParams();
    params.append('modes', 'ALL');
    params.append('tag', tag);
    params.append('url', callbackUrl);
    params.append('version', '3');
    if (webhookSecret) {
      params.append('meta', JSON.stringify({ headers: { 'X-Gupshup-Webhook-Secret': webhookSecret } }));
    }

    const { data } = await this.retryRequest(async () => {
      const appToken = await this.getAppToken(appId);
      return this.client.post<GupshupSubscriptionResponse>(
        `/partner/app/${appId}/subscription`,
        params,
        {
          headers: {
            Authorization: appToken,
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
    if (this.mockMode) return { status: 'success', subscription: undefined };
    const { data } = await this.retryRequest(async () => {
      const appToken = await this.getAppToken(appId);
      return this.client.get<GupshupSubscriptionResponse>(`/partner/app/${appId}/subscription`, {
        headers: { Authorization: appToken },
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

  async createTemplate(
    appId: string,
    data: {
      elementName: string;
      category: string;
      languageCode: string;
      content: string;
      exampleContent?: string;
      headerText?: string;
      exampleHeader?: string;
      footerText?: string;
      buttons?: GupshupTemplateButton[];
      allowTemplateCategoryChange?: boolean;
    },
  ): Promise<GupshupCreateTemplateResponse> {
    if (this.mockMode) {
      const mockTplId = `mock-tpl-${Date.now()}`;
      this.logger.log(`[MOCK] Created template ${data.elementName} (${data.category}) for app ${appId}`);
      return {
        status: 'success',
        templateId: mockTplId,
        elementName: data.elementName,
      };
    }

    // Real API: POST /partner/app/{appId}/templates (form-urlencoded).
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
    params.append('templateType', 'TEXT');
    params.append('appId', appId);
    if (exampleContent) params.append('example', exampleContent);
    if (data.headerText) params.append('header', data.headerText);
    if (data.exampleHeader) params.append('exampleHeader', data.exampleHeader);
    if (data.footerText) params.append('footer', data.footerText);
    if (data.buttons?.length) {
      params.append('buttons', JSON.stringify(data.buttons));
    }
    params.append(
      'allowTemplateCategoryChange',
      String(data.allowTemplateCategoryChange ?? false),
    );

    const { data: res } = await this.retryRequest(async () => {
      const appToken = await this.getAppToken(appId);
      return this.client.post<GupshupCreateTemplateResponse>(
        `/partner/app/${appId}/templates`,
        params,
        {
          headers: {
            Authorization: appToken,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        },
      );
    });
    return res;
  }

  /**
   * Fetch all remote templates for an app (GET /partner/app/{appId}/templates).
   * Used by the periodic status-sync job to reconcile local rows when a
   * template-status webhook was missed.
   */
  async getTemplates(appId: string): Promise<GupshupRemoteTemplate[]> {
    if (this.mockMode) return [];
    const { data } = await this.retryRequest(async () => {
      const appToken = await this.getAppToken(appId);
      return this.client.get(`/partner/app/${appId}/templates`, {
        headers: { Authorization: appToken },
      });
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
          this.logger.error(`Gupshup request failed after ${attempt} attempts: ${err.message}`);
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
