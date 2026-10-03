import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataImport } from './data-import.entity';
import { DataImportService } from './data-import.service';
import { DataImportController } from './data-import.controller';
import { User } from '../users/user.entity';
import { MealProvider } from '../providers/meal-provider.entity';
import { MealPlan } from '../meal-plans/meal-plan.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { MealUsage } from '../meal-usage/meal-usage.entity';
import { Review } from '../reviews/review.entity';
import { ProviderEarning } from '../payouts/provider-earning.entity';
import { Payment } from '../payments/payment.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DataImport,
      User,
      MealProvider,
      MealPlan,
      Subscription,
      MealUsage,
      Review,
      ProviderEarning,
      Payment,
    ]),
    AuthModule,
  ],
  controllers: [DataImportController],
  providers: [DataImportService],
  exports: [DataImportService],
})
export class DataImportModule {}
