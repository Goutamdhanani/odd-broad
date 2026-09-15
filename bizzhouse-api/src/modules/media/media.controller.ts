import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { MediaService } from './media.service';

/**
 * Authenticated media access. Objects are stored under
 * shops/{shopId}/... and streamed only to callers of that shop
 * (or a platform admin).
 */
@Controller('media')
@UseGuards(AuthGuard('jwt'))
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

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
}
