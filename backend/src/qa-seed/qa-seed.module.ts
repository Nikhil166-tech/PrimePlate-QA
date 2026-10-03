import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '../users/user.entity';
import { MealProvider } from '../providers/meal-provider.entity';
import { ProviderImage } from '../providers/provider-image.entity';
import { MealPlan } from '../meal-plans/meal-plan.entity';
import { WeeklyMenu } from '../weekly-menus/weekly-menu.entity';
import { DailyMenu } from '../meal-plans/daily-menu.entity';
import { Payment } from '../payments/payment.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { Review } from '../reviews/review.entity';
import { SupportTicket } from '../support/support-ticket.entity';
import { MealUsage } from '../meal-usage/meal-usage.entity';
import { MealUsageAudit } from '../meal-usage/meal-usage-audit.entity';
import { MealRecovery } from '../meal-recovery/meal-recovery.entity';
import { ProviderEarning } from '../payouts/provider-earning.entity';
import { ProviderSettlementAudit } from '../payouts/provider-settlement-audit.entity';
import { SystemSetting } from '../settings/system-setting.entity';
import { SystemSettingAudit } from '../settings/system-setting-audit.entity';
import { RefreshToken } from '../auth/refresh-token.entity';
import { PasswordResetToken } from '../auth/password-reset-token.entity';

import { QaSeedService } from './qa-seed.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      MealProvider,
      ProviderImage,
      MealPlan,
      WeeklyMenu,
      DailyMenu,
      Payment,
      Subscription,
      Review,
      SupportTicket,
      MealUsage,
      MealUsageAudit,
      MealRecovery,
      ProviderEarning,
      ProviderSettlementAudit,
      SystemSetting,
      SystemSettingAudit,
      RefreshToken,
      PasswordResetToken,
    ]),
  ],
  providers: [QaSeedService],
  exports: [QaSeedService],
})
export class QaSeedModule {}
