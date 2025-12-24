import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

@Injectable()
export class S3Service {
  private s3Client: S3Client | null = null;
  private bucketName: string;
  private readonly logger = new Logger(S3Service.name);

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME', '');

    const hasRegion = Boolean(region && region.trim().length > 0);
    const hasAccessKey = Boolean(accessKeyId && accessKeyId.trim().length > 0);
    const hasSecret = Boolean(secretAccessKey && secretAccessKey.trim().length > 0);
    const hasBucket = Boolean(this.bucketName && this.bucketName.trim().length > 0);

    if (hasRegion && hasAccessKey && hasSecret && hasBucket) {
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

      const region = this.configService.get<string>('AWS_REGION');
      const url = `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;
      return url;
    } catch (e) {
      this.logger.error(`S3 Upload failed: ${e}`);
      throw e;
    }
  }
}
