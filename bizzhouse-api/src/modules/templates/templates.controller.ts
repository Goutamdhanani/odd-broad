import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  UploadedFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantContextInterceptor } from '../../common/interceptors/tenant-context.interceptor';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { TemplatesService } from './templates.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto/create-template.dto';
import { GupshupService } from '../gupshup/gupshup.service';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // Gupshup's documented limit

/** Minimal shape of the multer file upload (@types/express v5 dropped the Multer namespace). */
interface UploadedMediaFile {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}

@Controller('templates')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@UseInterceptors(TenantContextInterceptor)
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly gupshupService: GupshupService,
    @InjectRepository(GupshupApp)
    private readonly gupshupAppRepo: Repository<GupshupApp>,
  ) {}

  @Post()
  async create(
    @CurrentTenant('shopId') shopId: string,
    @Body() dto: CreateTemplateDto,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.templatesService.create(shopId, dto);
  }

  @Get()
  async findAll(@CurrentTenant('shopId') shopId: string) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.templatesService.findAllForShop(shopId);
  }

  /**
   * Pull the real template list from Gupshup for every live number —
   * updates statuses AND imports templates created outside this UI
   * (spec §2.2 "Sync").
   */
  @Post('sync')
  async sync(@CurrentTenant('shopId') shopId: string) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    const result = await this.templatesService.syncFromProvider(shopId);
    return {
      ...result,
      templates: await this.templatesService.findAllForShop(shopId),
    };
  }

  /**
   * Upload an image/video and get a REAL Gupshup mediaId — the mandatory
   * first step before creating any carousel card or media template
   * (spec §2.2 / §3.3.5). Multipart: file field + fileType form field.
   */
  @Post('media')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(
    @CurrentTenant('shopId') shopId: string,
    @UploadedFile() file?: UploadedMediaFile,
    @Body('fileType') fileType?: string,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('file (multipart) is required');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `File exceeds Gupshup's 100MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`,
      );
    }
    const type = fileType || file.mimetype;
    if (!type || !/^(image|video|audio|application)\//.test(type)) {
      throw new BadRequestException(
        `fileType must be a MIME type like image/jpeg (got '${type}')`,
      );
    }

    // Upload to every live number's app so the mediaId works wherever the
    // template gets submitted. Gupshup mediaIds are app-scoped.
    const liveApps = await this.gupshupAppRepo.find({
      where: { shopId, wabaStatus: 'live' },
    });
    if (liveApps.length === 0) {
      throw new BadRequestException(
        'No live WhatsApp number connected — complete onboarding before uploading template media',
      );
    }

    const mediaIds: Record<string, string> = {};
    let lastError: string | null = null;
    for (const app of liveApps) {
      try {
        const res = await this.gupshupService.uploadMedia(
          app.gupshupAppId,
          type,
          file.buffer,
          file.originalname,
        );
        mediaIds[app.gupshupAppId] = res.mediaId;
      } catch (err: any) {
        lastError = err?.message;
      }
    }

    const ids = Object.values(mediaIds);
    if (ids.length === 0) {
      throw new BadRequestException(
        `Gupshup media upload failed: ${lastError ?? 'unknown error'}`,
      );
    }

    return {
      mediaId: ids[0],
      mediaIds,
      status: 'success',
    };
  }

  @Get(':id')
  async findOne(
    @CurrentTenant('shopId') shopId: string,
    @Param('id') id: string,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.templatesService.findOne(shopId, id);
  }

  @Put(':id')
  async update(
    @CurrentTenant('shopId') shopId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    if (!shopId) {
      throw new BadRequestException('No shop associated with this account');
    }
    return this.templatesService.update(shopId, id, dto);
  }
}
