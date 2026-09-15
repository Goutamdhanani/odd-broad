import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export type AlertSeverity = 'info' | 'warning' | 'critical';

interface AlertState {
  lastRaisedAt: number;
}

/**
 * Central alert dispatcher for operational warnings (low wallet balances,
 * ledger drift, onboarding stalls).
 *
 * Delivery channels, in order:
 *  1. Structured log — always.
 *  2. ALERT_WEBHOOK_URL — POSTs a Slack-compatible JSON payload when set
 *     (works with Slack, Discord webhooks via translation, n8n, etc.).
 *
 * Repeated alerts for the same key are suppressed for ALERT_COOLDOWN_HOURS
 * so a 15-minute cron doesn't spam the channel about the same shop.
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private readonly state = new Map<string, AlertState>();

  constructor(private readonly config: ConfigService) {}

  /**
   * Raise a deduplicated alert. `key` identifies the recurring condition
   * (e.g. `shop-low-balance:<shopId>`) — identical keys inside the cooldown
   * window are dropped.
   *
   * @param force skip the cooldown (for one-shot conditions like ledger drift)
   * @returns true if the alert was actually delivered (not suppressed)
   */
  async raise(
    key: string,
    severity: AlertSeverity,
    message: string,
    meta?: Record<string, any>,
    force = false,
  ): Promise<boolean> {
    const cooldownHours = this.config.get<number>('alerts.lowBalanceCooldownHours') ?? 12;
    const cooldownMs = cooldownHours * 60 * 60 * 1000;

    if (!force) {
      const prior = this.state.get(key);
      if (prior && Date.now() - prior.lastRaisedAt < cooldownMs) {
        return false;
      }
    }
    this.state.set(key, { lastRaisedAt: Date.now() });

    if (severity === 'critical') {
      this.logger.error(`🚨 [ALERT] ${message}`);
    } else if (severity === 'warning') {
      this.logger.warn(`⚠️ [ALERT] ${message}`);
    } else {
      this.logger.log(`ℹ️ [ALERT] ${message}`);
    }

    const webhookUrl = this.config.get<string>('alerts.webhookUrl');
    if (!webhookUrl) return true;

    try {
      await axios.post(
        webhookUrl,
        {
          text: `*BizzHouse ${severity.toUpperCase()}* — ${message}`,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*BizzHouse ${severity.toUpperCase()}*\n${message}` },
            },
            ...(meta
              ? [
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: Object.entries(meta)
                        .map(([k, v]) => `*${k}:* ${String(v).slice(0, 200)}`)
                        .join('\n'),
                    },
                  },
                ]
              : []),
          ],
        },
        { timeout: 5000 },
      );
    } catch (err: any) {
      // Never let alert delivery take down the caller — it's already logged.
      this.logger.error(`Alert webhook delivery failed: ${err?.message}`);
    }
    return true;
  }
}
