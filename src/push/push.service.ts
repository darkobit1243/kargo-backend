import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import * as admin from 'firebase-admin';

@Injectable()
export class PushService {
  private initialized = false;
  private enabled = false;

  private static readonly kDefaultAndroidChannelId = 'bitasi_default';

  constructor(private readonly config: ConfigService) {
    this.init();
  }

  private init() {
    if (this.initialized) return;
    this.initialized = true;

    const json = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
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

      // No credentials configured.
      this.enabled = false;
    } catch (_) {
      this.enabled = false;
    }
  }

  async sendToToken(params: {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<boolean> {
    if (!this.enabled) return false;
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
      return false;
    }
  }
}
