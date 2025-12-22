import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  async sendSms(toPhone: string, message: string): Promise<void> {
    const to = (toPhone ?? '').trim();
    if (!to) throw new Error('SMS recipient phone is empty');

    const body = (message ?? '').trim();
    if (!body) throw new Error('SMS message is empty');

    // For now we don't integrate a paid SMS provider.
    // We'll switch this to Firebase Auth (phone) flow later.
    this.logger.warn(`SMS_MOCK: to=${to} message=${body}`);
  }
}
