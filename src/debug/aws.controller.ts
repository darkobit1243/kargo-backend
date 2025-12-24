import { Controller, Get, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('debug')
export class AwsDebugController {
  constructor(private readonly config: ConfigService) {}

  @Get('aws')
  getAws(): any {
    const env = process.env.NODE_ENV ?? 'development';
    if (env === 'production') throw new ForbiddenException();

    const region = this.config.get<string>('AWS_REGION');
    const accessKey = this.config.get<string>('AWS_ACCESS_KEY_ID');
    const secret = this.config.get<string>('AWS_SECRET_ACCESS_KEY');
    const bucket = this.config.get<string>('AWS_S3_BUCKET_NAME');

    const mask = (v?: string) => {
      if (!v) return null;
      const trimmed = v.trim();
      if (trimmed.length <= 6) return '***';
      return `${'*'.repeat(Math.max(0, trimmed.length - 4))}${trimmed.slice(-4)}`;
    };

    return {
      env,
      aws: {
        region: Boolean(region && region.trim().length > 0),
        accessKey: Boolean(accessKey && accessKey.trim().length > 0),
        secret: Boolean(secret && secret.trim().length > 0),
        bucket: Boolean(bucket && bucket.trim().length > 0),
        masks: {
          region: region ?? null,
          accessKey: mask(accessKey),
          secret: mask(secret),
          bucket: bucket ?? null,
        },
      },
    };
  }
}
