import { WeeklyMenu } from '../../weekly-menus/weekly-menu.entity';
import { DailyMenu } from '../../meal-plans/daily-menu.entity';
import { MealProvider } from '../../providers/meal-provider.entity';
import { MealPlan } from '../../meal-plans/meal-plan.entity';
import { QA_PROVIDERS, QA_MEAL_PLANS } from '../qa-seed.constants';
import { getRelativeDateIst } from '../date.helper';

export function buildQaWeeklyMenus(): Partial<WeeklyMenu>[] {
  const weeklyMenus: Partial<WeeklyMenu>[] = [];

  const sampleSchedule = [
    {
      dayOfWeek: 0, // Monday
      Lunch: 'Dal Tadka, Shahi Paneer, 4 Phulka Rotis, Basmati Rice & Salad',
      Dinner: 'Mix Veg Curry, Dal Makhani, 4 Rotis & Rice',
    },
    {
      dayOfWeek: 1, // Tuesday
      Lunch: 'Rajma Masala, Jeera Rice, 4 Rotis & Boondi Raita',
      Dinner: 'Kadhai Paneer, Yellow Dal, 4 Rotis & Gulab Jamun',
    },
    {
      dayOfWeek: 2, // Wednesday
      Lunch: 'Paneer Do Pyaza, Steamed Rice & 4 Rotis',
      Dinner: 'Malai Kofta, Dal Fry, 4 Rotis & Jeera Rice',
    },
    {
      dayOfWeek: 3, // Thursday
      Lunch: 'Chole Masala, Steamed Rice, Green Salad & Pickle',
      Dinner: 'Palak Paneer, Moong Dal Tadka, 4 Rotis & Rice',
    },
    {
      dayOfWeek: 4, // Friday
      Lunch: 'Shahi Paneer, Veg Dum Biryani & Roti',
      Dinner: 'Veg Kolhapuri, Dal Tadka, 4 Rotis & Kheer',
    },
    {
      dayOfWeek: 5, // Saturday
      Lunch: 'Special Thali: 2 Sabzi, Dal, 4 Rotis, Rice & Sweet',
      Dinner: 'Paneer Butter Masala, Jeera Rice, 4 Phulkas & Salad',
    },
    {
      dayOfWeek: 6, // Sunday
      Lunch: 'Special Sunday Veg Biryani with Raita & Salan',
      Dinner: 'Light Khichdi / Butter Roti with Paneer Korma',
    },
  ];

  for (const prov of QA_PROVIDERS) {
    for (const day of sampleSchedule) {
      const meals: [string, string][] = [
        ['Lunch', day.Lunch],
        ['Dinner', day.Dinner],
      ];

      for (const [mealType, menuItems] of meals) {
        weeklyMenus.push({
          provider: { id: prov.id } as MealProvider,
          dayOfWeek: day.dayOfWeek,
          mealType,
          menuItems,
          description: `Freshly cooked homestyle ${mealType.toLowerCase()}`,
        });
      }
    }
  }

  return weeklyMenus;
}

export function buildQaDailyMenus(): Partial<DailyMenu>[] {
  const dailyMenus: Partial<DailyMenu>[] = [];

  // Seed daily menus for key active plans covering today and tomorrow (offset 0 and +1)
  const targetPlanIds = [
    QA_MEAL_PLANS[0].id, // Provider A Full Day
    QA_MEAL_PLANS[1].id, // Provider A Lunch Only
    QA_MEAL_PLANS[4].id, // Provider B Full Day
  ];

  for (let offset = 0; offset <= 1; offset++) {
    const dateStr = getRelativeDateIst(offset);

    for (const planId of targetPlanIds) {
      dailyMenus.push({
        mealPlan: { id: planId } as MealPlan,
        date: dateStr,
        items: {
          lunch: 'Dal Fry, Seasonal Sabzi, 4 Phulkas, Rice, Salad',
          dinner: 'Paneer Sabzi, Dal Tadka, 4 Phulkas, Rice',
          special: offset === 0 ? "Chef's Special Sweet: Gulab Jamun" : undefined,
        },
      });
    }
  }

  return dailyMenus;
}
