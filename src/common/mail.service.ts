import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private from: string;
  private transportLabel = 'disabled';
  private verifyOnBoot = false;
  private verifyOnBootReady = false;

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

    const secureDefault = port === 465;
    const secure =
      this.config.get<string>('SMTP_SECURE', secureDefault ? 'true' : 'false') ===
      'true';

    const requireTLS = this.config.get<string>('SMTP_REQUIRE_TLS', 'false') === 'true';
    const rejectUnauthorized =
      this.config.get<string>('SMTP_TLS_REJECT_UNAUTHORIZED', 'true') === 'true';

    const connectionTimeout = Number(
      this.config.get<string>('SMTP_CONNECTION_TIMEOUT_MS', '15000'),
    );
    const greetingTimeout = Number(
      this.config.get<string>('SMTP_GREETING_TIMEOUT_MS', '15000'),
    );
    const socketTimeout = Number(
      this.config.get<string>('SMTP_SOCKET_TIMEOUT_MS', '30000'),
    );
    const debug = this.config.get<string>('SMTP_DEBUG', 'false') === 'true';
    const pool = this.config.get<string>('SMTP_POOL', 'false') === 'true';

    this.verifyOnBoot =
      this.config.get<string>('SMTP_VERIFY_ON_BOOT', 'false') === 'true';

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

    const transportBase = {
      auth: { user: resolvedUser, pass: resolvedPass },
      secure,
      requireTLS,
      pool,
      connectionTimeout,
      greetingTimeout,
      socketTimeout,
      logger: debug,
      debug,
      tls: { rejectUnauthorized },
    } as const;

    if (host) {
      this.transporter = nodemailer.createTransport({
        ...transportBase,
        host,
        port,
      });
      this.transportLabel = `smtp host=${host} port=${port} secure=${secure}`;
      this.logger.log(
        `MailService initialized (${this.transportLabel} requireTLS=${requireTLS} pool=${pool}).`,
      );
      return;
    }

    // If SMTP_HOST is not provided, default to Gmail transporter.
    // Note: some hosts block outbound SMTP ports; consider using an email API provider if you keep getting ETIMEDOUT.
    this.transporter = nodemailer.createTransport({
      ...transportBase,
      service: 'gmail',
    });
    this.transportLabel = `service=gmail secure=${secure}`;
    this.logger.log(
      `MailService initialized (${this.transportLabel} requireTLS=${requireTLS} pool=${pool}).`,
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.transporter || !this.verifyOnBoot || this.verifyOnBootReady) return;
    this.verifyOnBootReady = true;

    try {
      await this.transporter.verify();
      this.logger.log(`MailService SMTP verify OK (${this.transportLabel}).`);
    } catch (e) {
      this.logger.error(`MailService SMTP verify FAILED (${this.transportLabel}).`, e as Error);
    }
  }

  get isEnabled(): boolean {
    return this.transporter != null;
  }

  async sendMail(params: { to: string; subject: string; text: string; html?: string }): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`MAIL_MOCK: to=${params.to} subject=${params.subject} text=${params.text}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      });
    } catch (e) {
      const err = e as { code?: string; command?: string; message?: string };
      this.logger.error(
        `MailService sendMail failed (${this.transportLabel}) code=${err.code ?? 'n/a'} command=${err.command ?? 'n/a'}`,
        e as Error,
      );
      throw e;
    }
  }
}
