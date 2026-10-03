import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { QaSeedService } from '../qa-seed.service';

async function run() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ QA seed is blocked in production.');
    process.exit(1);
  }

  // Prevent development SeedService from auto-seeding mock data during bootstrap
  process.env.ENABLE_SEED = 'false';

  console.log('🌱 Connecting to QA database for seeding...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const seedService = app.get(QaSeedService);
    const summary = await seedService.seed();

    console.log('\n========================================');
    console.log('✅ QA seed completed successfully.');
    console.log('========================================');
    console.log(`Users:         ${summary.users}`);
    console.log(`Providers:     ${summary.providers}`);
    console.log(`Meal Plans:    ${summary.mealPlans}`);
    console.log(`Subscriptions: ${summary.subscriptions}`);
    console.log(`Payments:      ${summary.payments}`);
    console.log(`Meal Usages:   ${summary.mealUsages}`);
    console.log(`Recoveries:    ${summary.recoveries}`);
    console.log(`Reviews:       ${summary.reviews}`);
    console.log(`Earnings:      ${summary.earnings}`);
    console.log(`Tickets:       ${summary.tickets}`);
    console.log('========================================\n');
  } catch (err: any) {
    console.error('\n❌ QA seed failed:', err.message || err);
    await app.close();
    process.exit(1);
  }

  await app.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
