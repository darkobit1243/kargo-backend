import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/public.decorator';

@Controller('debug')
export class AwsDebugController {
  constructor(private readonly config: ConfigService) {}

  @Get('aws')
  @Public()
  getAws(): any {
    const env = process.env.NODE_ENV ?? 'development';
    const allow = this.config.get<string>('DEBUG_ALLOW_AWS', 'false') === 'true';
    if (env === 'production' && !allow) {
      return {
        env,
        enabled: false,
        reason: 'Disabled in production unless DEBUG_ALLOW_AWS=true',
      };
    }

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
      enabled: true,
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
