import {
  MealUsage,
  MealUsageStatus,
  MealUsageSource,
} from '../../meal-usage/meal-usage.entity';
import { MealUsageAudit } from '../../meal-usage/meal-usage-audit.entity';
import { User } from '../../users/user.entity';
import { Subscription } from '../../subscriptions/subscription.entity';
import { MealProvider } from '../../providers/meal-provider.entity';
import { QA_USERS, QA_PROVIDERS, QA_SUBSCRIPTIONS } from '../qa-seed.constants';
import { getRelativeDateIst, getRelativeTimestampIst } from '../date.helper';

export function buildQaMealUsages(): {
  usages: Partial<MealUsage>[];
  audits: Partial<MealUsageAudit>[];
} {
  const usages: Partial<MealUsage>[] = [];
  const audits: Partial<MealUsageAudit>[] = [];

  const prov1Id = QA_PROVIDERS[0].id;
  const prov1UserId = QA_USERS.PROVIDERS[0].id;
  const prov2Id = QA_PROVIDERS[1].id;

  const stu1Id = QA_USERS.STUDENTS[0].id;
  const sub1Id = QA_SUBSCRIPTIONS[0].id; // Active FULL_DAY (Student 1)

  const stu2Id = QA_USERS.STUDENTS[1].id;
  const sub2Id = QA_SUBSCRIPTIONS[1].id; // Expired FULL_DAY (Student 2)

  const stu3Id = QA_USERS.STUDENTS[2].id;
  const sub3Id = QA_SUBSCRIPTIONS[2].id; // Active LUNCH_ONLY (Student 3)
  const sub4Id = QA_SUBSCRIPTIONS[3].id; // Active DINNER_ONLY (Student 3)

  const stu4Id = QA_USERS.STUDENTS[3].id;
  const sub5Id = QA_SUBSCRIPTIONS[4].id; // Active FULL_DAY Provider B (Student 4)

  // 1. Student 1 (Sub 1): Checked-in today
  usages.push({
    id: '00000000-0000-4000-f000-000000000001',
    student: { id: stu1Id } as User,
    studentId: stu1Id,
    subscription: { id: sub1Id } as Subscription,
    subscriptionId: sub1Id,
    provider: { id: prov1Id } as MealProvider,
    providerId: prov1Id,
    mealDate: getRelativeDateIst(0),
    status: MealUsageStatus.USED,
    source: MealUsageSource.QR_SCAN,
    scannedAt: getRelativeTimestampIst(0, 13, 15),
  });

  // 2. Student 1 (Sub 1): Checked in on offset -1, -2 (offset -3 and -4 missed)
  usages.push({
    id: '00000000-0000-4000-f000-000000000002',
    student: { id: stu1Id } as User,
    studentId: stu1Id,
    subscription: { id: sub1Id } as Subscription,
    subscriptionId: sub1Id,
    provider: { id: prov1Id } as MealProvider,
    providerId: prov1Id,
    mealDate: getRelativeDateIst(-1),
    status: MealUsageStatus.USED,
    source: MealUsageSource.QR_SCAN,
    scannedAt: getRelativeTimestampIst(-1, 13, 30),
  });
  usages.push({
    id: '00000000-0000-4000-f000-000000000003',
    student: { id: stu1Id } as User,
    studentId: stu1Id,
    subscription: { id: sub1Id } as Subscription,
    subscriptionId: sub1Id,
    provider: { id: prov1Id } as MealProvider,
    providerId: prov1Id,
    mealDate: getRelativeDateIst(-2),
    status: MealUsageStatus.USED,
    source: MealUsageSource.QR_SCAN,
    scannedAt: getRelativeTimestampIst(-2, 13, 20),
  });

  // 3. Student 2 (Sub 2 - Expired): Historical check-ins (-30, -25, -20, -15, -10)
  // Other days missed -> 4 days calculated for recovery
  for (let i = 0; i < 5; i++) {
    const offset = -30 + i * 5;
    usages.push({
      id: `00000000-0000-4000-f000-00000000001${i + 1}`,
      student: { id: stu2Id } as User,
      studentId: stu2Id,
      subscription: { id: sub2Id } as Subscription,
      subscriptionId: sub2Id,
      provider: { id: prov1Id } as MealProvider,
      providerId: prov1Id,
      mealDate: getRelativeDateIst(offset),
      status: MealUsageStatus.USED,
      source: MealUsageSource.QR_SCAN,
      scannedAt: getRelativeTimestampIst(offset, 13, 0),
    });
  }

  // 4. Student 3: Dual subscription check-in on today (Lunch on Sub 3, Dinner on Sub 4)
  usages.push({
    id: '00000000-0000-4000-f000-000000000021',
    student: { id: stu3Id } as User,
    studentId: stu3Id,
    subscription: { id: sub3Id } as Subscription,
    subscriptionId: sub3Id,
    provider: { id: prov1Id } as MealProvider,
    providerId: prov1Id,
    mealDate: getRelativeDateIst(0),
    status: MealUsageStatus.USED,
    source: MealUsageSource.QR_SCAN,
    scannedAt: getRelativeTimestampIst(0, 12, 45),
  });
  usages.push({
    id: '00000000-0000-4000-f000-000000000022',
    student: { id: stu3Id } as User,
    studentId: stu3Id,
    subscription: { id: sub4Id } as Subscription,
    subscriptionId: sub4Id,
    provider: { id: prov1Id } as MealProvider,
    providerId: prov1Id,
    mealDate: getRelativeDateIst(0),
    status: MealUsageStatus.USED,
    source: MealUsageSource.QR_SCAN,
    scannedAt: getRelativeTimestampIst(0, 20, 15),
  });

  // 5. Student 4 (Sub 5 - Provider B): Checked in yesterday via Provider Correction
  const correctedUsageId = '00000000-0000-4000-f000-000000000031';
  usages.push({
    id: correctedUsageId,
    student: { id: stu4Id } as User,
    studentId: stu4Id,
    subscription: { id: sub5Id } as Subscription,
    subscriptionId: sub5Id,
    provider: { id: prov2Id } as MealProvider,
    providerId: prov2Id,
    mealDate: getRelativeDateIst(-1),
    status: MealUsageStatus.USED,
    source: MealUsageSource.PROVIDER_CORRECTION,
    scannedAt: getRelativeTimestampIst(-1, 14, 0),
  });

  audits.push({
    id: '00000000-0000-4000-f100-000000000001',
    mealUsageId: correctedUsageId,
    providerId: prov2Id,
    actorId: prov1UserId,
    subscriptionId: sub5Id,
    studentId: stu4Id,
    action: 'MANUAL_CORRECTION',
    reason: 'Student QR code scanner was temporarily offline at pickup',
    createdAt: getRelativeTimestampIst(-1, 14, 5),
  });

  return { usages, audits };
}
