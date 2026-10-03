import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { QaSeedService } from '../qa-seed.service';

async function run() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ QA seed validation is blocked in production.');
    process.exit(1);
  }

  process.env.ENABLE_SEED = 'false';

  console.log('🔍 Connecting to QA database for read-only validation...\n');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const seedService = app.get(QaSeedService);
    const { passed, results } = await seedService.validate();

    console.log('===============================================================');
    console.log('         PrimePlate QA Dataset Integrity Validation            ');
    console.log('===============================================================');

    for (const r of results) {
      const statusIcon = r.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${statusIcon} | ${r.check}`);
      if (r.details) {
        console.log(`       ↳ ${r.details}`);
      }
    }

    console.log('===============================================================');
    if (passed) {
      console.log('🎉 ALL QA VALIDATION CHECKS PASSED (15/15)');
      console.log('===============================================================\n');
    } else {
      console.log('⚠️ ONE OR MORE VALIDATION CHECKS FAILED');
      console.log('===============================================================\n');
      await app.close();
      process.exit(1);
    }
  } catch (err: any) {
    console.error('\n❌ QA validation error:', err.message || err);
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
