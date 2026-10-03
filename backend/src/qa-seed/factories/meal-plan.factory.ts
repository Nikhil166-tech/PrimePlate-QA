import { MealPlan, MealType } from '../../meal-plans/meal-plan.entity';
import { MealProvider } from '../../providers/meal-provider.entity';
import { QA_MEAL_PLANS, QA_PROVIDERS } from '../qa-seed.constants';

export function buildQaMealPlans(): Partial<MealPlan>[] {
  const plans: Partial<MealPlan>[] = [];

  for (const planDef of QA_MEAL_PLANS) {
    const providerId = QA_PROVIDERS[planDef.providerIndex].id;
    plans.push({
      id: planDef.id,
      provider: { id: providerId } as MealProvider,
      title: planDef.title,
      description: planDef.description,
      mealType: planDef.mealType as MealType,
      pricePerMonth: planDef.pricePerMonth,
      originalPrice: planDef.originalPrice,
      sellingPrice: planDef.sellingPrice,
      customOneDayPrice: planDef.customOneDayPrice,
      isActive: planDef.isActive,
    });
  }

  return plans;
}
