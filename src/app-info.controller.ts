import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('app')
export class AppInfoController {
  constructor(private config: ConfigService) {}

  @Get('version')
  getVersion() {
    // Versiyon bilgisini package.json'dan veya env'den okuyabilirsin
    const version = this.config.get<string>('APP_VERSION') ?? '1.0.0';
    return {
      version,
      message: 'Güncel uygulama versiyonu',
    };
  }
}
