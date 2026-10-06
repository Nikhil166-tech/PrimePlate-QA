import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import {
  MealUsage,
  MealUsageStatus,
  MealUsageSource,
} from './meal-usage.entity';
import { MealUsageAudit } from './meal-usage-audit.entity';
import { MealProvider } from '../providers/meal-provider.entity';
import {
  Subscription,
  SubscriptionStatus,
} from '../subscriptions/subscription.entity';
import { User } from '../users/user.entity';

@Injectable()
export class MealUsageService {
  constructor(
    @InjectRepository(MealUsage)
    private readonly usageRepo: Repository<MealUsage>,
    @InjectRepository(MealUsageAudit)
    private readonly auditRepo: Repository<MealUsageAudit>,
    @InjectRepository(MealProvider)
    private readonly providerRepo: Repository<MealProvider>,
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Authoritative Indian Standard Time (IST) date string in 'YYYY-MM-DD' format.
   */
  getAuthoritativeIstDate(date: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  /**
   * Authoritative IST formatted time string, e.g. "12:42 PM".
   */
  getAuthoritativeIstTime(date: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  }

  /**
   * Formats a given Date or ISO string into IST time, e.g. "12:42 PM".
   */
  formatIstTime(dateOrStr?: Date | string | null): string {
    if (!dateOrStr) return '';
    const d = typeof dateOrStr === 'string' ? new Date(dateOrStr) : dateOrStr;
    if (isNaN(d.getTime())) return '';
    return this.getAuthoritativeIstTime(d);
  }

  /**
   * Generates a permanent cryptographically secure opaque QR token.
   */
  generateOpaqueQrToken(): string {
    return `pp_qr_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Provider fetches or generates their permanent QR code token and printable data URL.
   */
  async getOrCreateProviderQr(
    userId: string,
    providerId?: string,
  ): Promise<{
    providerId: string;
    providerName: string;
    qrToken: string;
    qrCodeDataUrl: string;
    qrDataUrl: string;
  }> {
    const where: any = providerId
      ? [
          { id: providerId, userId },
          { id: providerId, user: { id: userId } },
        ]
      : [{ userId }, { user: { id: userId } }];

    const provider = await this.providerRepo.findOne({
      where,
      relations: { user: true },
    });

    if (!provider) {
      throw new NotFoundException(
        'Provider kitchen not found or access denied',
      );
    }

    if (provider.user?.id !== userId && provider.userId !== userId) {
      throw new ForbiddenException('You do not own this provider kitchen');
    }

    if (!provider.qrToken) {
      provider.qrToken = this.generateOpaqueQrToken();
      await this.providerRepo.save(provider);
    }

    const qrCodeDataUrl = await QRCode.toDataURL(provider.qrToken, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    });

    return {
      providerId: provider.id,
      providerName: provider.name,
      qrToken: provider.qrToken,
      qrCodeDataUrl,
      qrDataUrl: qrCodeDataUrl,
    };
  }

  /**
   * Student scans provider QR. Validates student, QR token, provider, active subscription,
   * date window, and ensures exactly one check-in per calendar day per subscription.
   */
  async checkIn(
    studentId: string,
    qrToken: string,
    subscriptionId?: string,
  ): Promise<{
    code: 'CHECKED_IN' | 'ALREADY_CHECKED_IN';
    status: string;
    message: string;
    checkedInAt: string;
    mealDate: string;
    providerName?: string;
    planTitle?: string;
  }> {
    if (!qrToken || typeof qrToken !== 'string') {
      throw new BadRequestException("That isn't a valid PrimePlate meal QR.");
    }

    const cleanToken = qrToken.trim();
    if (!cleanToken.startsWith('pp_qr_')) {
      throw new BadRequestException("That isn't a valid PrimePlate meal QR.");
    }

    // 1. Resolve Provider from QR token
    const provider = await this.providerRepo.findOne({
      where: { qrToken: cleanToken },
    });
    if (!provider) {
      throw new BadRequestException("That isn't a valid PrimePlate meal QR.");
    }

    // 2. Fetch all subscriptions for this student
    const studentSubs = await this.subRepo.find({
      where: { student: { id: studentId } },
      relations: { mealPlan: { provider: true } },
      order: { createdAt: 'DESC' },
    });

    const todayIst = this.getAuthoritativeIstDate();

    // 3. Resolve active subscription for this provider
    let targetSub: Subscription;

    if (subscriptionId) {
      const found = studentSubs.find((s) => s.id === subscriptionId);
      if (!found || found.mealPlan?.provider?.id !== provider.id) {
        throw new BadRequestException(
          'This subscription does not belong to this provider.',
        );
      }
      if (found.status !== SubscriptionStatus.ACTIVE) {
        throw new BadRequestException("Your subscription isn't active today.");
      }
      const start = found.startDate;
      const end = found.endDate || found.startDate;
      if (todayIst < start || todayIst > end) {
        throw new BadRequestException("Your subscription isn't active today.");
      }
      targetSub = found;
    } else {
      const providerSubs = studentSubs.filter(
        (sub) => sub.mealPlan?.provider?.id === provider.id,
      );

      if (providerSubs.length === 0) {
        // Check if student has active subscriptions with OTHER providers
        const hasOtherActiveSub = studentSubs.some((sub) => {
          if (sub.status !== SubscriptionStatus.ACTIVE) return false;
          const start = sub.startDate;
          const end = sub.endDate || sub.startDate;
          return todayIst >= start && todayIst <= end;
        });

        if (hasOtherActiveSub) {
          throw new BadRequestException(
            "This meal QR isn't linked to your active subscription.",
          );
        } else {
          throw new BadRequestException(
            "You don't have an active subscription with this provider.",
          );
        }
      }

      // Filter provider subscriptions that are active today
      const validTodaySubs = providerSubs.filter((sub) => {
        if (sub.status !== SubscriptionStatus.ACTIVE) return false;
        const start = sub.startDate;
        const end = sub.endDate || sub.startDate;
        return todayIst >= start && todayIst <= end;
      });

      if (validTodaySubs.length === 0) {
        // Provider subscription exists, but is not active today (expired, not started, or inactive status)
        throw new BadRequestException("Your subscription isn't active today.");
      }

      if (validTodaySubs.length === 1) {
        targetSub = validTodaySubs[0];
      } else {
        // Multiple active subscriptions with this same provider (e.g. Lunch Only + Dinner Only)
        // Check existing check-ins today for all active subscriptions with this provider
        const existingUsages = await this.usageRepo.find({
          where: {
            subscriptionId: In(validTodaySubs.map((s) => s.id)),
            mealDate: todayIst,
          },
        });
        const checkedInSubIds = new Set(
          existingUsages.map((u) => u.subscriptionId),
        );

        // Pick the first subscription that has NOT checked in today
        const unconsumedSub = validTodaySubs.find(
          (s) => !checkedInSubIds.has(s.id),
        );

        if (unconsumedSub) {
          targetSub = unconsumedSub;
        } else {
          // All active subscriptions have already been checked in today
          const lastUsage = existingUsages[0];
          const timeStr = this.formatIstTime(
            lastUsage?.scannedAt || lastUsage?.createdAt || new Date(),
          );
          return {
            code: 'ALREADY_CHECKED_IN',
            status: lastUsage?.status || MealUsageStatus.USED,
            message:
              "You're already checked in! Your meal for today has already been recorded.",
            checkedInAt: timeStr,
            mealDate: todayIst,
            providerName: provider.name,
            planTitle: validTodaySubs[0].mealPlan?.title,
          };
        }
      }
    }

    // 4. Check for existing check-in today for this subscription (Application Level Check)
    const existingUsageToday = await this.usageRepo.findOne({
      where: {
        subscriptionId: targetSub.id,
        mealDate: todayIst,
      },
    });

    if (existingUsageToday) {
      const timeStr = this.formatIstTime(
        existingUsageToday.scannedAt || existingUsageToday.createdAt,
      );
      return {
        code: 'ALREADY_CHECKED_IN',
        status: existingUsageToday.status,
        message:
          "You're already checked in! Your meal for today has already been recorded.",
        checkedInAt: timeStr,
        mealDate: todayIst,
        providerName: provider.name,
        planTitle: targetSub.mealPlan?.title,
      };
    }

    // 5. Atomic Insertion with Database Unique Constraint protection
    try {
      const newUsage = this.usageRepo.create({
        studentId,
        subscriptionId: targetSub.id,
        providerId: provider.id,
        mealDate: todayIst,
        status: MealUsageStatus.USED,
        source: MealUsageSource.QR_SCAN,
        scannedAt: new Date(),
      });

      const saved = await this.usageRepo.save(newUsage);
      const timeStr = this.formatIstTime(saved.scannedAt || saved.createdAt);

      return {
        code: 'CHECKED_IN',
        status: MealUsageStatus.USED,
        message: '🍱 Meal Checked In! Your meal for today has been recorded.',
        checkedInAt: timeStr,
        mealDate: todayIst,
        providerName: provider.name,
        planTitle: targetSub.mealPlan?.title,
      };
    } catch (err: any) {
      // Catch PostgreSQL / SQLite unique constraint violation on (subscriptionId, mealDate)
      const isUniqueViolation =
        err?.code === '23505' ||
        err?.message?.includes('UQ_meal_usages_subscription_date') ||
        err?.message?.includes('UQ_meal_usages_student_date') ||
        err?.message?.includes('UNIQUE constraint failed') ||
        err?.message?.includes('duplicate key');

      if (isUniqueViolation) {
        // Concurrency / duplicate scan race condition safely converted to ALREADY_CHECKED_IN
        const usageAfterRace = await this.usageRepo.findOne({
          where: {
            subscriptionId: targetSub.id,
            mealDate: todayIst,
          },
        });
        const timeStr = this.formatIstTime(
          usageAfterRace?.scannedAt || usageAfterRace?.createdAt || new Date(),
        );

        return {
          code: 'ALREADY_CHECKED_IN',
          status: usageAfterRace?.status || MealUsageStatus.USED,
          message:
            "You're already checked in! Your meal for today has already been recorded.",
          checkedInAt: timeStr,
          mealDate: todayIst,
          providerName: provider.name,
          planTitle: targetSub.mealPlan?.title,
        };
      }

      throw err;
    }
  }

  /**
   * Returns the student's meal checklist and daily usage records for active and past subscriptions.
   * Pure database read: no external calls or background mutations.
   */
  async getStudentHistory(studentId: string): Promise<any[]> {
    const subscriptions = await this.subRepo.find({
      where: { student: { id: studentId } },
      relations: { mealPlan: { provider: true } },
      order: { createdAt: 'DESC' },
    });

    const usages = await this.usageRepo.find({
      where: { studentId },
      order: { mealDate: 'DESC' },
    });

    const todayIst = this.getAuthoritativeIstDate();

    return subscriptions.map((sub) => {
      const planTitle = sub.mealPlan?.title || 'Meal Plan';
      const providerName = sub.mealPlan?.provider?.name || 'Mess Kitchen';
      const providerArea =
        sub.mealPlan?.provider?.address || sub.mealPlan?.provider?.city || '';

      const subUsages = usages.filter((u) => u.subscriptionId === sub.id);
      const usageMap = new Map<string, MealUsage>();
      subUsages.forEach((u) => usageMap.set(u.mealDate, u));

      // Build daily checklist from startDate to min(today, endDate)
      const startDateStr = sub.startDate;
      const endDateStr = sub.endDate || sub.startDate;
      const maxDateStr = todayIst < endDateStr ? todayIst : endDateStr;

      const dailyChecklist: any[] = [];
      const current = new Date(startDateStr + 'T00:00:00Z');
      const max = new Date(maxDateStr + 'T00:00:00Z');

      // Cap at 31 days to avoid runaway loops
      let count = 0;
      while (current <= max && count < 35) {
        const dateStr = current.toISOString().split('T')[0];
        const record = usageMap.get(dateStr);

        const dObj = new Date(dateStr + 'T12:00:00Z');
        const monthShort = dObj.toLocaleDateString('en-IN', {
          timeZone: 'Asia/Kolkata',
          month: 'short',
        });
        const dayNum = String(dObj.getDate()).padStart(2, '0');

        dailyChecklist.push({
          date: dateStr,
          displayDate: `${monthShort} ${dayNum}`,
          day: dayNum,
          month: monthShort,
          status: record ? 'USED' : 'NOT_CHECKED_IN',
          checkedIn: Boolean(record),
          scannedAt: record?.scannedAt || null,
          time: record
            ? this.formatIstTime(record.scannedAt || record.createdAt)
            : null,
          source: record?.source || null,
        });

        current.setDate(current.getDate() + 1);
        count++;
      }

      return {
        subscriptionId: sub.id,
        planTitle,
        providerName,
        providerArea,
        status: sub.status,
        startDate: sub.startDate,
        endDate: sub.endDate,
        totalUsedCount: subUsages.length,
        days: dailyChecklist.reverse(), // most recent first
      };
    });
  }

  /**
   * Returns provider's live daily check-in attendance and subscriber roster for the current IST day.
   * Pure database read: no external calls or payment queries.
   */
  async getProviderTodayCheckIns(
    userId: string,
    providerId?: string,
  ): Promise<{
    today: string;
    summary: {
      todayCheckIns: number;
      activeSubscribers: number;
      notCheckedIn: number;
    };
    subscribers: any[];
  }> {
    const provider = await this.resolveAndVerifyProvider(userId, providerId);
    const todayIst = this.getAuthoritativeIstDate();

    // Fetch active subscriptions for this provider kitchen
    const subs = await this.subRepo.find({
      where: {
        mealPlan: { provider: { id: provider.id } },
        status: SubscriptionStatus.ACTIVE,
      },
      relations: { student: true, mealPlan: true },
      order: { createdAt: 'DESC' },
    });

    // Filter to subscriptions valid for today
    const validSubsToday = subs.filter((s) => {
      const start = s.startDate;
      const end = s.endDate || s.startDate;
      return todayIst >= start && todayIst <= end;
    });

    // Fetch meal usage records for today
    const usagesToday = await this.usageRepo.find({
      where: {
        providerId: provider.id,
        mealDate: todayIst,
      },
      relations: { student: true },
    });

    const usageBySubscriptionMap = new Map<string, MealUsage>();
    usagesToday.forEach((u) => {
      if (u.subscriptionId) {
        usageBySubscriptionMap.set(u.subscriptionId, u);
      }
    });

    const subscribers = validSubsToday.map((s) => {
      const usage = usageBySubscriptionMap.get(s.id);
      const isCheckedIn = Boolean(usage);
      const timeStr = usage
        ? this.formatIstTime(usage.scannedAt || usage.createdAt)
        : null;

      return {
        studentId: s.student?.id,
        studentName:
          s.student?.name || s.student?.email?.split('@')[0] || 'Subscriber',
        studentEmail: s.student?.email || '',
        studentPhone: s.student?.phone || 'Not available',
        subscriptionId: s.id,
        planTitle: s.mealPlan?.title || 'Plan',
        status: isCheckedIn ? 'CHECKED_IN' : 'NOT_CHECKED_IN',
        checkedIn: isCheckedIn,
        time: timeStr,
        source: usage?.source || null,
        usageId: usage?.id || null,
        correctedBy: usage?.correctedBy || null,
        correctionReason: usage?.correctionReason || null,
      };
    });

    const todayCheckIns = subscribers.filter((s) => s.checkedIn).length;
    const activeSubscribers = validSubsToday.length;
    const notCheckedIn = Math.max(0, activeSubscribers - todayCheckIns);

    return {
      today: todayIst,
      summary: {
        todayCheckIns,
        activeSubscribers,
        notCheckedIn,
      },
      subscribers,
    };
  }

  /**
   * Returns a subscriber's complete whole-month / subscription period attendance checklist.
   * Securely validates provider ownership of the subscription.
   */
  async getProviderSubscriberAttendanceHistory(
    userId: string,
    subscriptionId: string,
    providerId?: string,
  ): Promise<{
    subscriptionId: string;
    student: {
      id: string;
      name: string;
      email: string;
      phone: string;
    };
    planTitle: string;
    status: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    attendedDays: number;
    missedDays: number;
    upcomingDays: number;
    attendanceRate: number;
    days: any[];
  }> {
    const provider = await this.resolveAndVerifyProvider(userId, providerId);

    const sub = await this.subRepo.findOne({
      where: { id: subscriptionId },
      relations: { student: true, mealPlan: { provider: true } },
    });

    if (!sub) {
      throw new NotFoundException('Subscription not found');
    }

    if (sub.mealPlan?.provider?.id !== provider.id) {
      throw new ForbiddenException(
        'Cannot access subscriber attendance belonging to another provider kitchen',
      );
    }

    const todayIst = this.getAuthoritativeIstDate();

    // Fetch all check-in usage records for this subscription
    const usages = await this.usageRepo.find({
      where: { subscriptionId: sub.id },
      order: { mealDate: 'ASC' },
    });

    const usageMap = new Map<string, MealUsage>();
    usages.forEach((u) => usageMap.set(u.mealDate, u));

    const startDateStr = sub.startDate || todayIst;
    let endDateStr = sub.endDate;
    if (!endDateStr) {
      const startObj = new Date(startDateStr + 'T00:00:00Z');
      startObj.setDate(startObj.getDate() + 30);
      endDateStr = startObj.toISOString().split('T')[0];
    }

    const days: any[] = [];
    const current = new Date(startDateStr + 'T00:00:00Z');
    const end = new Date(endDateStr + 'T00:00:00Z');

    let count = 0;
    // Cap at 60 days to prevent infinite loops in malformed dates
    while (current <= end && count < 60) {
      const dateStr = current.toISOString().split('T')[0];
      const record = usageMap.get(dateStr);

      const dObj = new Date(dateStr + 'T12:00:00Z');
      const monthShort = dObj.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        month: 'short',
      });
      const dayNum = String(dObj.getDate()).padStart(2, '0');
      const dayOfWeek = dObj.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
      });

      const isPastOrToday = dateStr <= todayIst;
      const isToday = dateStr === todayIst;

      let status: 'CHECKED_IN' | 'NOT_CHECKED_IN' | 'UPCOMING';
      if (record) {
        status = 'CHECKED_IN';
      } else if (isPastOrToday) {
        status = 'NOT_CHECKED_IN';
      } else {
        status = 'UPCOMING';
      }

      days.push({
        date: dateStr,
        displayDate: `${dayNum} ${monthShort}`,
        day: dayNum,
        month: monthShort,
        dayOfWeek,
        isToday,
        status,
        checkedIn: Boolean(record),
        scannedAt: record?.scannedAt || null,
        time: record
          ? this.formatIstTime(record.scannedAt || record.createdAt)
          : null,
        source: record?.source || null,
        correctionReason: record?.correctionReason || null,
        correctedBy: record?.correctedBy || null,
      });

      current.setDate(current.getDate() + 1);
      count++;
    }

    const attendedDays = days.filter((d) => d.status === 'CHECKED_IN').length;
    const missedDays = days.filter((d) => d.status === 'NOT_CHECKED_IN').length;
    const upcomingDays = days.filter((d) => d.status === 'UPCOMING').length;
    const elapsedDays = attendedDays + missedDays;
    const attendanceRate =
      elapsedDays > 0 ? Math.round((attendedDays / elapsedDays) * 100) : 0;

    return {
      subscriptionId: sub.id,
      student: {
        id: sub.student?.id || '',
        name:
          sub.student?.name ||
          sub.student?.email?.split('@')[0] ||
          'Subscriber',
        email: sub.student?.email || '',
        phone: sub.student?.phone || 'Not available',
      },
      planTitle: sub.mealPlan?.title || 'Meal Plan',
      status: sub.status,
      startDate: startDateStr,
      endDate: endDateStr,
      totalDays: days.length,
      attendedDays,
      missedDays,
      upcomingDays,
      attendanceRate,
      days,
    };
  }

  /**
   * Provider manually corrects an unrecorded check-in due to a genuine technical issue.
   * Strictly audited, verified against provider ownership, and preserves the one-check-in invariant.
   */
  async correctCheckIn(
    userId: string,
    dto: {
      providerId: string;
      subscriptionId: string;
      reason: string;
    },
  ): Promise<{
    message: string;
    code: 'CORRECTION_RECORDED' | 'ALREADY_CHECKED_IN';
    usage: any;
  }> {
    if (
      !dto.reason ||
      typeof dto.reason !== 'string' ||
      dto.reason.trim().length < 5
    ) {
      throw new BadRequestException(
        'A valid justification reason (at least 5 characters) is mandatory for check-in correction.',
      );
    }

    const provider = await this.resolveAndVerifyProvider(
      userId,
      dto.providerId,
    );
    const todayIst = this.getAuthoritativeIstDate();

    // Verify subscription belongs to this provider
    const subscription = await this.subRepo.findOne({
      where: {
        id: dto.subscriptionId,
        mealPlan: { provider: { id: provider.id } },
      },
      relations: { student: true, mealPlan: { provider: true } },
    });

    if (!subscription) {
      throw new NotFoundException(
        'Subscription not found or does not belong to your kitchen.',
      );
    }

    // Verify subscription is active for today
    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot correct check-in for an inactive or expired subscription.',
      );
    }

    const start = subscription.startDate;
    const end = subscription.endDate || subscription.startDate;
    if (todayIst < start || todayIst > end) {
      throw new BadRequestException(
        'Subscription is not valid for the current calendar day.',
      );
    }

    const studentId = subscription.student.id;

    // Check if usage already exists today for this subscription
    const existing = await this.usageRepo.findOne({
      where: {
        subscriptionId: subscription.id,
        mealDate: todayIst,
      },
    });

    if (existing) {
      // Invariant: NEVER create a second usage record
      // Log an audit entry for the review/correction attempt
      await this.auditRepo.save(
        this.auditRepo.create({
          mealUsageId: existing.id,
          providerId: provider.id,
          actorId: userId,
          subscriptionId: subscription.id,
          studentId,
          action: 'REVIEW_EXISTING',
          reason: `Verification attempt: ${dto.reason.trim()} (Student already checked in at ${this.formatIstTime(existing.scannedAt)})`,
        }),
      );

      return {
        message: 'Student already has a valid check-in recorded for today.',
        code: 'ALREADY_CHECKED_IN',
        usage: existing,
      };
    }

    // Create the MealUsage with PROVIDER_CORRECTION source in an atomic transaction
    return await this.dataSource.transaction(async (manager) => {
      const usage = manager.create(MealUsage, {
        studentId,
        subscriptionId: subscription.id,
        providerId: provider.id,
        mealDate: todayIst,
        status: MealUsageStatus.USED,
        source: MealUsageSource.PROVIDER_CORRECTION,
        scannedAt: new Date(),
        correctedAt: new Date(),
        correctedBy: userId,
        correctionReason: dto.reason.trim(),
      });

      const savedUsage = await manager.save(MealUsage, usage);

      // Save immutable audit record
      const audit = manager.create(MealUsageAudit, {
        mealUsageId: savedUsage.id,
        providerId: provider.id,
        actorId: userId,
        subscriptionId: subscription.id,
        studentId,
        action: 'MANUAL_CORRECTION',
        reason: dto.reason.trim(),
      });
      await manager.save(MealUsageAudit, audit);

      return {
        message: 'Check-in successfully corrected and recorded.',
        code: 'CORRECTION_RECORDED',
        usage: savedUsage,
      };
    });
  }

  /**
   * Helper to verify provider ownership and prevent IDOR attacks.
   */
  private async resolveAndVerifyProvider(
    userId: string,
    providerId?: string,
  ): Promise<MealProvider> {
    let provider: MealProvider | null = null;
    if (providerId) {
      provider = await this.providerRepo.findOne({
        where: { id: providerId },
        relations: { user: true },
      });
      if (!provider) {
        throw new NotFoundException('Meal provider kitchen not found');
      }
      if (provider.userId !== userId && provider.user?.id !== userId) {
        throw new ForbiddenException(
          'Cannot access resources belonging to another provider',
        );
      }
    } else {
      provider = await this.providerRepo.findOne({
        where: [{ userId }, { user: { id: userId } }],
        relations: { user: true },
      });
      if (!provider) {
        throw new NotFoundException(
          'No provider kitchen found for your account',
        );
      }
    }
    return provider;
  }
}
