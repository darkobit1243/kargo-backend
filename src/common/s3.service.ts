import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

@Injectable()
export class S3Service {
  private s3Client: S3Client | null = null;
  private bucketName: string;
  private region: string | null = null;
  private privateBucket: boolean;
  private signedUrlExpiresInSeconds: number;
  private readonly logger = new Logger(S3Service.name);

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME', '');

    this.privateBucket =
      this.configService.get<string>('AWS_S3_PRIVATE', 'true') === 'true';
    this.signedUrlExpiresInSeconds = parseInt(
      this.configService.get<string>('AWS_S3_SIGNED_URL_EXPIRES', '3600'),
      10,
    );

    const hasRegion = Boolean(region && region.trim().length > 0);
    const hasAccessKey = Boolean(accessKeyId && accessKeyId.trim().length > 0);
    const hasSecret = Boolean(secretAccessKey && secretAccessKey.trim().length > 0);
    const hasBucket = Boolean(this.bucketName && this.bucketName.trim().length > 0);

    if (hasRegion && hasAccessKey && hasSecret && hasBucket) {
      this.region = region!;
      // We asserted presence above; use non-null assertions to satisfy types
      this.s3Client = new S3Client({
        region: region!,
        credentials: {
          accessKeyId: accessKeyId!,
          secretAccessKey: secretAccessKey!,
        },
      } as any);
      this.logger.log(`S3 Service initialized for bucket: ${this.bucketName}`);
    } else {
      // Log which parts are missing (mask secrets)
      const parts = [
        `region=${hasRegion}`,
        `accessKey=${hasAccessKey}`,
        `secret=${hasSecret}`,
        `bucket=${hasBucket}`,
      ].join(', ');
      this.logger.warn(
        `AWS Credentials incomplete (${parts}). S3 upload will be skipped.`,
      );
    }
  }

  private assertReady(): void {
    if (!this.s3Client || !this.bucketName) {
      throw new Error('S3 client is not initialized');
    }
  }

  private isProbablyUrl(value: string): boolean {
    return value.startsWith('http://') || value.startsWith('https://');
  }

  private extractKeyFromS3Url(url: string): string | null {
    if (!this.bucketName) return null;
    if (!url.includes(`${this.bucketName}.s3`)) return null;
    const marker = '.amazonaws.com/';
    const idx = url.indexOf(marker);
    if (idx === -1) return null;
    const key = url.slice(idx + marker.length);
    return key ? decodeURIComponent(key) : null;
  }

  async getSignedGetUrl(
    key: string,
    expiresInSeconds: number = this.signedUrlExpiresInSeconds,
  ): Promise<string> {
    this.assertReady();
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return getSignedUrl(this.s3Client!, command, { expiresIn: expiresInSeconds });
  }

  async getSignedPutUrl(params: {
    contentType: string;
    pathPrefix?: string;
    extension?: string;
    expiresInSeconds?: number;
  }): Promise<{ key: string; url: string; headers: Record<string, string> }> {
    this.assertReady();

    const prefix = (params.pathPrefix ?? 'uploads').replace(/(^\/|\/$)/g, '');
    const ext = (params.extension ?? 'bin').replace(/^\./, '');
    const key = `${prefix}/${randomUUID()}.${ext}`;

    const input: PutObjectCommandInput = {
      Bucket: this.bucketName,
      Key: key,
      ContentType: params.contentType,
    };

    const command = new PutObjectCommand(input);
    const url = await getSignedUrl(this.s3Client!, command, {
      expiresIn: params.expiresInSeconds ?? this.signedUrlExpiresInSeconds,
    });

    return {
      key,
      url,
      headers: {
        'Content-Type': params.contentType,
      },
    };
  }

  async toDisplayUrl(value: string): Promise<string> {
    if (!value) return value;
    if (value.startsWith('data:')) return value; // base64 payload

    if (this.isProbablyUrl(value)) {
      if (!this.privateBucket) return value;
      const keyFromUrl = this.extractKeyFromS3Url(value);
      if (!keyFromUrl) return value;
      return this.getSignedGetUrl(keyFromUrl);
    }

    // Treat as S3 key
    if (!this.privateBucket) {
      // Public bucket: derive standard URL
      const region = this.region ?? this.configService.get<string>('AWS_REGION');
      // Do not encode '/' in keys; S3 object keys commonly contain path segments.
      return `https://${this.bucketName}.s3.${region}.amazonaws.com/${value}`;
    }
    return this.getSignedGetUrl(value);
  }

  async toDisplayUrls(values: string[]): Promise<string[]> {
    return Promise.all((values ?? []).map((v) => this.toDisplayUrl(v)));
  }

  async uploadBase64(
    base64String: string,
    pathPrefix: string = 'uploads',
  ): Promise<string> {
    if (!this.s3Client) {
      this.logger.warn(
        'S3 Client is not initialized. Returning original string.',
      );
      return base64String; // Fallback to storing base64 if S3 fails/missing
    }

    // Check header
    // e.g. "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
    const matches = base64String.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      // Not a valid base64 or already a URL
      return base64String;
    }

    const contentType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    // Extract extension form mime type (image/jpeg -> jpeg)
    const subtype = contentType.split('/')[1] || 'bin';
    const extension = subtype === 'jpeg' ? 'jpg' : subtype;

    const key = `${pathPrefix}/${randomUUID()}.${extension}`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        // ACL: 'public-read', // Bucket policy governs this usually
      });

      await this.s3Client.send(command);

      // Store key in DB; convert to URL (signed/public) when returning to clients.
      return key;
    } catch (e) {
      this.logger.error(`S3 Upload failed: ${e}`);
      throw e;
    }
  }
}
