import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Template, TemplateStatus } from './entities/template.entity';
import { CreateTemplateDto } from './dto/create-template.dto';
import { GupshupService } from '../gupshup/gupshup.service';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';
import { GupshupTemplateButton } from '../gupshup/gupshup.types';

@Injectable()
export class TemplatesService {
  private readonly logger = new Logger(TemplatesService.name);

  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    @InjectRepository(GupshupApp)
    private readonly gupshupAppRepo: Repository<GupshupApp>,
    private readonly gupshupService: GupshupService,
  ) {}

  async create(shopId: string, dto: CreateTemplateDto): Promise<Template> {
    const existing = await this.templateRepo.findOne({
      where: { shopId, elementName: dto.elementName },
    });

    if (existing) {
      throw new ConflictException(`Template '${dto.elementName}' already exists for this shop`);
    }

    const app = await this.gupshupAppRepo.findOne({ where: { shopId } });
    let gupshupTemplateId: string | null = null;
    let submissionError: string | null = null;

    if (app && app.gupshupAppId) {
      try {
        const res = await this.gupshupService.createTemplate(app.gupshupAppId, {
          elementName: dto.elementName,
          category: dto.category,
          languageCode: dto.language || 'en_US',
          content: dto.body,
          headerText: dto.headerText,
          footerText: dto.footerText,
          buttons: this.normalizeButtons(dto.buttons),
        });
        gupshupTemplateId = res.templateId || null;
        const resStatus = (res.status || '').toUpperCase();
        if (resStatus && !['SUCCESS', 'PENDING', 'OK'].includes(resStatus)) {
          submissionError = res.message || res.status;
        }
      } catch (err: any) {
        // Surface the provider's rejection reason instead of silently
        // pretending the template was submitted.
        submissionError =
          err?.response?.data?.message || err?.response?.data?.error || err?.message;
        this.logger.error(`Failed to submit template to Gupshup: ${submissionError}`);
      }
    } else {
      submissionError = 'No Gupshup app connected for this shop yet';
    }

    const template = this.templateRepo.create({
      shopId,
      elementName: dto.elementName,
      category: dto.category,
      language: dto.language || 'en_US',
      body: dto.body,
      buttons: (this.normalizeButtons(dto.buttons) as unknown as Template['buttons']) || [],
      status: submissionError ? TemplateStatus.FAILED : TemplateStatus.IN_REVIEW,
      rejectionReason: submissionError,
      gupshupTemplateId,
    });

    return this.templateRepo.save(template);
  }

  /**
   * Normalize incoming buttons to the object shape the Gupshup API expects.
   * Accepts plain strings (treated as QUICK_REPLY) and objects.
   */
  private normalizeButtons(
    buttons?: CreateTemplateDto['buttons'],
  ): GupshupTemplateButton[] {
    if (!buttons?.length) return [];
    return buttons
      .map((b) => {
        if (typeof b === 'string') return { type: 'QUICK_REPLY' as const, text: b };
        const out: GupshupTemplateButton = { type: b.type || 'QUICK_REPLY', text: b.text };
        if (b.type === 'URL' && b.url) {
          out.url = b.url;
          out.example = [b.url.replace(/\{\{1\}\}/, 'page')];
        }
        if (b.type === 'PHONE_NUMBER' && b.phoneNumber) {
          out.phone_number = b.phoneNumber;
        }
        return out;
      })
      .filter((b) => b.text);
  }

  /**
   * Reconcile local template rows with the provider's records — covers
   * missed status webhooks. Only meaningful in live mode (mock returns []).
   * Returns the number of rows updated.
   */
  async syncFromProvider(appId: string, shopId: string): Promise<number> {
    const remote = await this.gupshupService.getTemplates(appId);
    if (remote.length === 0) return 0;

    const local = await this.templateRepo.find({ where: { shopId } });
    let updated = 0;

    for (const r of remote) {
      const remoteId = String(r.id || r.templateId || '');
      const remoteName = r.elementName || r.name;
      if (!remoteName && !remoteId) continue;

      const row = local.find(
        (t) =>
          (remoteId && t.gupshupTemplateId === remoteId) ||
          (!!remoteName && t.elementName === remoteName),
      );
      if (!row) continue;

      const rawStatus = String(r.status || '').toUpperCase();
      const nextStatus: TemplateStatus | null = ['APPROVED', 'APPROVED_ACTIVE'].includes(rawStatus)
        ? TemplateStatus.APPROVED
        : ['REJECTED', 'REJECT', 'FAILED', 'PAUSED', 'DENIED'].includes(rawStatus)
          ? TemplateStatus.REJECTED
          : ['PENDING', 'IN_REVIEW', 'QUEUED', 'SUBMITTED', 'PENDING_DELETION'].includes(rawStatus)
            ? TemplateStatus.IN_REVIEW
            : null;

      if (!nextStatus) continue;
      const reason = r.containerMeta?.rejection_reason || r.rejection_reason;

      if (row.status !== nextStatus || (reason && row.rejectionReason !== reason)) {
        row.status = nextStatus;
        if (reason) row.rejectionReason = reason;
        if (remoteId && row.gupshupTemplateId !== remoteId) {
          row.gupshupTemplateId = remoteId;
        }
        await this.templateRepo.save(row);
        updated++;
      }
    }
    return updated;
  }

  async findAllForShop(shopId: string): Promise<Template[]> {
    return this.templateRepo.find({
      where: { shopId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(shopId: string, id: string): Promise<Template> {
    const template = await this.templateRepo.findOne({
      where: { id, shopId },
    });

    if (!template) {
      throw new NotFoundException(`Template with ID '${id}' not found`);
    }

    return template;
  }

  async updateStatusByName(
    elementName: string,
    status: TemplateStatus,
    rejectionReason?: string,
  ): Promise<void> {
    const templates = await this.templateRepo.find({ where: { elementName } });
    for (const tpl of templates) {
      tpl.status = status;
      if (rejectionReason) tpl.rejectionReason = rejectionReason;
      await this.templateRepo.save(tpl);
    }
  }

  /**
   * Phase 40: apply a template-status callback from Gupshup.
   * Matched by gupshup_template_id first (authoritative), then by
   * (shop's gupshup_app_id + element name). Never throws — webhook
   * processing must not fail the batch.
   */
  async applyStatusCallback(payload: {
    gupshupAppId?: string;
    gupshupTemplateId?: string;
    elementName?: string;
    status?: string;
    rejectionReason?: string;
  }): Promise<boolean> {
    const rawStatus = (payload.status || '').toUpperCase();

    let status: TemplateStatus | null = null;
    if (['APPROVED', 'APPROVE', 'APPROVED_ACTIVE'].includes(rawStatus)) {
      status = TemplateStatus.APPROVED;
    } else if (['REJECTED', 'REJECT'].includes(rawStatus)) {
      status = TemplateStatus.REJECTED;
    } else if (['PENDING', 'IN_REVIEW', 'QUEUED', 'SUBMITTED'].includes(rawStatus)) {
      status = TemplateStatus.IN_REVIEW;
    }

    if (!status) {
      this.logger.warn(
        `Template callback with unmapped status '${payload.status}' — ignored`,
      );
      return false;
    }

    let templates: Template[] = [];

    if (payload.gupshupTemplateId) {
      templates = await this.templateRepo.find({
        where: { gupshupTemplateId: payload.gupshupTemplateId },
      });
    }

    if (templates.length === 0 && payload.gupshupAppId && payload.elementName) {
      const app = await this.gupshupAppRepo.findOne({
        where: { gupshupAppId: payload.gupshupAppId },
      });
      if (app) {
        const tpl = await this.templateRepo.findOne({
          where: { shopId: app.shopId, elementName: payload.elementName },
        });
        if (tpl) templates = [tpl];
      }
    }

    if (templates.length === 0) {
      this.logger.warn(
        `Template callback matched no local rows (appId=${payload.gupshupAppId}, tplId=${payload.gupshupTemplateId}, name=${payload.elementName})`,
      );
      return false;
    }

    for (const tpl of templates) {
      tpl.status = status;
      if (status === TemplateStatus.REJECTED && payload.rejectionReason) {
        tpl.rejectionReason = payload.rejectionReason;
      }
      if (status === TemplateStatus.APPROVED) {
        tpl.rejectionReason = null;
      }
      await this.templateRepo.save(tpl);
      this.logger.log(
        `Template ${tpl.elementName} (${tpl.shopId}) → ${status}`,
      );
    }
    return true;
  }
}
