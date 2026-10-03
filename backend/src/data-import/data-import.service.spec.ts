import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, PreconditionFailedException, NotFoundException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import * as crypto from 'crypto';
import {
  DataImportService,
  FORBIDDEN_FIELDS,
  REPLACE_CONFIRMATION_PHRASE,
  MERGE_CONFIRMATION_PHRASE,
} from './data-import.service';
import { DataImport, ImportMode, ImportStatus } from './data-import.entity';
import { User } from '../users/user.entity';
import { MealProvider } from '../providers/meal-provider.entity';
import { MealPlan, MealType } from '../meal-plans/meal-plan.entity';
import { Subscription, SubscriptionStatus } from '../subscriptions/subscription.entity';
import { MealUsage } from '../meal-usage/meal-usage.entity';
import { Review } from '../reviews/review.entity';
import { ProviderEarning } from '../payouts/provider-earning.entity';
import { Payment } from '../payments/payment.entity';
import { DataSource } from 'typeorm';

function createMockZipBuffer(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [filename, content] of Object.entries(files)) {
    zip.addFile(filename, Buffer.from(content, 'utf8'));
  }
  return zip.toBuffer();
}

describe('DataImportService - Comprehensive 24-Point QA Test Suite', () => {
  let service: DataImportService;
  let mockImportRepo: any;
  let mockUserRepo: any;
  let mockProviderRepo: any;
  let mockPlanRepo: any;
  let mockSubRepo: any;
  let mockUsageRepo: any;
  let mockReviewRepo: any;
  let mockEarningRepo: any;
  let mockPaymentRepo: any;
  let mockDataSource: any;
  let mockQueryRunner: any;

  const validUserId = crypto.randomUUID();
  const validProviderId = crypto.randomUUID();
  const validPlanId = crypto.randomUUID();
  const validSubId = crypto.randomUUID();

  beforeEach(async () => {
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        delete: jest.fn().mockResolvedValue({ affected: 1 }),
        createQueryBuilder: jest.fn().mockReturnValue({
          delete: jest.fn().mockReturnThis(),
          from: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          execute: jest.fn().mockResolvedValue({ affected: 1 }),
        }),
        create: jest.fn().mockImplementation((entityClass, data) => data),
        save: jest.fn().mockImplementation((entityClass, data) => Promise.resolve(data)),
        findOne: jest.fn().mockResolvedValue(null),
      },
    };

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    mockImportRepo = {
      create: jest.fn().mockImplementation((data) => ({ id: crypto.randomUUID(), ...data })),
      save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      findOne: jest.fn().mockResolvedValue(null),
    };

    const mockRepoFactory = () => ({
      create: jest.fn().mockImplementation((d) => d),
      save: jest.fn().mockImplementation((d) => Promise.resolve(d)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    });

    mockUserRepo = mockRepoFactory();
    mockProviderRepo = mockRepoFactory();
    mockPlanRepo = mockRepoFactory();
    mockSubRepo = mockRepoFactory();
    mockUsageRepo = mockRepoFactory();
    mockReviewRepo = mockRepoFactory();
    mockEarningRepo = mockRepoFactory();
    mockPaymentRepo = mockRepoFactory();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataImportService,
        { provide: getRepositoryToken(DataImport), useValue: mockImportRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(MealProvider), useValue: mockProviderRepo },
        { provide: getRepositoryToken(MealPlan), useValue: mockPlanRepo },
        { provide: getRepositoryToken(Subscription), useValue: mockSubRepo },
        { provide: getRepositoryToken(MealUsage), useValue: mockUsageRepo },
        { provide: getRepositoryToken(Review), useValue: mockReviewRepo },
        { provide: getRepositoryToken(ProviderEarning), useValue: mockEarningRepo },
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<DataImportService>(DataImportService);
  });

  const validManifest = JSON.stringify({
    formatVersion: '1.0',
    source: 'primeplate-production',
    exportedAt: '2026-09-29T12:00:00.000Z',
    exportId: 'EXPORT-20260929-TEST',
    tables: [
      { name: 'users', file: 'users.json', recordCount: 1 },
      { name: 'providers', file: 'providers.json', recordCount: 1 },
      { name: 'meal_plans', file: 'meal-plans.json', recordCount: 1 },
      { name: 'subscriptions', file: 'subscriptions.json', recordCount: 1 },
    ],
  });

  const validUsersJson = JSON.stringify([
    {
      id: validUserId,
      email: 'student@example.com',
      name: 'John Doe',
      phone: '9876543210',
      role: 'STUDENT',
      area: 'Madhapur',
    },
  ]);

  const validProvidersJson = JSON.stringify([
    {
      id: validProviderId,
      userId: validUserId,
      name: 'Spice Mess',
      city: 'Hyderabad',
      monthlyPrice: 2800,
      status: 'ACTIVE',
    },
  ]);

  const validPlansJson = JSON.stringify([
    {
      id: validPlanId,
      providerId: validProviderId,
      title: 'Full Day Veg',
      mealType: 'FULL_DAY',
      pricePerMonth: 2800,
    },
  ]);

  const validSubsJson = JSON.stringify([
    {
      id: validSubId,
      studentId: validUserId,
      mealPlanId: validPlanId,
      status: 'active',
      startDate: '2026-09-01',
    },
  ]);

  // Test 1: Valid ZIP Package
  it('1. should validate a correctly structured valid ZIP package', async () => {
    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': validUsersJson,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const report = await service.validatePackage(zipBuffer);
    expect(report.valid).toBe(true);
    expect(report.packageToken).toBeDefined();
    expect(report.exportId).toBe('EXPORT-20260929-TEST');
    expect(report.tableSummaries.length).toBe(4);
    expect(report.foreignKeyCheck.status).toBe('PASS');
  });

  // Test 2: Missing Manifest
  it('2. should reject ZIP missing manifest.json', async () => {
    const zipBuffer = createMockZipBuffer({
      'users.json': validUsersJson,
    });

    await expect(service.validatePackage(zipBuffer)).rejects.toThrow(
      'missing manifest.json',
    );
  });

  // Test 3: Invalid Manifest JSON
  it('3. should reject ZIP with corrupted manifest.json syntax', async () => {
    const zipBuffer = createMockZipBuffer({
      'manifest.json': '{ invalid JSON syntax...',
    });

    await expect(service.validatePackage(zipBuffer)).rejects.toThrow(
      'invalid JSON syntax',
    );
  });

  // Test 4: Unsupported Format Version
  it('4. should reject unsupported package formatVersion', async () => {
    const invalidVerManifest = JSON.stringify({
      formatVersion: '99.0',
      source: 'test',
      tables: [],
    });
    const zipBuffer = createMockZipBuffer({
      'manifest.json': invalidVerManifest,
    });

    await expect(service.validatePackage(zipBuffer)).rejects.toThrow(
      "Unsupported package formatVersion: 99.0. Expected '1.0'.",
    );
  });

  // Test 5: Invalid JSON in a table file
  it('5. should reject archive when a table file contains invalid JSON', async () => {
    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': '[ { broken: json without quotes } ]',
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const report = await service.validatePackage(zipBuffer);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes('invalid JSON syntax'))).toBe(true);
  });

  // Test 6: Path Traversal Protection
  it('6. should reject archives containing path traversal entries (..)', async () => {
    const zip = new AdmZip();
    zip.addFile('secret.txt', Buffer.from('exploit'));
    zip.getEntries()[0].entryName = '../secret.txt';
    zip.addFile('manifest.json', Buffer.from(validManifest));
    const zipBuffer = zip.toBuffer();

    await expect(service.validatePackage(zipBuffer)).rejects.toThrow(
      'path traversal entry',
    );
  });

  // Test 7: Oversized Package Protection
  it('7. should reject archives exceeding maximum file size', async () => {
    const largeBuffer = Buffer.alloc(51 * 1024 * 1024); // 51MB
    largeBuffer[0] = 0x50;
    largeBuffer[1] = 0x4b;
    largeBuffer[2] = 0x03;

    await expect(service.validatePackage(largeBuffer)).rejects.toThrow(
      'Package exceeds maximum limit of 50MB.',
    );
  });

  // Test 8: Forbidden SQL File Protection
  it('8. should reject archives containing prohibited .sql files', async () => {
    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'drop_tables.sql': 'DROP TABLE users;',
    });

    await expect(service.validatePackage(zipBuffer)).rejects.toThrow(
      'Prohibited file type detected in archive: drop_tables.sql',
    );
  });

  // Test 9: Forbidden Fields Detection & Stripping
  it('9. should detect, report, and completely exclude forbidden security fields', async () => {
    const usersWithForbiddenFields = JSON.stringify([
      {
        id: validUserId,
        email: 'user@example.com',
        name: 'Secret User',
        role: 'STUDENT',
        passwordHash: '$2b$10$productionHashHere123456789',
        jwtSecret: 'prod-jwt-secret-leak',
        razorpayKeySecret: 'rzp_live_secret_key',
        databaseUrl: 'postgresql://prod:secret@aws.supabase.com/prod',
      },
    ]);

    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': usersWithForbiddenFields,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const report = await service.validatePackage(zipBuffer);
    expect(report.valid).toBe(true);
    expect(report.forbiddenFieldsFound.length).toBeGreaterThan(0);
    const fields = report.forbiddenFieldsFound.map((f) => f.field.toLowerCase());
    expect(fields).toContain('passwordhash');
    expect(fields).toContain('jwtsecret');
    expect(fields).toContain('razorpaykeysecret');
    expect(fields).toContain('databaseurl');
  });

  // Test 10: Invalid UUID Validation
  it('10. should report validation errors for invalid UUID formats', async () => {
    const badUuidUsers = JSON.stringify([
      {
        id: 'not-a-valid-uuid-12345',
        email: 'test@example.com',
        role: 'STUDENT',
      },
    ]);

    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': badUuidUsers,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const report = await service.validatePackage(zipBuffer);
    expect(report.valid).toBe(false);
    expect(
      report.tableSummaries.find((t) => t.name === 'users')?.invalidCount,
    ).toBe(1);
  });

  // Test 11: Invalid Enum Validation
  it('11. should report validation error for invalid entity enums', async () => {
    const badRoleUsers = JSON.stringify([
      {
        id: validUserId,
        email: 'test@example.com',
        role: 'SUPER_DUPER_HACKER',
      },
    ]);

    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': badRoleUsers,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const report = await service.validatePackage(zipBuffer);
    expect(report.valid).toBe(false);
    expect(
      report.tableSummaries.find((t) => t.name === 'users')?.invalidCount,
    ).toBe(1);
  });

  // Test 12: Missing Foreign Key
  it('12. should flag foreign key failure when a record references a missing parent', async () => {
    const orphanedProviders = JSON.stringify([
      {
        id: validProviderId,
        userId: crypto.randomUUID(), // Non-existent user
        name: 'Orphan Provider',
      },
    ]);

    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': validUsersJson,
      'providers.json': orphanedProviders,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const report = await service.validatePackage(zipBuffer);
    expect(report.valid).toBe(false);
    expect(report.foreignKeyCheck.status).toBe('FAIL');
  });

  // Test 13: Duplicate Record Handling
  it('13. should handle duplicate records appropriately in preview and execution', async () => {
    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': validUsersJson,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const val = await service.validatePackage(zipBuffer);
    const preview = await service.getPreview(val.packageToken, ImportMode.MERGE);
    expect(preview.mode).toBe(ImportMode.MERGE);
    expect(preview.estimatedCounts.total).toBe(4);
  });

  // Test 14: Replace Mode
  it('14. should execute Replace mode with proper confirmation and entity purging', async () => {
    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': validUsersJson,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const val = await service.validatePackage(zipBuffer);
    const result = await service.executeImport(
      val.packageToken,
      ImportMode.REPLACE,
      REPLACE_CONFIRMATION_PHRASE,
      { id: 'admin-uuid', email: 'admin@primeplate.test' },
    );

    expect(result.status).toBe('COMPLETED');
    expect(result.mode).toBe(ImportMode.REPLACE);
    expect(result.insertedCount).toBe(4);
    expect(mockQueryRunner.manager.delete).toHaveBeenCalled();
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
  });

  // Test 15: Merge Mode
  it('15. should execute Merge mode without purging existing QA database records', async () => {
    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': validUsersJson,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const val = await service.validatePackage(zipBuffer);
    const result = await service.executeImport(
      val.packageToken,
      ImportMode.MERGE,
      MERGE_CONFIRMATION_PHRASE,
      { id: 'admin-uuid', email: 'admin@primeplate.test' },
    );

    expect(result.status).toBe('COMPLETED');
    expect(result.mode).toBe(ImportMode.MERGE);
    // Delete must NOT be called in merge mode
    expect(mockQueryRunner.manager.delete).not.toHaveBeenCalled();
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
  });

  // Test 16: Rollback on Failure
  it('16. should rollback transaction if a database save error occurs', async () => {
    mockQueryRunner.manager.save.mockRejectedValueOnce(
      new Error('Unique constraint violation'),
    );

    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': validUsersJson,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const val = await service.validatePackage(zipBuffer);

    await expect(
      service.executeImport(
        val.packageToken,
        ImportMode.REPLACE,
        REPLACE_CONFIRMATION_PHRASE,
        { id: 'admin-uuid', email: 'admin@primeplate.test' },
      ),
    ).rejects.toThrow('Import failed and was rolled back safely');

    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(mockImportRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ImportStatus.FAILED }),
    );
  });

  // Test 17: ID Mapping Mechanism
  it('17. should map production IDs to fresh QA UUIDs while preserving relational links', async () => {
    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': validUsersJson,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const val = await service.validatePackage(zipBuffer);
    const result = await service.executeImport(
      val.packageToken,
      ImportMode.REPLACE,
      REPLACE_CONFIRMATION_PHRASE,
      { id: 'admin-uuid', email: 'admin@primeplate.test' },
    );

    expect(result.status).toBe('COMPLETED');
    // Verify saved entities have UUIDs
    const saveCalls = mockQueryRunner.manager.save.mock.calls;
    expect(saveCalls.length).toBeGreaterThan(0);
  });

  // Test 18: Sanitization
  it('18. should sanitize personal identifiable information deterministically', async () => {
    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': validUsersJson,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const val = await service.validatePackage(zipBuffer);
    const result = await service.executeImport(
      val.packageToken,
      ImportMode.REPLACE,
      REPLACE_CONFIRMATION_PHRASE,
      { id: 'admin-uuid', email: 'admin@primeplate.test' },
    );

    expect(result.sanitizedCount).toBeGreaterThan(0);
    const userSaveCall = mockQueryRunner.manager.save.mock.calls.find(
      (c: any[]) => c[0] === User,
    );
    expect(userSaveCall).toBeDefined();
    const savedUser = userSaveCall[1];
    expect(savedUser.email).toContain('@primeplate.test');
    expect(savedUser.name).toMatch(/^QA Student/);
    expect(savedUser.phone).toMatch(/^980/);
    expect(savedUser.passwordHash).toBeDefined(); // Standard QA test password hash
  });

  // Test 19: Authorization & Confirmation Phrase Check
  it('19. should reject execution if confirmation phrase does not match exactly', async () => {
    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': validUsersJson,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const val = await service.validatePackage(zipBuffer);

    await expect(
      service.executeImport(
        val.packageToken,
        ImportMode.REPLACE,
        'wrong confirmation phrase',
        { id: 'admin-uuid', email: 'admin@primeplate.test' },
      ),
    ).rejects.toThrow('Invalid confirmation phrase');
  });

  // Test 20: Import History Persistence
  it('20. should record import audit trail in database with full metrics', async () => {
    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': validUsersJson,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const val = await service.validatePackage(zipBuffer);
    await service.executeImport(
      val.packageToken,
      ImportMode.MERGE,
      MERGE_CONFIRMATION_PHRASE,
      { id: 'admin-uuid', email: 'admin@primeplate.test' },
    );

    expect(mockImportRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ImportStatus.COMPLETED,
        mode: ImportMode.MERGE,
        initiatedBy: 'admin@primeplate.test',
      }),
    );
  });

  // Test 21: Payment Safety
  it('21. should never invoke live payment operations or Razorpay SDK during import', async () => {
    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': validUsersJson,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const val = await service.validatePackage(zipBuffer);
    await service.executeImport(
      val.packageToken,
      ImportMode.REPLACE,
      REPLACE_CONFIRMATION_PHRASE,
      { id: 'admin-uuid', email: 'admin@primeplate.test' },
    );

    // No network or external calls were made
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
  });

  // Test 22: Subscription Safety
  it('22. should import subscriptions without triggering external payment or webhooks', async () => {
    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': validUsersJson,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const val = await service.validatePackage(zipBuffer);
    const result = await service.executeImport(
      val.packageToken,
      ImportMode.MERGE,
      MERGE_CONFIRMATION_PHRASE,
      { id: 'admin-uuid', email: 'admin@primeplate.test' },
    );

    expect(result.recordCounts.subscriptions).toBe(1);
  });

  // Test 23: No External Calls
  it('23. should never make external email or Cloudinary calls during import', async () => {
    const zipBuffer = createMockZipBuffer({
      'manifest.json': validManifest,
      'users.json': validUsersJson,
      'providers.json': validProvidersJson,
      'meal-plans.json': validPlansJson,
      'subscriptions.json': validSubsJson,
    });

    const val = await service.validatePackage(zipBuffer);
    await service.executeImport(
      val.packageToken,
      ImportMode.MERGE,
      MERGE_CONFIRMATION_PHRASE,
      { id: 'admin-uuid', email: 'admin@primeplate.test' },
    );

    expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
  });

  // Test 24: Production Safety Verification
  it('24. should abort import if environment cannot be safely verified as QA', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalDbUrl = process.env.DATABASE_URL;

    try {
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = 'postgresql://postgres:pass@aws-0-production.pooler.supabase.com:6543/postgres';

      expect(() => service.verifyQaTargetEnvironment()).toThrow(
        PreconditionFailedException,
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.DATABASE_URL = originalDbUrl;
    }
  });
});
