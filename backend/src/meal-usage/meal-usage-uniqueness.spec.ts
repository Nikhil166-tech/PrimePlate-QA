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
      userId: providerAId,
      user: { id: providerAId },
      name: 'Provider A (Lunch)',
      qrToken: qrTokenA,
    };

    const mockProviderB = {
      id: providerBId,
      userId: providerBId,
      user: { id: providerBId },
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

    it('4. Same student + SAME provider + multiple active subscriptions (Lunch + Dinner) maintains strict subscription isolation', async () => {
      // Both subscriptions belong to Provider A
      const mockSubA1 = {
        id: 'sub-lunch-prov-a',
        student: { id: studentId, name: 'Student Multi', email: 'multi@student.test' },
        mealPlan: {
          id: 'plan-lunch-a',
          provider: mockProviderA,
          title: 'Lunch Only Saver Plan',
        },
        status: SubscriptionStatus.ACTIVE,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      };

      const mockSubA2 = {
        id: 'sub-dinner-prov-a',
        student: { id: studentId, name: 'Student Multi', email: 'multi@student.test' },
        mealPlan: {
          id: 'plan-dinner-a',
          provider: mockProviderA,
          title: 'Dinner Only Campus Box',
        },
        status: SubscriptionStatus.ACTIVE,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      };

      providerRepo.findOne.mockResolvedValue(mockProviderA);
      subRepo.find.mockResolvedValue([mockSubA1, mockSubA2]);

      // 4a. Initial check-in for Subscription A1
      usageRepo.find.mockImplementation((opts: any) => {
        // When checking for existing check-ins today across active provider subscriptions
        if (opts?.where?.subscriptionId?._value || Array.isArray(opts?.where?.subscriptionId)) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      });
      usageRepo.findOne.mockResolvedValue(null);

      const checkIn1 = await service.checkIn(studentId, qrTokenA, mockSubA1.id);
      expect(checkIn1.code).toBe('CHECKED_IN');
      expect(usageRepo.save).toHaveBeenCalled();

      // 4b. Provider today attendance view: Sub A1 is checked in, Sub A2 is NOT checked in
      const recordedUsageSubA1 = {
        id: 'usage-sub-a1-today',
        studentId,
        subscriptionId: mockSubA1.id,
        providerId: providerAId,
        mealDate: todayIst,
        status: MealUsageStatus.USED,
        scannedAt: new Date(),
      };

      usageRepo.find.mockImplementation((opts: any) => {
        if (opts?.where?.providerId === providerAId && opts?.where?.mealDate === todayIst) {
          return Promise.resolve([recordedUsageSubA1]);
        }
        return Promise.resolve([]);
      });

      const todayAttendance = await service.getProviderTodayCheckIns(providerAId, providerAId);
      expect(todayAttendance.summary.activeSubscribers).toBe(2);
      expect(todayAttendance.summary.todayCheckIns).toBe(1);
      expect(todayAttendance.summary.notCheckedIn).toBe(1);

      const sub1Item = todayAttendance.subscribers.find((s: any) => s.subscriptionId === mockSubA1.id);
      const sub2Item = todayAttendance.subscribers.find((s: any) => s.subscriptionId === mockSubA2.id);
      expect(sub1Item.checkedIn).toBe(true);
      expect(sub1Item.status).toBe('CHECKED_IN');
      expect(sub2Item.checkedIn).toBe(false);
      expect(sub2Item.status).toBe('NOT_CHECKED_IN');

      // 4c. Provider subscriber attendance history for Sub A2 must NOT contain Sub A1's check-in
      subRepo.findOne.mockImplementation((opts: any) => {
        if (opts?.where?.id === mockSubA2.id) return Promise.resolve(mockSubA2);
        if (opts?.where?.id === mockSubA1.id) return Promise.resolve(mockSubA1);
        return Promise.resolve(null);
      });

      usageRepo.find.mockImplementation((opts: any) => {
        if (opts?.where?.subscriptionId === mockSubA2.id) {
          return Promise.resolve([]); // Sub A2 has no usages
        }
        if (opts?.where?.subscriptionId === mockSubA1.id) {
          return Promise.resolve([recordedUsageSubA1]);
        }
        return Promise.resolve([]);
      });

      const sub2History = await service.getProviderSubscriberAttendanceHistory(
        providerAId,
        mockSubA2.id,
        providerAId,
      );
      const sub2TodayDay = sub2History.days.find((d: any) => d.date === todayIst);
      expect(sub2TodayDay.checkedIn).toBe(false);
      expect(sub2TodayDay.status).toBe('NOT_CHECKED_IN');
      expect(sub2History.attendedDays).toBe(0);

      // Provider subscriber attendance history for Sub A1 DOES show Sub A1's check-in
      const sub1History = await service.getProviderSubscriberAttendanceHistory(
        providerAId,
        mockSubA1.id,
        providerAId,
      );
      const sub1TodayDay = sub1History.days.find((d: any) => d.date === todayIst);
      expect(sub1TodayDay.checkedIn).toBe(true);
      expect(sub1TodayDay.status).toBe('CHECKED_IN');
      expect(sub1History.attendedDays).toBe(1);

      // 4d. Check in Subscription A2 afterward
      usageRepo.findOne.mockResolvedValue(null);
      const checkIn2 = await service.checkIn(studentId, qrTokenA, mockSubA2.id);
      expect(checkIn2.code).toBe('CHECKED_IN');

      // 4e. Repeating check-in for Sub A1 is idempotent
      usageRepo.findOne.mockImplementation((opts: any) => {
        if (opts?.where?.subscriptionId === mockSubA1.id && opts?.where?.mealDate === todayIst) {
          return Promise.resolve(recordedUsageSubA1);
        }
        return Promise.resolve(null);
      });
      const checkInDuplicate = await service.checkIn(studentId, qrTokenA, mockSubA1.id);
      expect(checkInDuplicate.code).toBe('ALREADY_CHECKED_IN');

      // 4f. Student-facing history maintains subscription isolation
      usageRepo.find.mockResolvedValue([recordedUsageSubA1]);
      const studentHistory = await service.getStudentHistory(studentId);
      const studentSub1 = studentHistory.find((s: any) => s.subscriptionId === mockSubA1.id);
      const studentSub2 = studentHistory.find((s: any) => s.subscriptionId === mockSubA2.id);

      expect(studentSub1.totalUsedCount).toBe(1);
      expect(studentSub2.totalUsedCount).toBe(0);
    });
  });
});
