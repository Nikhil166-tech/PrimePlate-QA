import {
  MealRecovery,
  MealRecoveryStatus,
} from '../../meal-recovery/meal-recovery.entity';
import { QA_USERS, QA_PROVIDERS, QA_SUBSCRIPTIONS } from '../qa-seed.constants';
import { getRelativeTimestampIst } from '../date.helper';

export function buildQaMealRecoveries(): Partial<MealRecovery>[] {
  const prov1Id = QA_PROVIDERS[0].id; // Provider A: Recovery enabled (80%)

  const stu1Id = QA_USERS.STUDENTS[0].id;
  const stu2Id = QA_USERS.STUDENTS[1].id;

  const sub2Id = QA_SUBSCRIPTIONS[1].id; // Expired FULL_DAY sub (Student 2)
  const sub6Id = QA_SUBSCRIPTIONS[5].id; // Past expired FULL_DAY sub (Student 1)

  return [
    // Scenario A: AVAILABLE
    // 5 missed days, 80% recovery -> 4 recovered, 0 used, 4 remaining
    {
      id: '00000000-0000-4000-8000-000000000001',
      studentId: stu2Id,
      providerId: prov1Id,
      sourceSubscriptionId: sub2Id,
      missedDays: 5,
      recoveryRate: 80,
      recoveredDays: 4,
      usedDays: 0,
      remainingDays: 4,
      status: MealRecoveryStatus.AVAILABLE,
      processedAt: getRelativeTimestampIst(-4, 18, 0),
    },

    // Scenario B: PARTIALLY_USED
    // 5 missed days, 80% recovery -> 4 recovered, 2 used, 2 remaining
    {
      id: '00000000-0000-4000-8000-000000000002',
      studentId: stu1Id,
      providerId: prov1Id,
      sourceSubscriptionId: sub6Id,
      missedDays: 5,
      recoveryRate: 80,
      recoveredDays: 4,
      usedDays: 2,
      remainingDays: 2,
      status: MealRecoveryStatus.PARTIALLY_USED,
      processedAt: getRelativeTimestampIst(-34, 19, 0),
    },
  ];
}
