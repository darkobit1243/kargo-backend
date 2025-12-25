import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import * as https from 'node:https';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private from: string;
  private transportLabel = 'disabled';
  private verifyOnBoot = false;
  private verifyOnBootReady = false;
  private resendApiKey: string | null = null;
  private useResend = false;

  constructor(private readonly config: ConfigService) {
    const enabled = this.config.get<string>('SMTP_ENABLED', 'false') === 'true';

    const transport = (this.config.get<string>('MAIL_TRANSPORT', 'smtp') ?? 'smtp')
      .trim()
      .toLowerCase();
    this.useResend = transport === 'resend';

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

    if (this.useResend) {
      const apiKey = (this.config.get<string>('RESEND_API_KEY', '') ?? '').trim();
      if (!apiKey) {
        this.logger.warn('MailService enabled (MAIL_TRANSPORT=resend) but RESEND_API_KEY is missing.');
        return;
      }

      if (!this.from) {
        this.logger.warn('MailService enabled (MAIL_TRANSPORT=resend) but EMAIL_FROM/SMTP_FROM is missing.');
        return;
      }

      this.resendApiKey = apiKey;
      this.transporter = null;
      this.transportLabel = 'resend api';
      this.logger.log('MailService initialized (transport=resend api).');
      return;
    }

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
    return this.transporter != null || this.resendApiKey != null;
  }

  async sendMail(params: { to: string; subject: string; text: string; html?: string }): Promise<void> {
    if (this.resendApiKey) {
      await this.sendViaResend(params);
      return;
    }

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

  private async sendViaResend(params: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void> {
    const apiKey = this.resendApiKey;
    if (!apiKey) {
      this.logger.warn('MAIL_MOCK (resend): missing RESEND_API_KEY');
      return;
    }

    const payload = {
      from: this.from,
      to: [params.to],
      subject: params.subject,
      text: params.text,
      html: params.html,
    };

    try {
      const { statusCode, body } = await this.httpsJsonRequest({
        method: 'POST',
        hostname: 'api.resend.com',
        path: '/emails',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: payload,
        timeoutMs: Number(this.config.get<string>('RESEND_TIMEOUT_MS', '15000')),
      });

      if (!statusCode || statusCode >= 400) {
        this.logger.error(
          `MailService sendViaResend failed status=${statusCode ?? 'n/a'} body=${body ?? ''}`,
        );
        throw new Error(`Resend error status=${statusCode ?? 'n/a'}`);
      }
    } catch (e) {
      this.logger.error('MailService sendViaResend failed', e as Error);
      throw e;
    }
  }

  private httpsJsonRequest(opts: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    hostname: string;
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs: number;
  }): Promise<{ statusCode?: number; body?: string }>
  {
    const bodyString = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string> = {
      ...(opts.headers ?? {}),
    };
    if (bodyString) {
      headers['Content-Length'] = Buffer.byteLength(bodyString).toString();
    }

    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          method: opts.method,
          hostname: opts.hostname,
          path: opts.path,
          headers,
          timeout: opts.timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on('end', () => {
            const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined;
            resolve({ statusCode: res.statusCode, body });
          });
        },
      );

      req.on('timeout', () => {
        req.destroy(new Error('HTTPS request timeout'));
      });

      req.on('error', reject);

      if (bodyString) req.write(bodyString);
      req.end();
    });
  }
}
