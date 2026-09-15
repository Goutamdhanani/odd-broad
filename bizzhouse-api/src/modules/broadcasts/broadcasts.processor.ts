import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Broadcast, BroadcastStatus } from './entities/broadcast.entity';
import { Contact } from '../contacts/entities/contact.entity';
import { MessagesService } from '../messages/messages.service';
import { MessagesGateway } from '../messages/messages.gateway';

const BATCH_SIZE = 50;

/**
 * Dispatches a queued broadcast to its opted-in audience.
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

    broadcast.status = BroadcastStatus.SENDING;
    await this.broadcastRepo.save(broadcast);
    this.emitProgress(broadcast);

    const sendDelayMs = parseInt(process.env.BROADCAST_SEND_DELAY_MS || '100', 10);

    try {
      let offset = 0;

      while (true) {
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
          const exhausted = await this.sendToContact(broadcast, contact);
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

  /** Returns true when the wallet ran dry and the broadcast should stop. */
  private async sendToContact(broadcast: Broadcast, contact: Contact): Promise<boolean> {
    try {
      const result = await this.messagesService.sendMessage(broadcast.shopId, {
        contactWaId: contact.waId,
        type: 'template',
        templateName: broadcast.templateName,
        templateLanguage: broadcast.templateLanguage,
        templateComponents: broadcast.templateComponents || [],
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
