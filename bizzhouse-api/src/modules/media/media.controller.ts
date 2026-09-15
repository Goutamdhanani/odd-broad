import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { MediaService } from './media.service';
import { GupshupService } from '../gupshup/gupshup.service';
import { GupshupApp } from '../gupshup/entities/gupshup-app.entity';

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // Gupshup's documented limit

/** Minimal shape of the multer file upload (@types/express v5 dropped the Multer namespace). */
interface UploadedMediaFile {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}

/** Media types WhatsApp session messages support (Meta Cloud API). */
const SENDABLE_MEDIA_PREFIXES = ['image/', 'video/', 'audio/', 'application/'];

/**
 * Authenticated media access + outbound upload. Objects are stored under
 * shops/{shopId}/... and streamed only to callers of that shop (or a
 * platform admin).
 */
@Controller('media')
@UseGuards(AuthGuard('jwt'))
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly gupshupService: GupshupService,
    @InjectRepository(GupshupApp)
    private readonly gupshupAppRepo: Repository<GupshupApp>,
  ) {}

  @Get('*')
  async serve(@Req() req: any, @Res() res: Response): Promise<void> {
    // Derive the object key from the request path (robust across
    // Express wildcard param shapes): /api/media/<key>
    const marker = '/media/';
    const idx = req.originalUrl.indexOf(marker);
    const key = idx >= 0 ? req.originalUrl.slice(idx + marker.length).split('?')[0] : '';

    const { stream, contentType, length } = await this.mediaService.streamFor(key, {
      shopId: req.user?.shopId ?? null,
      role: req.user?.role,
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    if (length) res.setHeader('Content-Length', String(length));
    stream.pipe(res);
  }

  /**
   * Upload a file for OUTBOUND sending (inbox composer attach).
   *
   * Two things happen, both required for a real send:
   * 1. The file is stored in object storage under the shop's scope — this
   *    URL is what message history renders forever.
   * 2. The file is uploaded to Gupshup for every live number's app — the
   *    returned mediaId is what actually goes on the wire (Meta id-based
   *    media send; our storage URLs are not publicly fetchable).
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadOutbound(
    @Req() req: any,
    @UploadedFile() file?: UploadedMediaFile,
    @Body('fileType') fileType?: string,
  ) {
    const shopId: string | undefined = req.user?.shopId;
    if (!shopId) {
      throw new BadRequestException('Media upload requires a shop context');
    }
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('file (multipart) is required');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `File exceeds the 100MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`,
      );
    }
    const mimeType = fileType || file.mimetype;
    if (!mimeType || !SENDABLE_MEDIA_PREFIXES.some((p) => mimeType.startsWith(p))) {
      throw new BadRequestException(
        `Unsupported media type '${mimeType}' — send images, video, audio or documents`,
      );
    }

    // 1. Durable copy for history rendering
    const stored = await this.mediaService.storeOutbound(shopId, {
      buffer: file.buffer,
      mimetype: mimeType,
      originalname: file.originalname,
    });

    // 2. Real Gupshup mediaIds per live app (id-based send)
    const liveApps = await this.gupshupAppRepo.find({
      where: { shopId, wabaStatus: 'live' },
    });
    if (liveApps.length === 0) {
      throw new BadRequestException(
        'No live WhatsApp number connected — complete onboarding before sending media',
      );
    }

    const mediaIds: Record<string, string> = {};
    let lastError: string | null = null;
    for (const app of liveApps) {
      try {
        const res = await this.gupshupService.uploadMedia(
          app.gupshupAppId,
          mimeType,
          file.buffer,
          file.originalname,
        );
        mediaIds[app.gupshupAppId] = res.mediaId;
      } catch (err: any) {
        lastError = err?.message;
      }
    }
    if (Object.keys(mediaIds).length === 0) {
      throw new BadRequestException(
        `Gupshup media upload failed: ${lastError ?? 'unknown error'}`,
      );
    }

    return {
      url: stored.internalUrl,
      mediaKey: stored.key,
      mimeType,
      filename: file.originalname,
      mediaId: Object.values(mediaIds)[0],
      mediaIds,
    };
  }
}
