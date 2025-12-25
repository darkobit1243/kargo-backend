import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomInt } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, type UserRole } from './user.entity';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResetPasswordPhoneDto } from './dto/reset-password-phone.dto';
import { S3Service } from '../common/s3.service';
import { MailService } from '../common/mail.service';
import { SmsService } from '../sms/sms.service';
import * as admin from 'firebase-admin';

export type AuthResponseUser = {
  id: string;
  publicId?: number;
  email: string;
  role: UserRole;
  isVerified?: boolean;
  isActive?: boolean;
  fullName?: string;
  phone?: string;
  address?: string;
  companyName?: string;
  taxNumber?: string;
  taxOffice?: string;
  cityId?: string;
  districtId?: string;
  city?: string;
  district?: string;
  activityArea?: string;
  vehicleType?: string;
  vehiclePlate?: string;
  serviceArea?: string;
  rating?: number;
  deliveredCount?: number;
  avatarKey?: string;
  avatarUrl?: string;
};

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly s3Service: S3Service,
    private readonly mail: MailService,
    private readonly sms: SmsService,
  ) {}

  private async sanitize(user: User): Promise<AuthResponseUser> {
    const {
      id,
      publicId,
      email,
      role,
      isVerified,
      isActive,
      fullName,
      phone,
      address,
      companyName,
      taxNumber,
      taxOffice,
      cityId,
      districtId,
      city,
      district,
      activityArea,
      vehicleType,
      vehiclePlate,
      serviceArea,
      rating,
      deliveredCount,
      avatarUrl,
    } = user;
    const resolvedRole: UserRole = role ?? 'sender';
    return {
      id,
      publicId,
      email,
      role: resolvedRole,
      isVerified,
      isActive,
      fullName: fullName ?? undefined,
      phone: phone ?? undefined,
      address: address ?? undefined,
      companyName: companyName ?? undefined,
      taxNumber: taxNumber ?? undefined,
      taxOffice: taxOffice ?? undefined,
      cityId: cityId ?? undefined,
      districtId: districtId ?? undefined,
      city: city ?? undefined,
      district: district ?? undefined,
      activityArea: activityArea ?? undefined,
      vehicleType: vehicleType ?? undefined,
      vehiclePlate: vehiclePlate ?? undefined,
      serviceArea: serviceArea ?? undefined,
      rating,
      deliveredCount,
      avatarKey: avatarUrl ?? undefined,
      avatarUrl: avatarUrl ? await this.s3Service.toDisplayUrl(avatarUrl) : undefined,
    };
  }

  private async ensurePublicId(userId: string): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: { id: userId },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    if (existing.publicId != null) return existing;

    // Lazily assign a sequential publicId with a table lock to avoid duplicates.
    return this.usersRepository.manager.transaction(async (manager) => {
      const repo = manager.getRepository(User);
      const fresh = await repo.findOne({ where: { id: userId } });
      if (!fresh) {
        throw new NotFoundException('User not found');
      }
      if (fresh.publicId != null) return fresh;

      await manager.query('LOCK TABLE users IN EXCLUSIVE MODE');
      const rows = await manager.query(
        'SELECT COALESCE(MAX("publicId"), 0) + 1 AS next FROM users',
      );
      const next = Number(rows?.[0]?.next ?? 1);
      fresh.publicId = next;
      return repo.save(fresh);
    });
  }

  private signToken(user: User): string {
    const resolvedRole: UserRole = user.role ?? 'sender';
    return this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: resolvedRole,
    });
  }

  private findUserByEmail(email: string): Promise<User | null> {
    const normalized = (email ?? '').trim().toLowerCase();
    if (!normalized) return Promise.resolve(null);
    return this.usersRepository
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: normalized })
      .getOne();
  }

  private async getFirebasePhoneByEmail(email: string): Promise<string | null> {
    const normalized = (email ?? '').trim().toLowerCase();
    if (!normalized) return null;
    if (admin.apps.length === 0) return null;
    try {
      const fbUser = await admin.auth().getUserByEmail(normalized);
      return (fbUser.phoneNumber ?? '').trim() || null;
    } catch {
      return null;
    }
  }

  private normalizeTrPhones(input: string): { e164: string; national: string; last10: string } | null {
    const digits = (input ?? '').replace(/\D/g, '');
    if (!digits) return null;

    let tenDigits: string | null = null;
    if (digits.length === 10) {
      tenDigits = digits;
    } else if (digits.length === 11 && digits.startsWith('0')) {
      tenDigits = digits.slice(1);
    } else if (digits.length === 12 && digits.startsWith('90')) {
      tenDigits = digits.slice(2);
    } else if (digits.length > 12) {
      // Fallback: use last 10 digits for messy stored formats.
      tenDigits = digits.slice(-10);
    }

    if (!tenDigits || tenDigits.length !== 10) return null;
    if (!/^5\d{9}$/.test(tenDigits)) return null;

    return {
      e164: `+90${tenDigits}`,
      national: `0${tenDigits}`,
      last10: tenDigits,
    };
  }

  private async findUserByPhone(phoneE164: string): Promise<User | null> {
    const raw = (phoneE164 ?? '').trim();
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    if (!digits) return null;

    // Match by the last 10 digits to ignore formatting differences:
    // 0544xxxxxxx, 544xxxxxxx, +90544xxxxxxx, 90544xxxxxxx
    const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
    if (last10.length !== 10) return null;

    // Compare by last 10 digits to avoid formatting mismatches (+90..., leading 0, spaces, dashes).
    return this.usersRepository
      .createQueryBuilder('u')
      .where('u.phone IS NOT NULL')
      .andWhere(`right(regexp_replace(u.phone, '\\D', '', 'g'), 10) = :last10`, {
        last10,
      })
      .getOne();
  }

  async requestPasswordReset(
    body: ForgotPasswordDto,
  ): Promise<{ ok: true; debugCode?: string; phoneE164?: string; phoneNational?: string }> {
    const email = (body?.email ?? '').trim();
    const user = await this.findUserByEmail(email);

    // Avoid user enumeration: always return ok.
    if (!user) {
      return { ok: true };
    }

    const channel = (this.config.get<string>('AUTH_RESET_CHANNEL', 'sms') ?? 'sms')
      .trim()
      .toLowerCase();

    // Channel: firebase (phone OTP)
    // Client will call Firebase Auth verifyPhoneNumber using the returned phoneE164.
    // After OTP verification, client calls /auth/reset-password-phone with idToken + newPassword.
    if (channel === 'firebase') {
      const phoneFromDb = (user?.phone ?? '').trim();
      const phoneFromFirebase = phoneFromDb ? null : await this.getFirebasePhoneByEmail(email);

      const phoneRaw = phoneFromDb || phoneFromFirebase || '';
      const normalized = phoneRaw ? this.normalizeTrPhones(phoneRaw) : null;
      if (!normalized) {
        console.error('[AUTH] Cannot start Firebase OTP reset: user.phone is empty/invalid');
        return { ok: true };
      }

      // Best-effort: sync DB phone from Firebase (only when missing).
      if (user && (!user.phone || !user.phone.trim().length) && phoneFromFirebase) {
        try {
          user.phone = normalized.e164;
          await this.usersRepository.save(user);
        } catch {
          // Ignore sync failures.
        }
      }
      return { ok: true, phoneE164: normalized.e164, phoneNational: normalized.national };
    }

    // Channels: sms/email (6-digit code)
    const code = randomInt(0, 1000000).toString().padStart(6, '0');
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    user.passwordResetCodeHash = codeHash;
    user.passwordResetExpiresAt = expiresAt;
    user.passwordResetUsedAt = null;
    await this.usersRepository.save(user);

    const subject = 'Şifre Sıfırlama Kodu';
    const text = `Şifre sıfırlama kodunuz: ${code}\n\nBu kod 5 dakika geçerlidir.`;
    const html = `
      <h2>Şifre Sıfırlama</h2>
      <p>Kodun:</p>
      <h1>${code}</h1>
      <p>Bu kod 5 dakika geçerlidir.</p>
    `;

    if (channel === 'email') {
      try {
        await this.mail.sendMail({
          to: user.email,
          subject,
          text,
          html,
        });
      } catch (e) {
        // Do not fail the request; avoid leaking system state.
        console.error('[AUTH] Failed to send reset email', e);
      }
    } else {
      const phone = (user.phone ?? '').trim();
      if (!phone) {
        console.error('[AUTH] Cannot send reset SMS: user.phone is empty');
      } else {
        const smsText = `Şifre sıfırlama kodun: ${code}. 5 dk geçerli.`;
        try {
          await this.sms.sendSms(phone, smsText);
        } catch (e) {
          // Do not fail the request; avoid leaking system state.
          console.error('[AUTH] Failed to send reset SMS', e);
        }
      }
    }

    if (this.config.get<string>('AUTH_LOG_RESET_CODE', 'false') === 'true') {
      console.log(`[AUTH] RESET_CODE: email=${user.email} code=${code} expiresAt=${expiresAt.toISOString()}`);
    }

    const debugReturn =
      this.config.get<string>('AUTH_RESET_DEBUG_RETURN_CODE', 'false') === 'true';
    return debugReturn ? { ok: true, debugCode: code } : { ok: true };
  }

  async resetPassword(body: ResetPasswordDto): Promise<void> {
    const email = (body?.email ?? '').trim();
    const code = (body?.code ?? '').trim();
    const newPassword = (body?.newPassword ?? '').trim();

    const user = await this.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid code');
    }

    const expiresAt = user.passwordResetExpiresAt;
    const usedAt = user.passwordResetUsedAt;
    const codeHash = user.passwordResetCodeHash;

    if (!expiresAt || !codeHash || usedAt) {
      throw new UnauthorizedException('Invalid code');
    }
    if (expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Code expired');
    }

    const ok = await bcrypt.compare(code, codeHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid code');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetUsedAt = new Date();
    user.passwordResetCodeHash = null;
    user.passwordResetExpiresAt = null;

    // Invalidate refresh token (force re-login)
    user.refreshToken = randomBytes(64).toString('hex');

    await this.usersRepository.save(user);
  }

  // Firebase Phone OTP doğrulaması sonrası (client tarafı), ID token'ı doğrular ve DB şifresini günceller.
  async resetPasswordWithPhone(body: ResetPasswordPhoneDto): Promise<void> {
    const idToken = (body?.idToken ?? '').trim();
    const newPassword = (body?.newPassword ?? '').trim();
    if (!idToken) {
      throw new UnauthorizedException('Missing token');
    }

    if (!newPassword) {
      throw new UnauthorizedException('Missing password');
    }

    if (admin.apps.length === 0) {
      // Firebase Admin credentials are missing; cannot verify token.
      throw new UnauthorizedException('Firebase admin not initialized');
    }

    const decoded = await admin.auth().verifyIdToken(idToken);
    const phoneNumber = (decoded as any)?.phone_number as string | undefined;
    if (!phoneNumber) {
      throw new UnauthorizedException('Token has no phone_number');
    }

    const user = await this.findUserByPhone(phoneNumber);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.refreshToken = randomBytes(64).toString('hex');
    user.passwordResetUsedAt = new Date();
    user.passwordResetCodeHash = null;
    user.passwordResetExpiresAt = null;
    await this.usersRepository.save(user);
  }

  async register(
    user: RegisterUserDto,
  ): Promise<{ token: string; refreshToken: string; role: UserRole; user: AuthResponseUser }> {
    if (this.config.get<string>('AUTH_LOG_REGISTER', 'false') === 'true') {
      console.log('[AUTH] register payload', {
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        phone: user.phone,
        address: user.address,
        companyName: user.companyName,
        taxNumber: user.taxNumber,
        taxOffice: user.taxOffice,
        activityArea: user.activityArea,
        cityId: user.cityId,
        districtId: user.districtId,
        city: user.city,
        district: user.district,
        hasAvatarUrl: Boolean(user.avatarUrl),
      });
    }

    const existing = await this.usersRepository.findOne({
      where: { email: user.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashed = await bcrypt.hash(user.password, 10);
    const newUser = this.usersRepository.create({
      email: user.email,
      password: hashed,
      role: user.role,
      fullName: user.fullName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      rating: user.rating,
      deliveredCount: user.deliveredCount,
      address: user.address,
      companyName: user.companyName,
      taxNumber: user.taxNumber,
      taxOffice: user.taxOffice,
      cityId: user.cityId,
      districtId: user.districtId,
      city: user.city,
      district: user.district,
      activityArea: user.activityArea,
      vehicleType: user.vehicleType,
      vehiclePlate: user.vehiclePlate,
      serviceArea: user.serviceArea,
    });

    // Assign sequential publicId at creation time.
    const saved = await this.usersRepository.manager.transaction(
      async (manager) => {
        await manager.query('LOCK TABLE users IN EXCLUSIVE MODE');
        const rows = await manager.query(
          'SELECT COALESCE(MAX("publicId"), 0) + 1 AS next FROM users',
        );
        const next = Number(rows?.[0]?.next ?? 1);
        const repo = manager.getRepository(User);
        const created = repo.create({ ...newUser, publicId: next });
        return repo.save(created);
      },
    );
    // Refresh token üret ve kaydet
    const refreshToken = randomBytes(64).toString('hex');
    saved.refreshToken = refreshToken;
    await this.usersRepository.save(saved);
    return {
      token: this.signToken(saved),
      refreshToken,
      role: saved.role,
      user: await this.sanitize(saved),
    };
  }

  async updateMe(
    userId: string,
    update: {
      avatarUrl?: string | null;
      fullName?: string | null;
      phone?: string | null;
      address?: string | null;
      companyName?: string | null;
      taxNumber?: string | null;
      taxOffice?: string | null;
      cityId?: string | null;
      districtId?: string | null;
      city?: string | null;
      district?: string | null;
      activityArea?: string | null;
      vehicleType?: string | null;
      vehiclePlate?: string | null;
      serviceArea?: string | null;
    },
  ): Promise<AuthResponseUser> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    if (Object.prototype.hasOwnProperty.call(update, 'avatarUrl')) {
      const next = update.avatarUrl;
      user.avatarUrl = next && next.trim().length ? next.trim() : null;
    }

    const setNullableTrimmed = (
      key: keyof typeof update,
      assign: (v: string | null) => void,
    ) => {
      if (!Object.prototype.hasOwnProperty.call(update, key)) return;
      const raw = update[key];
      if (raw == null) {
        assign(null);
        return;
      }
      const t = String(raw).trim();
      assign(t.length ? t : null);
    };

    setNullableTrimmed('fullName', (v) => (user.fullName = v));
    setNullableTrimmed('phone', (v) => (user.phone = v));
    setNullableTrimmed('address', (v) => (user.address = v));
    setNullableTrimmed('companyName', (v) => (user.companyName = v));
    setNullableTrimmed('taxNumber', (v) => (user.taxNumber = v));
    setNullableTrimmed('taxOffice', (v) => (user.taxOffice = v));
    setNullableTrimmed('cityId', (v) => (user.cityId = v));
    setNullableTrimmed('districtId', (v) => (user.districtId = v));
    setNullableTrimmed('city', (v) => (user.city = v));
    setNullableTrimmed('district', (v) => (user.district = v));
    setNullableTrimmed('activityArea', (v) => (user.activityArea = v));
    setNullableTrimmed('vehicleType', (v) => (user.vehicleType = v));
    setNullableTrimmed('vehiclePlate', (v) => (user.vehiclePlate = v));
    setNullableTrimmed('serviceArea', (v) => (user.serviceArea = v));

    const saved = await this.usersRepository.save(user);
    return this.sanitize(saved);
  }

  async login(user: {
    email: string;
    password: string;
  }): Promise<{ token: string; refreshToken: string; role: UserRole; user: AuthResponseUser }> {
    const found = await this.usersRepository.findOne({
      where: { email: user.email },
    });
    if (!found) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.password || !found.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(user.password, found.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Refresh token üret ve kaydet
    const refreshToken = randomBytes(64).toString('hex');
    found.refreshToken = refreshToken;
    await this.usersRepository.save(found);
    return {
      token: this.signToken(found),
      refreshToken,
      role: found.role,
      user: await this.sanitize(found),
    };
  }

  async refreshToken(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
    // Refresh token ile kullanıcıyı bul
    const user = await this.usersRepository.findOne({ where: { refreshToken } });
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Yeni access token ve refresh token üret
    const newRefreshToken = randomBytes(64).toString('hex');
    user.refreshToken = newRefreshToken;
    await this.usersRepository.save(user);
    return {
      token: this.signToken(user),
      refreshToken: newRefreshToken,
    };
  }

  async findById(id: string): Promise<AuthResponseUser> {
    const user = await this.ensurePublicId(id);
    return this.sanitize(user);
  }

  async updateFcmToken(userId: string, token: string | null): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.fcmToken = token && token.trim().length > 0 ? token.trim() : null;
    await this.usersRepository.save(user);
  }
}
