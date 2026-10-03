import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProvidersModule } from './providers/providers.module';
import { MealPlansModule } from './meal-plans/meal-plans.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { PaymentsModule } from './payments/payments.module';
import { UploadsModule } from './uploads/uploads.module';
import { ReviewsModule } from './reviews/reviews.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SeedService } from './common/seed.service';
import { User } from './users/user.entity';
import { MealProvider } from './providers/meal-provider.entity';
import { MealPlan } from './meal-plans/meal-plan.entity';
import { Subscription } from './subscriptions/subscription.entity';
import { Payment } from './payments/payment.entity';
import { PaymentWebhookEvent } from './payments/webhook-event.entity';
import { Review } from './reviews/review.entity';
import { WeeklyMenu } from './weekly-menus/weekly-menu.entity';
import { PasswordResetToken } from './auth/password-reset-token.entity';
import { WeeklyMenusModule } from './weekly-menus/weekly-menus.module';
import { ProviderEarning } from './payouts/provider-earning.entity';
import { ProviderSettlementAudit } from './payouts/provider-settlement-audit.entity';
import { PayoutsModule } from './payouts/payouts.module';
import { SupportTicket } from './support/support-ticket.entity';
import { SupportModule } from './support/support.module';
import { MealUsage } from './meal-usage/meal-usage.entity';
import { MealUsageAudit } from './meal-usage/meal-usage-audit.entity';
import { MealUsageModule } from './meal-usage/meal-usage.module';
import { MealRecovery } from './meal-recovery/meal-recovery.entity';
import { MealRecoveryModule } from './meal-recovery/meal-recovery.module';
import { SystemSetting } from './settings/system-setting.entity';
import { SystemSettingAudit } from './settings/system-setting-audit.entity';
import { SettingsModule } from './settings/settings.module';
import { DataImport } from './data-import/data-import.entity';
import { DataImportModule } from './data-import/data-import.module';
import { QaSeedModule } from './qa-seed/qa-seed.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): any => {
        const isProd = config.get<string>('NODE_ENV') === 'production';
        const dbUrl = config.get<string>('DATABASE_URL');

        if (isProd && (!dbUrl || dbUrl.includes('PLACEHOLDER'))) {
          throw new Error(
            'FATAL: A valid DATABASE_URL must be provided for PostgreSQL in production/QA environment!',
          );
        }

        if (dbUrl && !dbUrl.includes('PLACEHOLDER')) {
          const useSsl = config.get<string>('DATABASE_SSL') === 'true';
          const sanitizedUrl = dbUrl.replace(/[?&]sslmode=require/, '');
          return {
            type: 'postgres',
            url: sanitizedUrl,
            synchronize: false, // Strictly disabled in production
            migrationsRun: true, // Automatically execute pending migrations on startup
            entities: [__dirname + '/**/*.entity{.ts,.js}'],
            migrations: [__dirname + '/migrations/[0-9]*-*{.ts,.js}'],
            ssl: useSsl ? { rejectUnauthorized: false } : false,
            extra: {
              ssl: useSsl ? { rejectUnauthorized: false } : false,
            },
          };
        }

        // Local Development SQLite
        return {
          type: 'better-sqlite3',
          database: 'dev.sqlite',
          synchronize: !isProd,
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          migrations: [__dirname + '/migrations/[0-9]*-*{.ts,.js}'],
        };
      },
    }),
    TypeOrmModule.forFeature([
      User,
      MealProvider,
      MealPlan,
      Subscription,
      Payment,
      PaymentWebhookEvent,
      Review,
      WeeklyMenu,
      PasswordResetToken,
      ProviderEarning,
      ProviderSettlementAudit,
      SupportTicket,
      MealUsage,
      MealUsageAudit,
      MealRecovery,
      SystemSetting,
      SystemSettingAudit,
      DataImport,
    ]),
    AuthModule,
    UsersModule,
    ProvidersModule,
    MealPlansModule,
    SubscriptionsModule,
    PaymentsModule,
    PayoutsModule,
    SupportModule,
    UploadsModule,
    ReviewsModule,
    AnalyticsModule,
    WeeklyMenusModule,
    MealUsageModule,
    MealRecoveryModule,
    SettingsModule,
    DataImportModule,
    QaSeedModule,
  ],
  controllers: [AppController],
  providers: [SeedService],
})
export class AppModule {}
