import { Review } from '../../reviews/review.entity';
import { User } from '../../users/user.entity';
import { MealProvider } from '../../providers/meal-provider.entity';
import { QA_USERS, QA_PROVIDERS } from '../qa-seed.constants';
import { getRelativeTimestampIst } from '../date.helper';

export function buildQaReviews(): Partial<Review>[] {
  const prov1Id = QA_PROVIDERS[0].id;
  const prov2Id = QA_PROVIDERS[1].id;

  const stu1Id = QA_USERS.STUDENTS[0].id;
  const stu2Id = QA_USERS.STUDENTS[1].id;
  const stu4Id = QA_USERS.STUDENTS[3].id;

  return [
    // 1. Review for Provider A (5 stars, with Provider Reply)
    {
      id: '00000000-0000-4000-6000-000000000001',
      student: { id: stu1Id } as User,
      provider: { id: prov1Id } as MealProvider,
      rating: 5,
      comment: 'Super fresh hot rotis and dal every day! Tastes just like home.',
      providerReply: 'Thank you Aarav! We take pride in delivering healthy food every day.',
      createdAt: getRelativeTimestampIst(-10, 14, 0),
    },
    // 2. Review for Provider A (4 stars)
    {
      id: '00000000-0000-4000-6000-000000000002',
      student: { id: stu2Id } as User,
      provider: { id: prov1Id } as MealProvider,
      rating: 4,
      comment: 'Generous portions for student budgets. Clean and leak-proof packaging.',
      createdAt: getRelativeTimestampIst(-8, 15, 30),
    },
    // 3. Review for Provider B (5 stars)
    {
      id: '00000000-0000-4000-6000-000000000003',
      student: { id: stu4Id } as User,
      provider: { id: prov2Id } as MealProvider,
      rating: 5,
      comment: 'Loved the authentic sambar and crisp dosas for breakfast.',
      providerReply: 'Thank you! Glad you enjoyed our authentic South Indian recipe.',
      createdAt: getRelativeTimestampIst(-4, 10, 0),
    },
  ];
}
