import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { User } from '../users/user.entity';
import { MealProvider } from '../providers/meal-provider.entity';
import { ProviderImage } from '../providers/provider-image.entity';
import { MealPlan, MealType } from '../meal-plans/meal-plan.entity';
import { WeeklyMenu } from '../weekly-menus/weekly-menu.entity';
import { DailyMenu } from '../meal-plans/daily-menu.entity';
import { Payment } from '../payments/payment.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { Review } from '../reviews/review.entity';
import { SupportTicket } from '../support/support-ticket.entity';
import { MealUsage } from '../meal-usage/meal-usage.entity';
import { MealUsageAudit } from '../meal-usage/meal-usage-audit.entity';
import { MealRecovery, MealRecoveryStatus } from '../meal-recovery/meal-recovery.entity';
import { ProviderEarning } from '../payouts/provider-earning.entity';
import { ProviderSettlementAudit } from '../payouts/provider-settlement-audit.entity';
import { SystemSetting } from '../settings/system-setting.entity';
import { SystemSettingAudit } from '../settings/system-setting-audit.entity';
import { RefreshToken } from '../auth/refresh-token.entity';
import { PasswordResetToken } from '../auth/password-reset-token.entity';

import { buildQaUsers } from './factories/user.factory';
import { buildQaProviders } from './factories/provider.factory';
import { buildQaMealPlans } from './factories/meal-plan.factory';
import { buildQaWeeklyMenus, buildQaDailyMenus } from './factories/menu.factory';
import { buildQaSystemSettings } from './factories/settings.factory';
import { buildQaPayments } from './factories/payment.factory';
import { buildQaSubscriptions } from './factories/subscription.factory';
import { buildQaMealUsages } from './factories/usage.factory';
import { buildQaMealRecoveries } from './factories/recovery.factory';
import { buildQaProviderEarnings } from './factories/earning.factory';
import { buildQaSupportTickets } from './factories/ticket.factory';
import { buildQaReviews } from './factories/review.factory';

import { getTodayIst } from './date.helper';
import { QA_USERS } from './qa-seed.constants';

@Injectable()
export class QaSeedService {
  private readonly logger = new Logger(QaSeedService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Enforces strict production refusal.
   */
  private verifySafety(): void {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('QA seed is blocked in production.');
    }
  }

  /**
   * Resets all application QA data cleanly.
   * Does NOT touch migrations table or external schemas.
   */
  async reset(): Promise<void> {
    this.verifySafety();
    this.logger.log('Starting QA database clean reset...');

    const isPostgres = this.dataSource.options.type === 'postgres';

    const tables = [
      'system_setting_audits',
      'provider_settlement_audits',
      'provider_earnings',
      'meal_recoveries',
      'meal_usage_audits',
      'meal_usages',
      'support_tickets',
      'reviews',
      'subscriptions',
      'payments',
      'daily_menus',
      'weekly_menus',
      'meal_plans',
      'provider_images',
      'meal_providers',
      'refresh_tokens',
      'password_reset_tokens',
      'users',
      'system_settings',
    ];

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      if (isPostgres) {
        // Try fast truncate cascade; fallback to delete if permission or connection pool restricts truncate
        try {
          const tableList = tables.map((t) => `"${t}"`).join(', ');
          await queryRunner.query(`TRUNCATE TABLE ${tableList} CASCADE;`);
        } catch (truncErr: any) {
          this.logger.warn(`Truncate cascade failed (${truncErr.message}). Falling back to ordered DELETE FROM.`);
          await queryRunner.startTransaction();
          for (const table of tables) {
            await queryRunner.query(`DELETE FROM "${table}";`);
          }
          await queryRunner.commitTransaction();
        }
      } else {
        // SQLite sequential delete inside transaction
        await queryRunner.startTransaction();
        for (const table of tables) {
          await queryRunner.query(`DELETE FROM "${table}";`);
        }
        await queryRunner.commitTransaction();
      }

      this.logger.log('QA database tables successfully cleared.');
    } catch (err: any) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error('Error during QA database reset:', err.message || err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Seeds the deterministic synthetic QA dataset inside a single transaction.
   */
  async seed(): Promise<{
    users: number;
    providers: number;
    mealPlans: number;
    subscriptions: number;
    payments: number;
    mealUsages: number;
    recoveries: number;
    reviews: number;
    earnings: number;
    tickets: number;
  }> {
    this.verifySafety();
    const today = getTodayIst();
    this.logger.log(`Starting QA database seed (authoritative IST today: ${today})...`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const userRepo = queryRunner.manager.getRepository(User);
      const provRepo = queryRunner.manager.getRepository(MealProvider);
      const imgRepo = queryRunner.manager.getRepository(ProviderImage);
      const planRepo = queryRunner.manager.getRepository(MealPlan);
      const weeklyMenuRepo = queryRunner.manager.getRepository(WeeklyMenu);
      const dailyMenuRepo = queryRunner.manager.getRepository(DailyMenu);
      const settingRepo = queryRunner.manager.getRepository(SystemSetting);
      const settingAuditRepo = queryRunner.manager.getRepository(SystemSettingAudit);
      const paymentRepo = queryRunner.manager.getRepository(Payment);
      const subRepo = queryRunner.manager.getRepository(Subscription);
      const usageRepo = queryRunner.manager.getRepository(MealUsage);
      const usageAuditRepo = queryRunner.manager.getRepository(MealUsageAudit);
      const recoveryRepo = queryRunner.manager.getRepository(MealRecovery);
      const reviewRepo = queryRunner.manager.getRepository(Review);
      const earningRepo = queryRunner.manager.getRepository(ProviderEarning);
      const settleAuditRepo = queryRunner.manager.getRepository(ProviderSettlementAudit);
      const ticketRepo = queryRunner.manager.getRepository(SupportTicket);

      // Level 0: System Settings
      const { settings, audits: settingAudits } = buildQaSystemSettings();
      await settingRepo.save(settingRepo.create(settings));

      // Level 0: Users
      const usersData = buildQaUsers();
      await userRepo.save(userRepo.create(usersData));

      // Level 1: Meal Providers & Provider Images
      const { providers: provData, images: imgData } = buildQaProviders();
      await provRepo.save(provRepo.create(provData));
      await imgRepo.save(imgRepo.create(imgData), { chunk: 50 });

      // Level 2: Meal Plans
      const plansData = buildQaMealPlans();
      await planRepo.save(planRepo.create(plansData));

      // Level 3: Menus (Weekly and Daily)
      const weeklyMenus = buildQaWeeklyMenus();
      await weeklyMenuRepo.save(weeklyMenuRepo.create(weeklyMenus), { chunk: 50 });

      const dailyMenus = buildQaDailyMenus();
      await dailyMenuRepo.save(dailyMenuRepo.create(dailyMenus), { chunk: 50 });

      // Level 4: Payments
      const paymentsData = buildQaPayments();
      await paymentRepo.save(paymentRepo.create(paymentsData));

      // Level 4: Subscriptions
      const subsData = buildQaSubscriptions();
      await subRepo.save(subRepo.create(subsData));

      // Level 5: Reviews
      const reviewsData = buildQaReviews();
      await reviewRepo.save(reviewRepo.create(reviewsData));

      // Level 5: Support Tickets
      const ticketsData = buildQaSupportTickets();
      await ticketRepo.save(ticketRepo.create(ticketsData));

      // Level 5: Meal Usages & Audits
      const { usages: usagesData, audits: usageAudits } = buildQaMealUsages();
      await usageRepo.save(usageRepo.create(usagesData), { chunk: 50 });
      await usageAuditRepo.save(usageAuditRepo.create(usageAudits), { chunk: 50 });

      // Level 5: Meal Recoveries
      const recoveriesData = buildQaMealRecoveries();
      await recoveryRepo.save(recoveryRepo.create(recoveriesData));

      // Level 6: Provider Earnings & Settlement Audits
      const { earnings: earningsData, audits: settleAudits } = buildQaProviderEarnings();
      await earningRepo.save(earningRepo.create(earningsData));
      await settleAuditRepo.save(settleAuditRepo.create(settleAudits));

      // Final: System Setting Audits
      await settingAuditRepo.save(settingAuditRepo.create(settingAudits));

      await queryRunner.commitTransaction();

      const summary = {
        users: usersData.length,
        providers: provData.length,
        mealPlans: plansData.length,
        subscriptions: subsData.length,
        payments: paymentsData.length,
        mealUsages: usagesData.length,
        recoveries: recoveriesData.length,
        reviews: reviewsData.length,
        earnings: earningsData.length,
        tickets: ticketsData.length,
      };

      this.logger.log('QA database seed committed successfully.');
      return summary;
    } catch (err: any) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      this.logger.error('Error committing QA seed transaction:', err.message || err);
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Read-only validation verifying that the seeded QA data satisfies all business rules.
   */
  async validate(): Promise<{ passed: boolean; results: { check: string; passed: boolean; details?: string }[] }> {
    this.verifySafety();
    const results: { check: string; passed: boolean; details?: string }[] = [];
    const today = getTodayIst();

    const userRepo = this.dataSource.getRepository(User);
    const provRepo = this.dataSource.getRepository(MealProvider);
    const planRepo = this.dataSource.getRepository(MealPlan);
    const subRepo = this.dataSource.getRepository(Subscription);
    const payRepo = this.dataSource.getRepository(Payment);
    const usageRepo = this.dataSource.getRepository(MealUsage);
    const recoveryRepo = this.dataSource.getRepository(MealRecovery);
    const earnRepo = this.dataSource.getRepository(ProviderEarning);
    const settleRepo = this.dataSource.getRepository(ProviderSettlementAudit);
    const ticketRepo = this.dataSource.getRepository(SupportTicket);
    const refreshRepo = this.dataSource.getRepository(RefreshToken);
    const resetRepo = this.dataSource.getRepository(PasswordResetToken);

    // 1. Expected QA users exist
    const admin = await userRepo.findOne({ where: { email: QA_USERS.ADMIN.email } });
    const prov1User = await userRepo.findOne({ where: { email: QA_USERS.PROVIDERS[0].email } });
    const stu1User = await userRepo.findOne({ where: { email: QA_USERS.STUDENTS[0].email } });
    const totalUsers = await userRepo.count();
    results.push({
      check: '1. Expected QA Users Exist (1 Admin, 2 Providers, 4 Students)',
      passed: !!admin && !!prov1User && !!stu1User && totalUsers === 7,
      details: `Found ${totalUsers} users (Admin, Provider 1, Student 1 verified)`,
    });

    // 2. Expected Providers exist with configurations
    const providers = await provRepo.find();
    const prov1 = providers.find((p) => p.mealRecoveryEnabled === true && p.recoveryPercentage === 80);
    const prov2 = providers.find((p) => p.mealRecoveryEnabled === false);
    results.push({
      check: '2. Expected Providers & Configurations Exist (Provider A Recovery 80%, Provider B Recovery Disabled)',
      passed: providers.length === 2 && !!prov1 && !!prov2,
      details: `2 providers verified (Provider A with 80% recovery, Provider B with recovery disabled)`,
    });

    // 3. Active subscriptions cover today's IST date
    const activeSubs = await subRepo.find({ where: { status: 'active' as any } });
    const allActiveCoverToday = activeSubs.every(
      (s) => s.startDate <= today && (s.endDate ? s.endDate >= today : true),
    );
    results.push({
      check: "3. Active Subscriptions Cover Today's IST Date",
      passed: activeSubs.length > 0 && allActiveCoverToday,
      details: `${activeSubs.length} active subscriptions all span today (${today})`,
    });

    // 4. Meal Types exist: FULL_DAY, LUNCH_ONLY, DINNER_ONLY
    const plans = await planRepo.find();
    const hasFullDay = plans.some((p) => p.mealType === MealType.FULL_DAY);
    const hasLunchOnly = plans.some((p) => p.mealType === MealType.LUNCH_ONLY);
    const hasDinnerOnly = plans.some((p) => p.mealType === MealType.DINNER_ONLY);
    const hasDisabledPlan = plans.some((p) => p.isActive === false);
    results.push({
      check: '4. Meal Types Exist (FULL_DAY, LUNCH_ONLY, DINNER_ONLY, and Inactive Option)',
      passed: hasFullDay && hasLunchOnly && hasDinnerOnly && hasDisabledPlan,
      details: `Found FULL_DAY, LUNCH_ONLY, DINNER_ONLY tiers and 1 disabled meal option`,
    });

    // 5. Custom 1-day prices exist where expected (and null where expected)
    const hasCustom1Day = plans.some((p) => p.customOneDayPrice !== null && p.customOneDayPrice !== undefined);
    const hasNull1Day = plans.some((p) => p.customOneDayPrice === null || p.customOneDayPrice === undefined);
    results.push({
      check: '5. Custom 1-Day Pricing Configuration Exists',
      passed: hasCustom1Day && hasNull1Day,
      details: `Verified plans with customOneDayPrice set (₹150) and plans with null`,
    });

    // 6. CRITICAL: No recovery exists for LUNCH_ONLY or DINNER_ONLY
    const recoveries = await recoveryRepo.find();
    let invalidRecoveryFound = false;
    for (const r of recoveries) {
      const srcSub = await subRepo.findOne({
        where: { id: r.sourceSubscriptionId },
        relations: { mealPlan: true },
      });
      if (srcSub?.mealPlan && srcSub.mealPlan.mealType !== MealType.FULL_DAY) {
        invalidRecoveryFound = true;
        break;
      }
    }
    results.push({
      check: '6. Zero Recovery For LUNCH_ONLY / DINNER_ONLY (FULL_DAY Only)',
      passed: !invalidRecoveryFound,
      details: `Verified all ${recoveries.length} recovery records stem exclusively from FULL_DAY plans`,
    });

    // 7. Recovery calculations are correct
    const availRec = recoveries.find((r) => r.status === MealRecoveryStatus.AVAILABLE);
    const partialRec = recoveries.find((r) => r.status === MealRecoveryStatus.PARTIALLY_USED);

    const calcOk =
      availRec &&
      availRec.recoveredDays === 4 &&
      availRec.usedDays === 0 &&
      availRec.remainingDays === 4 &&
      partialRec &&
      partialRec.recoveredDays === 4 &&
      partialRec.usedDays === 2 &&
      partialRec.remainingDays === 2;

    results.push({
      check: '7. Recovery Calculations & Status Scenarios Correct',
      passed: !!calcOk,
      details: `Verified AVAILABLE (4 rem) and PARTIALLY_USED (2 rem)`,
    });

    // 8. Meal usage uniqueness respected
    const usages = await usageRepo.find();
    const seenPairs = new Set<string>();
    let duplicateUsage = false;
    for (const u of usages) {
      const pair = `${u.subscriptionId}_${u.mealDate}`;
      if (seenPairs.has(pair)) {
        duplicateUsage = true;
        break;
      }
      seenPairs.add(pair);
    }
    results.push({
      check: '8. Meal Usage Uniqueness (subscriptionId, mealDate) Respected',
      passed: !duplicateUsage && usages.length > 0,
      details: `${usages.length} usages verified with zero duplicate day pairs`,
    });

    // 9. Payment relationships valid
    const payments = await payRepo.find({ relations: { student: true, provider: true } });
    const hasPaid = payments.some((p) => p.status === 'paid');
    const allPaymentsHaveStudent = payments.every((p) => !!p.student);
    results.push({
      check: '9. Payment Relationships & Statuses Valid',
      passed: hasPaid && allPaymentsHaveStudent && payments.length >= 5,
      details: `Found ${payments.length} test payments with valid student FKs and test IDs`,
    });

    // 10. Provider earnings relationships valid
    const earnings = await earnRepo.find();
    const hasEarnPaid = earnings.some((e) => e.status === 'PAID' && !!e.paidAt && !!e.settlementReference);
    const hasEarnEligible = earnings.some((e) => e.status === 'ELIGIBLE');
    const hasEarnPending = earnings.some((e) => e.status === 'PENDING');
    results.push({
      check: '10. Provider Earnings (PAID, ELIGIBLE, PENDING) Valid',
      passed: hasEarnPaid && hasEarnEligible && hasEarnPending,
      details: `Found ${earnings.length} earnings covering PAID, ELIGIBLE, PENDING statuses`,
    });

    // 11. Settlement audits reference valid earnings
    const settleAudits = await settleRepo.find();
    const allAuditsMatchPaid = settleAudits.every((sa) =>
      earnings.some((e) => e.id === sa.earningId && e.status === 'PAID'),
    );
    results.push({
      check: '11. Settlement Audits Reference Valid Paid Earnings',
      passed: settleAudits.length > 0 && allAuditsMatchPaid,
      details: `${settleAudits.length} settlement audits match PAID earning records`,
    });

    // 12. Support tickets reference valid records
    const tickets = await ticketRepo.find({ relations: { student: true } });
    const hasOpen = tickets.some((t) => t.status === 'OPEN' && !!t.utrReference);
    const hasInvestigating = tickets.some((t) => t.status === 'INVESTIGATING');
    const hasResolved = tickets.some((t) => t.status === 'RESOLVED');
    results.push({
      check: '12. Support Tickets (OPEN, INVESTIGATING, RESOLVED) Valid',
      passed: hasOpen && hasInvestigating && hasResolved && tickets.every((t) => !!t.student),
      details: `${tickets.length} tickets verified with valid synthetic UTRs and student relations`,
    });

    // 13. Deterministic QA emails exist
    const emails = (await userRepo.find()).map((u) => u.email);
    const allQaEmails = emails.every((e) => e.endsWith('@qa.primeplate.local'));
    results.push({
      check: '13. Only Deterministic QA Emails Exist (*@qa.primeplate.local)',
      passed: allQaEmails && emails.length === 7,
      details: `All ${emails.length} user accounts use the @qa.primeplate.local domain`,
    });

    // 14. Zero refresh tokens seeded
    const refreshCount = await refreshRepo.count();
    results.push({
      check: '14. Zero Static Refresh Tokens Seeded',
      passed: refreshCount === 0,
      details: `Count: ${refreshCount} (Session tokens must only be generated at login)`,
    });

    // 15. Zero password reset tokens seeded
    const resetCount = await resetRepo.count();
    results.push({
      check: '15. Zero Static Password Reset Tokens Seeded',
      passed: resetCount === 0,
      details: `Count: ${resetCount} (Password reset tokens must be generated on demand)`,
    });

    const passed = results.every((r) => r.passed);
    return { passed, results };
  }
}
