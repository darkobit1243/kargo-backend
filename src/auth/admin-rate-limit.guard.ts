import { Injectable, CanActivate, ExecutionContext, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

// Basit bir in-memory rate limit (production için redis önerilir)
const adminRateLimitMap = new Map<string, { count: number; last: number }>();
const RATE_LIMIT = 30; // 30 istek
const WINDOW_MS = 60 * 1000; // 1 dakika

@Injectable()
export class AdminRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AdminRateLimitGuard.name);
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as any;
    if (!user || user.role !== 'admin') return true;

    const key = user.sub || user.id;
    if (!key) return true;
    const now = Date.now();
    const entry = adminRateLimitMap.get(key) || { count: 0, last: now };
    if (now - entry.last > WINDOW_MS) {
      entry.count = 0;
      entry.last = now;
    }
    entry.count++;
    adminRateLimitMap.set(key, entry);
    if (entry.count > RATE_LIMIT) {
      this.logger.warn(`Admin rate limit exceeded: ${user.email}`);
      throw new HttpException('Admin rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
