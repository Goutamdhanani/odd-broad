import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { Broadcast, BroadcastStatus } from './entities/broadcast.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';
import { NumberHealthService } from '../gupshup/number-health.service';
import { MessagesService } from '../messages/messages.service';
import { MessagesGateway } from '../messages/messages.gateway';

const BATCH_SIZE = 50;

/**
 * Dispatches a queued broadcast to its opted-in audience.
 *
 * The sending number is chosen once per campaign (spec §2.4): a pinned
 * number or the health-aware router's pick. Health is re-checked between
 * batches — never per message — and a number that goes RED mid-campaign
 * fails over to another healthy number or stops the campaign.
 *
 * Sends are sequential (per-message wallet debit stays atomic and the
 * provider rate limits stay comfortable), progress is persisted after
 * every message and pushed to the shop's open tabs over websocket.
 */
@Processor('broadcast-dispatch')
@Injectable()
export class BroadcastsProcessor extends WorkerHost {
  private readonly logger = new Logger(BroadcastsProcessor.name);

  constructor(
    @InjectRepository(Broadcast)
    private readonly broadcastRepo: Repository<Broadcast>,
    @InjectRepository(Contact)
    private readonly contactRepo: Repository<Contact>,
    @InjectRepository(GupshupApp)
    private readonly gupshupAppRepo: Repository<GupshupApp>,
    private readonly numberHealthService: NumberHealthService,
    private readonly messagesService: MessagesService,
    private readonly messagesGateway: MessagesGateway,
  ) {
    super();
  }

  async process(job: Job<{ broadcastId: string }>): Promise<void> {
    const { broadcastId } = job.data;

    const broadcast = await this.broadcastRepo.findOne({ where: { id: broadcastId } });
    if (!broadcast) {
      this.logger.warn(`Broadcast ${broadcastId} not found — skipping`);
      return;
    }
    if (broadcast.status !== BroadcastStatus.QUEUED) {
      this.logger.warn(`Broadcast ${broadcastId} already ${broadcast.status} — skipping`);
      return;
    }

    // Choose the campaign's sending number up front (spec §2.4). A RED
    // pinned number reaching dispatch means the confirm gate was passed
    // at creation — honor it; otherwise route among healthy numbers.
    let currentApp: GupshupApp;
    try {
      if (broadcast.gupshupAppId) {
        const pinned = await this.gupshupAppRepo.findOne({
          where: { gupshupAppId: broadcast.gupshupAppId, shopId: broadcast.shopId },
        });
        if (!pinned) throw new Error('pinned sending number no longer exists');
        currentApp = pinned;
      } else {
        currentApp = await this.numberHealthService.pickSendingNumber(broadcast.shopId);
      }
    } catch (err: any) {
      broadcast.status = BroadcastStatus.FAILED;
      broadcast.error = `No sending number available: ${err?.message?.slice(0, 300)}`;
      await this.broadcastRepo.save(broadcast);
      this.emitProgress(broadcast);
      return;
    }

    broadcast.status = BroadcastStatus.SENDING;
    await this.broadcastRepo.save(broadcast);
    this.emitProgress(broadcast);

    const sendDelayMs = parseInt(process.env.BROADCAST_SEND_DELAY_MS || '100', 10);

    try {
      let offset = 0;

      while (true) {
        // Mid-campaign health guard (spec §2.4 step 3) — between batches,
        // not per message. RED → fail over or stop.
        const guard = await this.numberHealthService.canContinueSending(currentApp);
        if (!guard.ok) {
          const next = await this.pickFallbackNumber(broadcast, currentApp.gupshupAppId);
          if (next) {
            this.logger.warn(
              `Broadcast ${broadcast.id}: number ${currentApp.gupshupAppId} went RED mid-campaign (${guard.reasons.join('; ')}) — failing over to ${next.gupshupAppId}`,
            );
            currentApp = next;
          } else {
            broadcast.status = BroadcastStatus.FAILED;
            broadcast.error =
              `Sending number went unhealthy mid-campaign: ${guard.reasons.join('; ')}. ` +
              `${broadcast.sentCount} sent before stopping.`;
            broadcast.completedAt = new Date();
            await this.broadcastRepo.save(broadcast);
            this.emitProgress(broadcast);
            this.logger.error(`Broadcast ${broadcast.id} stopped: ${broadcast.error}`);
            return;
          }
        }

        const contacts = await this.contactRepo.find({
          where: broadcast.audienceTag
            ? { shopId: broadcast.shopId, optedIn: true, tags: In([broadcast.audienceTag]) }
            : { shopId: broadcast.shopId, optedIn: true },
          order: { createdAt: 'ASC' },
          skip: offset,
          take: BATCH_SIZE,
        });

        if (contacts.length === 0) break;
        offset += contacts.length;

        for (const contact of contacts) {
          const exhausted = await this.sendToContact(broadcast, contact, currentApp.gupshupAppId);
          if (exhausted) {
            broadcast.status = BroadcastStatus.FAILED;
            broadcast.error = `Wallet exhausted after ${broadcast.sentCount} sent — ${broadcast.skippedCount} recipients skipped`;
            await this.broadcastRepo.save(broadcast);
            this.emitProgress(broadcast);
            this.logger.error(
              `Broadcast ${broadcast.id} stopped early: insufficient balance`,
            );
            return;
          }
          if (sendDelayMs > 0) {
            await new Promise((r) => setTimeout(r, sendDelayMs));
          }
        }
      }

      broadcast.status =
        broadcast.failedCount > 0 && broadcast.sentCount === 0
          ? BroadcastStatus.FAILED
          : BroadcastStatus.COMPLETED;
      broadcast.completedAt = new Date();
      await this.broadcastRepo.save(broadcast);
      this.emitProgress(broadcast);

      this.logger.log(
        `Broadcast '${broadcast.name}' finished: ${broadcast.sentCount} sent, ` +
        `${broadcast.failedCount} failed, cost ₹${(Number(broadcast.costPaise) / 100).toFixed(2)}`,
      );
    } catch (err: any) {
      broadcast.status = BroadcastStatus.FAILED;
      broadcast.error = err?.message?.slice(0, 500) || 'Unknown dispatch error';
      broadcast.completedAt = new Date();
      await this.broadcastRepo.save(broadcast);
      this.emitProgress(broadcast);
      this.logger.error(`Broadcast ${broadcast.id} failed: ${err?.message}`, err?.stack);
    }
  }

  /** Another healthy live number of this shop, excluding the failed one. */
  private async pickFallbackNumber(
    broadcast: Broadcast,
    excludeAppId: string,
  ): Promise<GupshupApp | null> {
    const others = await this.gupshupAppRepo.find({
      where: { shopId: broadcast.shopId, wabaStatus: 'live', gupshupAppId: Not(excludeAppId) },
    });
    for (const app of others) {
      const health = await this.numberHealthService.getHealth(app);
      if (health.light !== 'red') return app;
    }
    return null;
  }

  /** Returns true when the wallet ran dry and the broadcast should stop. */
  private async sendToContact(
    broadcast: Broadcast,
    contact: Contact,
    gupshupAppId: string,
  ): Promise<boolean> {
    try {
      const result = await this.messagesService.sendMessage(broadcast.shopId, {
        contactWaId: contact.waId,
        type: 'template',
        templateName: broadcast.templateName,
        templateLanguage: broadcast.templateLanguage,
        templateComponents: broadcast.templateComponents || [],
        templateValues: broadcast.templateVariables || [],
        gupshupAppId,
        contactName: contact.name || undefined,
      });
      broadcast.sentCount += 1;
      broadcast.costPaise = Number(broadcast.costPaise) + (result.costPaise || 0);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (msg.includes('Insufficient wallet balance')) {
        // Do not count remaining recipients as failures — the wallet is the problem
        broadcast.skippedCount = Math.max(
          0,
          broadcast.totalRecipients - broadcast.sentCount - broadcast.failedCount,
        );
        return true;
      }
      broadcast.failedCount += 1;
      this.logger.warn(
        `Broadcast ${broadcast.id}: send to ${contact.waId} failed — ${msg}`,
      );
    }

    await this.broadcastRepo.save(broadcast);
    this.emitProgress(broadcast);
    return false;
  }

  private emitProgress(broadcast: Broadcast) {
    this.messagesGateway.emitBroadcastUpdate(broadcast.shopId, {
      id: broadcast.id,
      name: broadcast.name,
      templateName: broadcast.templateName,
      status: broadcast.status,
      totalRecipients: broadcast.totalRecipients,
      sentCount: broadcast.sentCount,
      failedCount: broadcast.failedCount,
      skippedCount: broadcast.skippedCount,
      costPaise: Number(broadcast.costPaise),
      error: broadcast.error,
    });
  }
}
