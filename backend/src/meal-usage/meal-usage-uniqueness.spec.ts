import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MealUsageService } from './meal-usage.service';
import { MealUsage, MealUsageStatus } from './meal-usage.entity';
import { MealUsageAudit } from './meal-usage-audit.entity';
import { MealProvider } from '../providers/meal-provider.entity';
import {
  Subscription,
  SubscriptionStatus,
} from '../subscriptions/subscription.entity';
import { User } from '../users/user.entity';
import { DataSource } from 'typeorm';
import { UpdateMealUsageUniquenessToSubscriptionDate1786470000000 } from '../migrations/1786470000000-UpdateMealUsageUniquenessToSubscriptionDate';

describe('Meal Check-in Uniqueness Model — (subscriptionId, mealDate)', () => {
  let service: MealUsageService;
  let usageRepo: any;
  let providerRepo: any;
  let subRepo: any;

  const studentId = 'student-uuid-1';
  const providerAId = 'provider-uuid-a';
  const providerBId = 'provider-uuid-b';
  const subAId = 'sub-uuid-lunch-a';
  const subBId = 'sub-uuid-dinner-b';
  const qrTokenA = 'pp_qr_prov_a_token';
  const qrTokenB = 'pp_qr_prov_b_token';

  beforeEach(async () => {
    usageRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((data) => ({ id: 'usage-new', ...data })),
      save: jest.fn(async (data) => ({ id: 'usage-saved', ...data })),
    };

    providerRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    subRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MealUsageService,
        { provide: getRepositoryToken(MealUsage), useValue: usageRepo },
        {
          provide: getRepositoryToken(MealUsageAudit),
          useValue: { create: jest.fn(), save: jest.fn() },
        },
        { provide: getRepositoryToken(MealProvider), useValue: providerRepo },
        { provide: getRepositoryToken(Subscription), useValue: subRepo },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service = module.get<MealUsageService>(MealUsageService);
  });

  describe('Migration: UpdateMealUsageUniquenessToSubscriptionDate1786470000000', () => {
    it('should drop old student_date constraint and create UQ_meal_usages_subscription_date in PostgreSQL', async () => {
      const migration =
        new UpdateMealUsageUniquenessToSubscriptionDate1786470000000();
      const executedQueries: string[] = [];
      const mockQueryRunner: any = {
        connection: { options: { type: 'postgres' } },
        query: jest.fn(async (sql: string) => {
          executedQueries.push(sql);
        }),
      };

      await migration.up(mockQueryRunner);
      expect(mockQueryRunner.query).toHaveBeenCalled();
      const upSql = executedQueries[0];
      expect(upSql).toContain('UQ_meal_usages_student_date');
      expect(upSql).toContain('UQ_meal_usages_subscription_date');
      expect(upSql).toContain('UNIQUE ("subscriptionId", "mealDate")');
    });
  });

  describe('Multi-provider / Multi-meal Check-in Entitlement Semantics', () => {
    const todayIst = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const mockProviderA = {
      id: providerAId,
      name: 'Provider A (Lunch)',
      qrToken: qrTokenA,
    };

    const mockProviderB = {
      id: providerBId,
      name: 'Provider B (Dinner)',
      qrToken: qrTokenB,
    };

    const mockSubA = {
      id: subAId,
      student: { id: studentId },
      mealPlan: {
        id: 'plan-lunch',
        provider: mockProviderA,
        title: 'Lunch Plan',
      },
      status: SubscriptionStatus.ACTIVE,
      startDate: '2026-08-01',
      endDate: '2026-12-31',
    };

    const mockSubB = {
      id: subBId,
      student: { id: studentId },
      mealPlan: {
        id: 'plan-dinner',
        provider: mockProviderB,
        title: 'Dinner Plan',
      },
      status: SubscriptionStatus.ACTIVE,
      startDate: '2026-08-01',
      endDate: '2026-12-31',
    };

    it('1. Same subscription + same day + second check-in → REJECTED with ALREADY_CHECKED_IN', async () => {
      providerRepo.findOne.mockResolvedValue(mockProviderA);
      subRepo.find.mockResolvedValue([mockSubA]);

      // Simulate existing check-in already recorded today for subA
      usageRepo.findOne.mockImplementation((opts: any) => {
        if (
          opts?.where?.subscriptionId === subAId &&
          opts?.where?.mealDate === todayIst
        ) {
          return Promise.resolve({
            id: 'usage-sub-a-today',
            subscriptionId: subAId,
            mealDate: todayIst,
            status: MealUsageStatus.USED,
            scannedAt: new Date(),
          });
        }
        return Promise.resolve(null);
      });

      const res = await service.checkIn(studentId, qrTokenA);

      expect(res.code).toBe('ALREADY_CHECKED_IN');
      expect(res.message).toContain('already checked in');
      expect(usageRepo.save).not.toHaveBeenCalled();
    });

    it('2 & 3. Different subscription + different provider + same day → ALLOWED (Lunch at Prov A & Dinner at Prov B)', async () => {
      // Student has already checked in for Provider A (Lunch)
      // Now student scans Provider B (Dinner) on the same day
      providerRepo.findOne.mockResolvedValue(mockProviderB);
      subRepo.find.mockResolvedValue([mockSubA, mockSubB]);

      // No usage exists yet for subB today (even though subA had one)
      usageRepo.findOne.mockImplementation((opts: any) => {
        if (
          opts?.where?.subscriptionId === subBId &&
          opts?.where?.mealDate === todayIst
        ) {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      const res = await service.checkIn(studentId, qrTokenB);

      expect(res.code).toBe('CHECKED_IN');
      expect(res.status).toBe(MealUsageStatus.USED);
      expect(res.providerName).toBe('Provider B (Dinner)');
      expect(usageRepo.save).toHaveBeenCalled();
    });
  });
});
