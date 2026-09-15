import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { Readable } from 'stream';

export interface PersistResult {
  stored: boolean;
  key?: string;
  internalUrl?: string;
  reason?: string;
}

/**
 * Durable media storage (doc §5/§73): WhatsApp provider media URLs expire
 * quickly, so inbound media is downloaded and re-hosted in MinIO/S3 under a
 * shop-scoped key. Access goes through the authenticated /media endpoint —
 * a shop can only read objects under shops/{its own id}/.
 */
@Injectable()
export class MediaService implements OnModuleInit {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('s3.bucket') || 'bizzhouse-media';
    this.s3 = new S3Client({
      endpoint: this.config.get<string>('s3.endpoint') || 'http://localhost:9000',
      region: this.config.get<string>('s3.region') || 'us-east-1',
      forcePathStyle: true, // MinIO
      credentials: {
        accessKeyId: this.config.get<string>('s3.accessKey') || '',
        secretAccessKey: this.config.get<string>('s3.secretKey') || '',
      },
    });
  }

  async onModuleInit() {
    // Best-effort bucket bootstrap (docker-compose MinIO starts empty)
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created storage bucket: ${this.bucket}`);
      } catch (err: any) {
        this.logger.warn(`Could not ensure media bucket: ${err?.message}`);
      }
    }
  }

  /**
   * Download a provider media URL and re-host it under a shop-scoped key,
   * then rewrite the message payload to the internal URL. Never throws to
   * the webhook pipeline — failures keep the original (expiring) URL and
   * are logged.
   */
  async persistFromMessage(
    shopId: string,
    messageId: string,
    updatePayload: (patch: Record<string, unknown>) => Promise<void>,
    mediaUrl?: string,
    _filename?: string,
  ): Promise<PersistResult> {
    if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl)) {
      return { stored: false, reason: 'no-downloadable-url' };
    }

    try {
      const res = await axios.get<ArrayBuffer>(mediaUrl, {
        responseType: 'arraybuffer',
        timeout: 20000,
        maxContentLength: 25 * 1024 * 1024, // 25 MB guard
      });

      const contentType = String(
        res.headers['content-type'] || 'application/octet-stream',
      ).split(';')[0];
      const ext = this.extFor(contentType);
      const key = `shops/${shopId}/${messageId}/media${ext}`;

      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: Buffer.from(res.data),
          ContentType: contentType,
        }),
      );

      const internalUrl = `/api/media/${key}`;
      await updatePayload({ mediaUrl: internalUrl, mediaStored: true, mediaKey: key });

      this.logger.log(`Media persisted for message ${messageId}: ${key}`);
      return { stored: true, key, internalUrl };
    } catch (err: any) {
      this.logger.warn(
        `Media re-host failed for message ${messageId}: ${err?.message} — keeping provider URL`,
      );
      return { stored: false, reason: err?.message?.slice(0, 200) };
    }
  }

  /**
   * Stream an object back to an authenticated caller. Enforces tenant
   * access: the key MUST live under shops/{callerShopId}/ unless the
   * caller is a platform admin.
   */
  async streamFor(
    key: string,
    requester: { shopId: string | null; role: string },
  ): Promise<{ stream: Readable; contentType: string; length?: number }> {
    if (!key.startsWith(`shops/${requester.shopId}/`) && requester.role !== 'super_admin') {
      throw new ForbiddenException('You do not have access to this media');
    }

    try {
      const res = await this.s3.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      const body = res.Body as Readable;
      if (!body) throw new NotFoundException('Media object is empty');
      return {
        stream: body,
        contentType: res.ContentType || 'application/octet-stream',
        length: res.ContentLength,
      };
    } catch (err: any) {
      if (err instanceof ForbiddenException) throw err;
      if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NoSuchKey') {
        throw new NotFoundException('Media not found');
      }
      throw err;
    }
  }

  /**
   * Durable storage for OUTBOUND media the shop attaches in the composer.
   * Stored under shops/{shopId}/outbound/ so the message history keeps
   * rendering the attachment forever (provider-side copies are not
   * addressable by us). Returns the authenticated internal preview URL.
   */
  async storeOutbound(
    shopId: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<{ key: string; internalUrl: string; mimeType: string }> {
    if (!file?.buffer?.length) {
      throw new Error('storeOutbound requires non-empty file content');
    }
    const ext = this.extFor(file.mimetype) || this.extFromName(file.originalname);
    const key = `shops/${shopId}/outbound/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return { key, internalUrl: `/api/media/${key}`, mimeType: file.mimetype };
  }

  private extFromName(name: string): string {
    const dot = name?.lastIndexOf('.');
    return dot >= 0 ? name.slice(dot) : '';
  }

  private extFor(contentType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
      'video/mp4': '.mp4',
      'audio/ogg': '.ogg',
      'audio/mpeg': '.mp3',
      'application/pdf': '.pdf',
    };
    return map[contentType] || '';
  }
}
