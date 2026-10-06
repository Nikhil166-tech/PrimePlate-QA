import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MealUsageService } from './meal-usage.service';
import {
  MealUsage,
  MealUsageStatus,
  MealUsageSource,
} from './meal-usage.entity';
import { MealUsageAudit } from './meal-usage-audit.entity';
import { MealProvider } from '../providers/meal-provider.entity';
import {
  Subscription,
  SubscriptionStatus,
} from '../subscriptions/subscription.entity';
import { User } from '../users/user.entity';

describe('MealUsageService — Provider QR + Daily Meal Check-in System', () => {
  jest.setTimeout(30000);

  let service: MealUsageService;
  let usageRepo: jest.Mocked<Repository<MealUsage>>;
  let auditRepo: jest.Mocked<Repository<MealUsageAudit>>;
  let providerRepo: jest.Mocked<Repository<MealProvider>>;
  let subRepo: jest.Mocked<Repository<Subscription>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let dataSource: any;

  const studentAId = 'student-uuid-a';
  const studentBId = 'student-uuid-b';
  const providerAId = 'provider-uuid-a';
  const providerBId = 'provider-uuid-b';
  const providerOwnerAId = 'owner-uuid-a';
  const providerOwnerBId = 'owner-uuid-b';
  const qrTokenA = 'pp_qr_11112222333344445555666677778888';
  const qrTokenB = 'pp_qr_aaaabbbbccccddddeeeeffff00001111';

  beforeEach(async () => {
    usageRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((dto) => ({
        id: 'usage-new-uuid',
        createdAt: new Date(),
        ...dto,
      })),
      save: jest.fn((entity) =>
        Promise.resolve({ id: entity.id || 'usage-saved-uuid', ...entity }),
      ),
    } as any;

    auditRepo = {
      create: jest.fn((dto) => ({
        id: 'audit-new-uuid',
        createdAt: new Date(),
        ...dto,
      })),
      save: jest.fn((entity) =>
        Promise.resolve({ id: 'audit-saved-uuid', ...entity }),
      ),
      find: jest.fn(),
    } as any;

    providerRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
    } as any;

    subRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn((entity) => Promise.resolve(entity)),
    } as any;

    userRepo = {
      findOne: jest.fn(),
    } as any;

    dataSource = {
      transaction: jest.fn((cb) =>
        cb({
          create: (entityClass: any, dto: any) => ({
            id: entityClass === MealUsage ? 'tx-usage-id' : 'tx-audit-id',
            ...dto,
          }),
          save: (_entityClass: any, entity: any) => Promise.resolve(entity),
        }),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MealUsageService,
        { provide: getRepositoryToken(MealUsage), useValue: usageRepo },
        { provide: getRepositoryToken(MealUsageAudit), useValue: auditRepo },
        { provide: getRepositoryToken(MealProvider), useValue: providerRepo },
        { provide: getRepositoryToken(Subscription), useValue: subRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<MealUsageService>(MealUsageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Provider QR Generation & Security', () => {
    it('1.1 SHOULD return provider permanent QR and data URL for authenticated owner', async () => {
      const mockProvider = {
        id: providerAId,
        name: 'Gourmet Tiffin Express',
        userId: providerOwnerAId,
        qrToken: qrTokenA,
      };
      providerRepo.findOne.mockResolvedValue(mockProvider as any);

      const result = await service.getOrCreateProviderQr(
        providerOwnerAId,
        providerAId,
      );

      expect(result.providerId).toBe(providerAId);
      expect(result.providerName).toBe('Gourmet Tiffin Express');
      expect(result.qrToken).toBe(qrTokenA);
      expect(result.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    });

    it('1.2 SHOULD automatically generate and persist secure permanent token if not present', async () => {
      const mockProvider = {
        id: providerAId,
        name: 'Gourmet Tiffin Express',
        userId: providerOwnerAId,
        qrToken: null,
      };
      providerRepo.findOne.mockResolvedValue(mockProvider as any);

      const result = await service.getOrCreateProviderQr(
        providerOwnerAId,
        providerAId,
      );

      expect(result.qrToken).toMatch(/^pp_qr_[0-9a-f]{32}$/);
      expect(providerRepo.save).toHaveBeenCalled();
    });

    it('1.3 SHOULD REJECT if Provider B attempts to fetch Provider A QR (IDOR protection)', async () => {
      const mockProviderA = {
        id: providerAId,
        name: 'Gourmet Tiffin Express',
        userId: providerOwnerAId,
        user: { id: providerOwnerAId },
        qrToken: qrTokenA,
      };
      providerRepo.findOne.mockResolvedValue(mockProviderA as any);

      await expect(
        service.getOrCreateProviderQr(providerOwnerBId, providerAId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Student Daily Check-in & Validations', () => {
    const todayIst = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const mockValidProviderA = {
      id: providerAId,
      name: 'Gourmet Tiffin Express',
      qrToken: qrTokenA,
    };

    const mockActiveSubA = {
      id: 'sub-active-a',
      student: { id: studentAId },
      mealPlan: {
        id: 'plan-1',
        title: 'Monthly Deluxe Thali',
        provider: { id: providerAId, name: 'Gourmet Tiffin Express' },
      },
      status: SubscriptionStatus.ACTIVE,
      startDate: '2026-08-01',
      endDate: '2026-10-30',
    };

    it('2.1 SHOULD successfully record first check-in of the day for valid subscriber', async () => {
      providerRepo.findOne.mockResolvedValue(mockValidProviderA as any);
      subRepo.find.mockResolvedValue([mockActiveSubA as any]);
      usageRepo.findOne.mockResolvedValue(null); // No previous check-in today

      const res = await service.checkIn(studentAId, qrTokenA);

      expect(res.code).toBe('CHECKED_IN');
      expect(res.status).toBe('USED');
      expect(res.message).toContain('Meal Checked In!');
      expect(res.mealDate).toBe(todayIst);
      expect(usageRepo.save).toHaveBeenCalled();
    });

    it('2.2 SHOULD NOT create duplicate row on second scan today and return ALREADY_CHECKED_IN', async () => {
      providerRepo.findOne.mockResolvedValue(mockValidProviderA as any);
      subRepo.find.mockResolvedValue([mockActiveSubA as any]);
      const existingUsage = {
        id: 'usage-123',
        studentId: studentAId,
        mealDate: todayIst,
        status: MealUsageStatus.USED,
        scannedAt: new Date(),
      };
      usageRepo.findOne.mockResolvedValue(existingUsage as any);

      const res = await service.checkIn(studentAId, qrTokenA);

      expect(res.code).toBe('ALREADY_CHECKED_IN');
      expect(res.message).toContain("You're already checked in!");
      expect(usageRepo.save).not.toHaveBeenCalled();
    });

    it('2.3 SHOULD safely handle concurrency / race condition via database unique constraint', async () => {
      providerRepo.findOne.mockResolvedValue(mockValidProviderA as any);
      subRepo.find.mockResolvedValue([mockActiveSubA as any]);
      // First findOne returned null, but simultaneous request saved first
      usageRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'usage-winner-id',
        studentId: studentAId,
        mealDate: todayIst,
        status: MealUsageStatus.USED,
        scannedAt: new Date(),
      } as any);

      // Simulate PostgreSQL duplicate key violation code 23505
      usageRepo.save.mockRejectedValueOnce({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "UQ_meal_usages_student_date"',
      });

      const res = await service.checkIn(studentAId, qrTokenA);

      expect(res.code).toBe('ALREADY_CHECKED_IN');
      expect(res.message).toContain("You're already checked in!");
    });

    it('2.4 SHOULD REJECT when Student A subscribed to Provider A scans Provider B QR', async () => {
      const mockProviderB = {
        id: providerBId,
        name: 'South Indian Mess',
        qrToken: qrTokenB,
      };
      providerRepo.findOne.mockResolvedValue(mockProviderB as any);
      // Student A has subscription with Provider A only
      subRepo.find.mockResolvedValue([mockActiveSubA as any]);

      await expect(service.checkIn(studentAId, qrTokenB)).rejects.toThrow(
        "This meal QR isn't linked to your active subscription.",
      );
      expect(usageRepo.save).not.toHaveBeenCalled();
    });

    it('2.5 SHOULD REJECT when student has no subscription at all with the provider', async () => {
      providerRepo.findOne.mockResolvedValue(mockValidProviderA as any);
      subRepo.find.mockResolvedValue([]); // No subscriptions

      await expect(service.checkIn(studentBId, qrTokenA)).rejects.toThrow(
        "You don't have an active subscription with this provider.",
      );
      expect(usageRepo.save).not.toHaveBeenCalled();
    });

    it('2.6 SHOULD REJECT if subscription is expired (endDate < today)', async () => {
      const mockExpiredSub = {
        ...mockActiveSubA,
        status: SubscriptionStatus.ACTIVE,
        startDate: '2026-07-01',
        endDate: '2026-07-31', // expired
      };
      providerRepo.findOne.mockResolvedValue(mockValidProviderA as any);
      subRepo.find.mockResolvedValue([mockExpiredSub as any]);

      await expect(service.checkIn(studentAId, qrTokenA)).rejects.toThrow(
        "Your subscription isn't active today.",
      );
      expect(usageRepo.save).not.toHaveBeenCalled();
    });

    it('2.7 SHOULD REJECT if subscription has not started yet (startDate > today)', async () => {
      const mockFutureSub = {
        ...mockActiveSubA,
        status: SubscriptionStatus.ACTIVE,
        startDate: '2026-12-01',
        endDate: '2026-12-31',
      };
      providerRepo.findOne.mockResolvedValue(mockValidProviderA as any);
      subRepo.find.mockResolvedValue([mockFutureSub as any]);

      await expect(service.checkIn(studentAId, qrTokenA)).rejects.toThrow(
        "Your subscription isn't active today.",
      );
    });

    it('2.8 SHOULD REJECT invalid or corrupted QR token without database writes', async () => {
      await expect(
        service.checkIn(studentAId, 'invalid-random-string'),
      ).rejects.toThrow("That isn't a valid PrimePlate meal QR.");

      providerRepo.findOne.mockResolvedValue(null);
      await expect(
        service.checkIn(studentAId, 'pp_qr_nonexistent999999999999'),
      ).rejects.toThrow("That isn't a valid PrimePlate meal QR.");
      expect(usageRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('3. Student Meal History & Checklist', () => {
    it('3.1 SHOULD return student history checklist with used and not-checked-in days', async () => {
      const mockSub = {
        id: 'sub-hist-1',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
        status: SubscriptionStatus.ACTIVE,
        mealPlan: {
          title: '30 Day Plan',
          provider: { name: 'Gourmet Tiffin Express', address: 'Koramangala' },
        },
      };
      subRepo.find.mockResolvedValue([mockSub as any]);

      const mockUsage = {
        id: 'u-1',
        subscriptionId: 'sub-hist-1',
        studentId: studentAId,
        mealDate: '2026-09-01',
        status: MealUsageStatus.USED,
        scannedAt: new Date('2026-09-01T12:30:00Z'),
      };
      usageRepo.find.mockResolvedValue([mockUsage as any]);

      const history = await service.getStudentHistory(studentAId);

      expect(history).toHaveLength(1);
      expect(history[0].planTitle).toBe('30 Day Plan');
      expect(history[0].providerName).toBe('Gourmet Tiffin Express');
      expect(history[0].days.length).toBeGreaterThan(0);
      const day1 = history[0].days.find((d: any) => d.date === '2026-09-01');
      expect(day1?.status).toBe('USED');
    });
  });

  describe('4. Provider Daily Attendance & Audited Correction', () => {
    const todayIst = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    it('4.1 SHOULD return provider today check-in metrics and subscriber list', async () => {
      const mockProvider = {
        id: providerAId,
        name: 'Gourmet Tiffin Express',
        userId: providerOwnerAId,
      };
      providerRepo.findOne.mockResolvedValue(mockProvider as any);

      const mockSubs = [
        {
          id: 'sub-1',
          student: {
            id: studentAId,
            name: 'Student One',
            phone: '+919800000001',
          },
          mealPlan: { title: 'Lunch Plan' },
          startDate: '2026-08-01',
          endDate: '2026-10-31',
        },
        {
          id: 'sub-2',
          student: {
            id: studentBId,
            name: 'Student Two',
            phone: '+919800000002',
          },
          mealPlan: { title: 'Lunch Plan' },
          startDate: '2026-08-01',
          endDate: '2026-10-31',
        },
      ];
      subRepo.find.mockResolvedValue(mockSubs as any);

      const mockUsages = [
        {
          id: 'u-1',
          studentId: studentAId,
          subscriptionId: 'sub-1',
          mealDate: todayIst,
          scannedAt: new Date(),
        },
      ];
      usageRepo.find.mockResolvedValue(mockUsages as any);

      const result = await service.getProviderTodayCheckIns(
        providerOwnerAId,
        providerAId,
      );

      expect(result.summary.activeSubscribers).toBe(2);
      expect(result.summary.todayCheckIns).toBe(1);
      expect(result.summary.notCheckedIn).toBe(1);
      expect(result.subscribers[0].checkedIn).toBe(true);
      expect(result.subscribers[1].checkedIn).toBe(false);
    });

    it('4.2 SHOULD record audited provider correction with mandatory reason and actor', async () => {
      const mockProvider = {
        id: providerAId,
        userId: providerOwnerAId,
      };
      providerRepo.findOne.mockResolvedValue(mockProvider as any);

      const mockSub = {
        id: 'sub-to-correct',
        student: { id: studentBId },
        mealPlan: { provider: { id: providerAId } },
        status: SubscriptionStatus.ACTIVE,
        startDate: '2026-08-01',
        endDate: '2026-10-31',
      };
      subRepo.findOne.mockResolvedValue(mockSub as any);
      usageRepo.findOne.mockResolvedValue(null); // Not checked in yet

      const res = await service.correctCheckIn(providerOwnerAId, {
        providerId: providerAId,
        subscriptionId: 'sub-to-correct',
        reason: 'Scanner camera failure reported by student at counter',
      });

      expect(res.code).toBe('CORRECTION_RECORDED');
      expect(dataSource.transaction).toHaveBeenCalled();
    });

    it('4.3 SHOULD NOT create duplicate row when provider attempts correction on already checked-in student', async () => {
      const mockProvider = {
        id: providerAId,
        userId: providerOwnerAId,
      };
      providerRepo.findOne.mockResolvedValue(mockProvider as any);

      const mockSub = {
        id: 'sub-already-checked',
        student: { id: studentAId },
        mealPlan: { provider: { id: providerAId } },
        status: SubscriptionStatus.ACTIVE,
        startDate: '2026-08-01',
        endDate: '2026-10-31',
      };
      subRepo.findOne.mockResolvedValue(mockSub as any);
      usageRepo.findOne.mockResolvedValue({
        id: 'existing-usage-id',
        studentId: studentAId,
        mealDate: todayIst,
        status: MealUsageStatus.USED,
        scannedAt: new Date(),
      } as any);

      const res = await service.correctCheckIn(providerOwnerAId, {
        providerId: providerAId,
        subscriptionId: 'sub-already-checked',
        reason: 'Verification request',
      });

      expect(res.code).toBe('ALREADY_CHECKED_IN');
      expect(auditRepo.save).toHaveBeenCalled(); // Audits the review
      expect(dataSource.transaction).not.toHaveBeenCalled(); // No second usage record created
    });

    it('4.4 SHOULD REJECT correction with missing or inadequate reason', async () => {
      await expect(
        service.correctCheckIn(providerOwnerAId, {
          providerId: providerAId,
          subscriptionId: 'sub-1',
          reason: '', // Invalid reason
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('4.5 SHOULD REJECT correction if provider attempts to modify another provider subscriber (IDOR)', async () => {
      const mockProviderA = {
        id: providerAId,
        userId: providerOwnerAId,
        user: { id: providerOwnerAId },
      };
      providerRepo.findOne.mockResolvedValue(mockProviderA as any);

      // Sub belongs to Provider B
      subRepo.findOne.mockResolvedValue(null);

      await expect(
        service.correctCheckIn(providerOwnerAId, {
          providerId: providerAId,
          subscriptionId: 'sub-of-provider-b',
          reason: 'Valid reason for invalid provider subscription',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('5. Provider Subscriber Monthly Attendance History', () => {
    it('5.1 SHOULD return whole-month attendance checklist and statistics for a subscriber', async () => {
      const mockProviderA = {
        id: providerAId,
        userId: providerOwnerAId,
        user: { id: providerOwnerAId },
      };
      providerRepo.findOne.mockResolvedValue(mockProviderA as any);

      const startDate = '2026-09-01';
      const endDate = '2026-09-05';
      const mockSub = {
        id: 'sub-hist-1',
        student: {
          id: studentAId,
          name: 'Alice',
          email: 'alice@example.com',
          phone: '9876543210',
        },
        mealPlan: {
          title: 'Premium Lunch & Dinner',
          provider: { id: providerAId },
        },
        status: SubscriptionStatus.ACTIVE,
        startDate,
        endDate,
      };
      subRepo.findOne.mockResolvedValue(mockSub as any);

      usageRepo.find.mockImplementation((query: any) => {
        if (query.where?.subscriptionId === 'sub-hist-1') {
          return Promise.resolve([
            {
              id: 'usage-1',
              subscriptionId: 'sub-hist-1',
              studentId: studentAId,
              mealDate: '2026-09-01',
              status: MealUsageStatus.USED,
              source: MealUsageSource.QR_SCAN,
              scannedAt: new Date('2026-09-01T13:00:00Z'),
            },
          ] as any);
        }
        return Promise.resolve([]);
      });

      const res = await service.getProviderSubscriberAttendanceHistory(
        providerOwnerAId,
        'sub-hist-1',
        providerAId,
      );

      expect(res.subscriptionId).toBe('sub-hist-1');
      expect(res.student.name).toBe('Alice');
      expect(res.totalDays).toBe(5);
      expect(res.attendedDays).toBe(1);
      expect(res.days[0].date).toBe('2026-09-01');
      expect(res.days[0].status).toBe('CHECKED_IN');
      expect(res.days[0].checkedIn).toBe(true);
    });

    it('5.2 SHOULD REJECT when subscription is not found', async () => {
      const mockProviderA = {
        id: providerAId,
        userId: providerOwnerAId,
        user: { id: providerOwnerAId },
      };
      providerRepo.findOne.mockResolvedValue(mockProviderA as any);
      subRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getProviderSubscriberAttendanceHistory(
          providerOwnerAId,
          'non-existent-sub',
          providerAId,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('5.3 SHOULD REJECT when subscription belongs to a different provider kitchen (IDOR prevention)', async () => {
      const mockProviderA = {
        id: providerAId,
        userId: providerOwnerAId,
        user: { id: providerOwnerAId },
      };
      providerRepo.findOne.mockResolvedValue(mockProviderA as any);

      const mockSubOtherProvider = {
        id: 'sub-other',
        student: { id: studentBId },
        mealPlan: { provider: { id: providerBId } }, // belongs to provider B!
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      };
      subRepo.findOne.mockResolvedValue(mockSubOtherProvider as any);

      await expect(
        service.getProviderSubscriberAttendanceHistory(
          providerOwnerAId,
          'sub-other',
          providerAId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
