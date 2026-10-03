import {
  Subscription,
  SubscriptionStatus,
} from '../../subscriptions/subscription.entity';
import { User } from '../../users/user.entity';
import { MealPlan } from '../../meal-plans/meal-plan.entity';
import { QA_SUBSCRIPTIONS, QA_USERS, QA_MEAL_PLANS } from '../qa-seed.constants';
import { getRelativeDateIst, getRelativeTimestampIst } from '../date.helper';

export function buildQaSubscriptions(): Partial<Subscription>[] {
  const subscriptions: Partial<Subscription>[] = [];

  for (const subDef of QA_SUBSCRIPTIONS) {
    const studentId = QA_USERS.STUDENTS[subDef.studentIndex].id;
    const planId = QA_MEAL_PLANS[subDef.planIndex].id;

    const startDate = getRelativeDateIst(subDef.offsetStart);
    const endDate = getRelativeDateIst(subDef.offsetEnd);

    const subEntity: Partial<Subscription> = {
      id: subDef.id,
      student: { id: studentId } as User,
      mealPlan: { id: planId } as MealPlan,
      status: subDef.status as SubscriptionStatus,
      startDate,
      endDate,
      recoveryDaysApplied: subDef.recoveryDaysApplied || 0,
      createdAt: getRelativeTimestampIst(subDef.offsetStart, 10, 0),
    };

    subscriptions.push(subEntity);
  }

  return subscriptions;
}
