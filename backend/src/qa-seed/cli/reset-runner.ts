import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { QaSeedService } from '../qa-seed.service';

async function run() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ QA seed is blocked in production.');
    process.exit(1);
  }

  process.env.ENABLE_SEED = 'false';

  console.log('🧹 Connecting to QA database for data reset...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const seedService = app.get(QaSeedService);
    await seedService.reset();

    console.log('\n========================================');
    console.log('✅ QA database reset completed safely.');
    console.log('All QA application tables cleared.');
    console.log('========================================\n');
  } catch (err: any) {
    console.error('\n❌ QA reset failed:', err.message || err);
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
