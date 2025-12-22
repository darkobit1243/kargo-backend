import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { readFileSync } from 'node:fs';
import { isAbsolute, resolve as resolvePath } from 'node:path';

import * as admin from 'firebase-admin';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private initialized = false;
  private enabled = false;
  private warnedDisabled = false;

  private static readonly kDefaultAndroidChannelId = 'bitasi_default';

  constructor(private readonly config: ConfigService) {
    this.init();
  }

  private init() {
    if (this.initialized) return;
    this.initialized = true;

    const json = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    const jsonPath = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');

    try {
      if (admin.apps.length > 0) {
        this.enabled = true;
        return;
      }

      if (json && json.trim().startsWith('{')) {
        const creds = JSON.parse(json);
        admin.initializeApp({
          credential: admin.credential.cert(creds),
          projectId: creds.project_id ?? projectId,
        });
        this.enabled = true;
        return;
      }

      if (jsonPath && jsonPath.trim().length > 0) {
        const rawPath = jsonPath.trim();
        const fullPath = isAbsolute(rawPath) ? rawPath : resolvePath(process.cwd(), rawPath);
        const file = readFileSync(fullPath, 'utf8');
        const creds = JSON.parse(file);
        admin.initializeApp({
          credential: admin.credential.cert(creds),
          projectId: creds.project_id ?? projectId,
        });
        this.enabled = true;
        return;
      }

      // No credentials configured.
      this.enabled = false;
    } catch (_) {
      this.enabled = false;
    }

    if (!this.enabled && !this.warnedDisabled) {
      this.warnedDisabled = true;
      this.logger.warn(
        'Push disabled: FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH missing/invalid (FCM notifications will not be sent).',
      );
    }
  }

  async sendToToken(params: {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<boolean> {
    if (!this.enabled) {
      if (!this.warnedDisabled) {
        this.warnedDisabled = true;
        this.logger.warn(
          'Push disabled: FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH missing/invalid (FCM notifications will not be sent).',
        );
      }
      return false;
    }
    try {
      await admin.messaging().send({
        token: params.token,
        notification: {
          title: params.title,
          body: params.body,
        },
        android: {
          priority: 'high',
          notification: {
            channelId: PushService.kDefaultAndroidChannelId,
            clickAction: 'FLUTTER_NOTIFICATION_CLICK',
            sound: 'default',
          },
        },
        data: params.data,
      });
      return true;
    } catch (_) {
      // Avoid logging token/body for privacy.
      this.logger.debug('FCM send failed (see Firebase credentials / device token validity).');
      return false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
