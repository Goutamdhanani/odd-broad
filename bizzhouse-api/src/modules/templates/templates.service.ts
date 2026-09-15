import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Template, TemplateStatus, TemplateType } from './entities/template.entity';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
} from './dto/create-template.dto';
import { GupshupService } from '../gupshup/gupshup.service';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';
import {
  GupshupTemplateButton,
  GupshupCarouselCard,
  GupshupRemoteTemplate,
} from '../gupshup/gupshup.types';

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

    const templateType = dto.templateType || TemplateType.TEXT;
    if (templateType === TemplateType.CAROUSEL) {
      if (!dto.cards?.length) {
        throw new BadRequestException('Carousel templates require cards (2-10, each with an uploaded image)');
      }
      for (const [i, card] of dto.cards.entries()) {
        if (!card.mediaId && !card.mediaUrl) {
          throw new BadRequestException(
            `Card ${i + 1} has no mediaId — upload the image first (POST /templates/media) and attach the returned mediaId`,
          );
        }
      }
    }

    // Templates live per WABA (per Gupshup app): submit the same template
    // to every LIVE number the shop has connected so any of them can send
    // it. elementName is identical across apps; per-app ids are kept in
    // gupshupTemplateIds for editing.
    const liveApps = await this.gupshupAppRepo.find({
      where: { shopId, wabaStatus: 'live' },
    });

    const templateIds: Record<string, string> = {};
    let submissionError: string | null = null;

    if (liveApps.length === 0) {
      submissionError = 'No live WhatsApp number connected yet — complete onboarding first';
    } else {
      for (const app of liveApps) {
        try {
          const res = await this.gupshupService.createTemplate(app.gupshupAppId, {
            elementName: dto.elementName,
            category: dto.category,
            languageCode: dto.language || 'en_US',
            content: dto.body,
            templateType,
            exampleContent: dto.example,
            headerText: dto.headerText,
            footerText: dto.footerText,
            vertical: dto.vertical,
            buttons: this.normalizeButtons(dto.buttons),
            cards: dto.cards as GupshupCarouselCard[] | undefined,
          });
          const id = res.templateId || res.template?.id || null;
          if (id) templateIds[app.gupshupAppId] = id;
          const resStatus = (res.status || '').toUpperCase();
          if (resStatus && !['SUCCESS', 'PENDING', 'OK'].includes(resStatus)) {
            submissionError = res.message || res.status;
          }
        } catch (err: any) {
          // Surface the provider's rejection reason instead of silently
          // pretending the template was submitted.
          submissionError =
            err?.response?.data?.message || err?.response?.data?.error || err?.message;
          this.logger.error(
            `Failed to submit template '${dto.elementName}' to app ${app.gupshupAppId}: ${submissionError}`,
          );
        }
      }
    }

    const template = this.templateRepo.create({
      shopId,
      elementName: dto.elementName,
      category: dto.category,
      language: dto.language || 'en_US',
      body: dto.body,
      templateType,
      cards: templateType === TemplateType.CAROUSEL ? (dto.cards as any) : null,
      vertical: dto.vertical || null,
      headerText: dto.headerText || null,
      footerText: dto.footerText || null,
      example: dto.example || null,
      buttons: (this.normalizeButtons(dto.buttons) as unknown as Template['buttons']) || [],
      status: submissionError ? TemplateStatus.FAILED : TemplateStatus.IN_REVIEW,
      rejectionReason: submissionError,
      gupshupTemplateId: Object.values(templateIds)[0] || null,
      gupshupTemplateIds: templateIds,
    });

    return this.templateRepo.save(template);
  }

  /**
   * Edit a template that is still editable. Applied to every app copy via
   * the stored per-app template ids. Carousel MEDIA cannot be edited after
   * creation (Gupshup/Meta rule) — only text fields.
   */
  async update(shopId: string, id: string, dto: UpdateTemplateDto): Promise<Template> {
    const template = await this.findOne(shopId, id);
    if (template.status === TemplateStatus.APPROVED) {
      throw new BadRequestException(
        'Approved templates cannot be edited (Meta rule) — create a new template instead',
      );
    }
    if (template.templateType === TemplateType.CAROUSEL) {
      throw new BadRequestException(
        'Carousel templates cannot be edited after submission (Meta rule: carousel media is locked at creation)',
      );
    }

    const liveApps = await this.gupshupAppRepo.find({
      where: { shopId, wabaStatus: 'live' },
    });
    const idsMap = template.gupshupTemplateIds || {};
    let lastError: string | null = null;
    let anyOk = false;

    for (const app of liveApps) {
      const tplId = idsMap[app.gupshupAppId] || template.gupshupTemplateId;
      if (!tplId) continue;
      try {
        await this.gupshupService.editTemplate(app.gupshupAppId, tplId, {
          elementName: template.elementName,
          category: dto.category || template.category,
          languageCode: template.language,
          content: dto.body ?? template.body,
          templateType: template.templateType,
          exampleContent: dto.example || template.example || undefined,
          headerText: dto.headerText ?? template.headerText ?? undefined,
          footerText: dto.footerText ?? template.footerText ?? undefined,
          vertical: template.vertical || undefined,
          buttons: (template.buttons as unknown as GupshupTemplateButton[]) || undefined,
        });
        anyOk = true;
      } catch (err: any) {
        lastError = err?.response?.data?.message || err?.message;
        this.logger.error(
          `Template edit failed on app ${app.gupshupAppId}: ${lastError}`,
        );
      }
    }

    if (liveApps.length > 0 && !anyOk && lastError) {
      throw new BadRequestException(`Gupshup rejected the edit: ${lastError}`);
    }

    if (dto.body !== undefined) template.body = dto.body;
    if (dto.category) template.category = dto.category;
    if (dto.headerText !== undefined) template.headerText = dto.headerText;
    if (dto.footerText !== undefined) template.footerText = dto.footerText;
    if (dto.example !== undefined) template.example = dto.example;
    if (dto.buttons) {
      template.buttons = this.normalizeButtons(dto.buttons) as unknown as Template['buttons'];
    }
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
   * Pull the shop's real template list from Gupshup for every live number
   * and reconcile local rows: update statuses of known templates AND
   * import templates that exist upstream but not locally (e.g. created
   * directly on Gupshup/Meta). Returns { updated, imported }.
   */
  async syncFromProvider(shopId: string): Promise<{ updated: number; imported: number }> {
    const liveApps = await this.gupshupAppRepo.find({
      where: { shopId, wabaStatus: 'live' },
    });
    if (liveApps.length === 0) return { updated: 0, imported: 0 };

    const local = await this.templateRepo.find({ where: { shopId } });
    let updated = 0;
    let imported = 0;

    for (const app of liveApps) {
      let remote: GupshupRemoteTemplate[] = [];
      try {
        remote = await this.gupshupService.getTemplates(app.gupshupAppId);
      } catch (err: any) {
        this.logger.warn(`Template fetch failed for app ${app.gupshupAppId}: ${err?.message}`);
        continue;
      }

      for (const r of remote) {
        const remoteId = String(r.id || r.templateId || '');
        const remoteName = r.elementName || r.name;
        if (!remoteName && !remoteId) continue;

        const row = local.find(
          (t) =>
            (remoteId && t.gupshupTemplateIds?.[app.gupshupAppId] === remoteId) ||
            (!!remoteName && t.elementName === remoteName),
        );

        const nextStatus = this.mapRemoteStatus(r.status);
        const reason = this.rejectionReasonOf(r);

        if (!row) {
          // Template exists upstream but not locally — import it so the
          // shop sees everything they own (spec §2.2 "Sync").
          const created = this.templateRepo.create({
            shopId,
            elementName: remoteName || `template_${remoteId}`,
            category: this.mapRemoteCategory(r.category),
            language: r.languageCode || r.language || 'en_US',
            body: r.data || '',
            templateType: this.mapRemoteTemplateType(r.templateType),
            cards: this.parseContainerCards(r),
            vertical: r.vertical || null,
            status: nextStatus || TemplateStatus.IN_REVIEW,
            rejectionReason: reason || null,
            gupshupTemplateId: remoteId || null,
            gupshupTemplateIds: remoteId ? { [app.gupshupAppId]: remoteId } : {},
          });
          await this.templateRepo.save(created);
          local.push(created);
          imported++;
          continue;
        }

        if (nextStatus && (row.status !== nextStatus || (reason && row.rejectionReason !== reason))) {
          row.status = nextStatus;
          if (reason) row.rejectionReason = reason;
          if (nextStatus === TemplateStatus.APPROVED) row.rejectionReason = null;
        }
        // Keep the per-app id map current
        if (remoteId) {
          const ids = { ...row.gupshupTemplateIds };
          if (ids[app.gupshupAppId] !== remoteId) {
            ids[app.gupshupAppId] = remoteId;
            row.gupshupTemplateIds = ids;
            if (!row.gupshupTemplateId) row.gupshupTemplateId = remoteId;
          }
        }
        // Enrich text rows with the upstream body when we lack one
        if (!row.body && r.data) row.body = r.data;
        if (!row.cards && r.templateType === 'CAROUSEL') {
          row.cards = this.parseContainerCards(r);
        }
        await this.templateRepo.save(row);
        updated++;
      }
    }
    return { updated, imported };
  }

  private mapRemoteStatus(raw: unknown): TemplateStatus | null {
    const s = String(raw || '').toUpperCase();
    if (['APPROVED', 'APPROVE', 'APPROVED_ACTIVE'].includes(s)) return TemplateStatus.APPROVED;
    if (['REJECTED', 'REJECT', 'FAILED', 'PAUSED', 'DENIED'].includes(s)) return TemplateStatus.REJECTED;
    if (['PENDING', 'IN_REVIEW', 'QUEUED', 'SUBMITTED', 'PENDING_DELETION'].includes(s))
      return TemplateStatus.IN_REVIEW;
    return null;
  }

  private mapRemoteCategory(raw: unknown): Template['category'] {
    const s = String(raw || '').toUpperCase();
    if (s === 'UTILITY') return 'UTILITY' as any;
    if (s === 'AUTHENTICATION') return 'AUTHENTICATION' as any;
    return 'MARKETING' as any;
  }

  private mapRemoteTemplateType(raw: unknown): TemplateType {
    const s = String(raw || '').toUpperCase();
    if (['CAROUSEL', 'IMAGE', 'VIDEO', 'DOCUMENT'].includes(s)) return s as TemplateType;
    return TemplateType.TEXT;
  }

  private rejectionReasonOf(r: GupshupRemoteTemplate): string | undefined {
    if (r.rejection_reason) return r.rejection_reason;
    if (typeof r.containerMeta === 'string') {
      try {
        const parsed = JSON.parse(r.containerMeta);
        return parsed?.rejection_reason || undefined;
      } catch {
        return undefined;
      }
    }
    return r.containerMeta?.rejection_reason || undefined;
  }

  /** Recover carousel card structure from the stringified containerMeta. */
  private parseContainerCards(r: GupshupRemoteTemplate): GupshupCarouselCard[] | null {
    let meta = r.containerMeta;
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch {
        return null;
      }
    }
    const cards = (meta as any)?.cards;
    return Array.isArray(cards) && cards.length > 0 ? cards : null;
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
   * Apply a template-status callback from Gupshup.
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
    const status = this.mapRemoteStatus(payload.status);

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
