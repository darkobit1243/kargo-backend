import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private from: string;

  constructor(private readonly config: ConfigService) {
    const enabled = this.config.get<string>('SMTP_ENABLED', 'false') === 'true';

    if (!enabled) {
      this.logger.warn('MailService disabled (SMTP_ENABLED=false).');
      return;
    }

    const host = this.config.get<string>('SMTP_HOST', '');
    const port = Number(this.config.get<string>('SMTP_PORT', '587'));
    const smtpUser = this.config.get<string>('SMTP_USER', '');
    const smtpPass = this.config.get<string>('SMTP_PASS', '');
    const secure = this.config.get<string>('SMTP_SECURE', 'false') === 'true';

    // Gmail convenience: allow EMAIL_USER/EMAIL_PASS as an alternative to SMTP_USER/SMTP_PASS.
    const emailUser = this.config.get<string>('EMAIL_USER', '');
    const emailPass = this.config.get<string>('EMAIL_PASS', '');
    const resolvedUser = smtpUser || emailUser;
    const resolvedPass = smtpPass || emailPass;

    const smtpFrom = this.config.get<string>('SMTP_FROM', '');
    const emailFrom = this.config.get<string>('EMAIL_FROM', '');
    this.from = smtpFrom || emailFrom || resolvedUser;

    const hasBasicAuth = Boolean(resolvedUser && resolvedPass);

    if (!hasBasicAuth) {
      this.logger.warn('MailService enabled but SMTP auth is missing (SMTP_USER/PASS or EMAIL_USER/PASS).');
      return;
    }

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user: resolvedUser, pass: resolvedPass },
      });
      this.logger.log(
        `MailService initialized (SMTP host=${host} port=${port} secure=${secure}).`,
      );
      return;
    }

    // If SMTP_HOST is not provided, default to Gmail transporter.
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: resolvedUser, pass: resolvedPass },
    });
    this.logger.log('MailService initialized (service=gmail).');
  }

  get isEnabled(): boolean {
    return this.transporter != null;
  }

  async sendMail(params: { to: string; subject: string; text: string; html?: string }): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`MAIL_MOCK: to=${params.to} subject=${params.subject} text=${params.text}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
  }
}
