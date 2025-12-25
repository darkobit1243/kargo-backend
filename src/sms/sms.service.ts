import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  private normalizeTrNationalPhone(input: string): string | null {
    const digits = (input ?? '').replace(/\D/g, '');
    if (!digits) return null;

    // Accept common TR formats:
    // - 0544...
    // - 544...
    // - +90544... / 90544...
    let tenDigits: string | null = null;

    if (digits.length === 10) {
      tenDigits = digits;
    } else if (digits.length === 11 && digits.startsWith('0')) {
      tenDigits = digits.slice(1);
    } else if (digits.length === 12 && digits.startsWith('90')) {
      tenDigits = digits.slice(2);
    }

    if (!tenDigits || tenDigits.length !== 10) return null;
    if (!/^5\d{9}$/.test(tenDigits)) return null; // mobile numbers start with 5

    return `0${tenDigits}`; // 11-digit national format
  }

  async sendSms(toPhone: string, message: string): Promise<void> {
    const to = (toPhone ?? '').trim();
    if (!to) throw new Error('SMS recipient phone is empty');

    const normalized = this.normalizeTrNationalPhone(to);
    if (!normalized) {
      throw new Error(`Invalid TR phone number (expected 0544...): '${to}'`);
    }

    const body = (message ?? '').trim();
    if (!body) throw new Error('SMS message is empty');

    // For now we don't integrate a paid SMS provider.
    // We'll switch this to Firebase Auth (phone) flow later.
    this.logger.warn(`SMS_MOCK: to=${normalized} message=${body}`);
  }
}
