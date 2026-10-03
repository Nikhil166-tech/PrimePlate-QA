import { MealProvider } from '../../providers/meal-provider.entity';
import { ProviderImage } from '../../providers/provider-image.entity';
import { ProviderStatus } from '../../common/enums/provider-status.enum';
import { ProviderApprovalStatus } from '../../common/enums/provider-approval-status.enum';
import { Category } from '../../common/enums/category.enum';
import { QA_PROVIDERS, QA_USERS } from '../qa-seed.constants';

export function buildQaProviders(): {
  providers: Partial<MealProvider>[];
  images: Partial<ProviderImage>[];
} {
  const providers: Partial<MealProvider>[] = [
    // Provider A: Active, Approved, Verified, 80% Recovery, Recovery Enabled
    {
      id: QA_PROVIDERS[0].id,
      userId: QA_USERS.PROVIDERS[0].id,
      name: QA_PROVIDERS[0].name,
      description: QA_PROVIDERS[0].description,
      city: QA_PROVIDERS[0].city,
      address: QA_PROVIDERS[0].address,
      monthlyPrice: QA_PROVIDERS[0].monthlyPrice,
      rating: QA_PROVIDERS[0].rating,
      category: Category.NORTH_INDIAN,
      status: ProviderStatus.ACTIVE,
      approvalStatus: ProviderApprovalStatus.APPROVED,
      verified: true,
      acceptingSubscriptions: true,
      totalCapacity: 60,
      recoveryPercentage: QA_PROVIDERS[0].recoveryPercentage,
      mealRecoveryEnabled: QA_PROVIDERS[0].mealRecoveryEnabled,
      qrToken: QA_PROVIDERS[0].qrToken,
      contactPhone: '+919800000011',
      openingTime: '08:00 AM',
      closingTime: '10:00 PM',
      imageUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&auto=format&fit=crop',
    },
    // Provider B: Active, Approved, Verified, 0% Recovery, Recovery Disabled
    {
      id: QA_PROVIDERS[1].id,
      userId: QA_USERS.PROVIDERS[1].id,
      name: QA_PROVIDERS[1].name,
      description: QA_PROVIDERS[1].description,
      city: QA_PROVIDERS[1].city,
      address: QA_PROVIDERS[1].address,
      monthlyPrice: QA_PROVIDERS[1].monthlyPrice,
      rating: QA_PROVIDERS[1].rating,
      category: Category.SOUTH_INDIAN,
      status: ProviderStatus.ACTIVE,
      approvalStatus: ProviderApprovalStatus.APPROVED,
      verified: true,
      acceptingSubscriptions: true,
      totalCapacity: 45,
      recoveryPercentage: QA_PROVIDERS[1].recoveryPercentage,
      mealRecoveryEnabled: QA_PROVIDERS[1].mealRecoveryEnabled,
      qrToken: QA_PROVIDERS[1].qrToken,
      contactPhone: '+919800000012',
      openingTime: '07:30 AM',
      closingTime: '09:30 PM',
      imageUrl: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=800&auto=format&fit=crop',
    },
  ];

  const images: Partial<ProviderImage>[] = [
    // Provider A Images
    {
      id: '00000000-0000-4000-b100-000000000001',
      provider: { id: QA_PROVIDERS[0].id } as MealProvider,
      providerId: QA_PROVIDERS[0].id,
      imageUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800&auto=format&fit=crop',
      imageCategory: 'Dining',
      sortOrder: 1,
    },
    {
      id: '00000000-0000-4000-b100-000000000002',
      provider: { id: QA_PROVIDERS[0].id } as MealProvider,
      providerId: QA_PROVIDERS[0].id,
      imageUrl: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&auto=format&fit=crop',
      imageCategory: 'Kitchen',
      sortOrder: 2,
    },
    // Provider B Images
    {
      id: '00000000-0000-4000-b100-000000000003',
      provider: { id: QA_PROVIDERS[1].id } as MealProvider,
      providerId: QA_PROVIDERS[1].id,
      imageUrl: 'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=800&auto=format&fit=crop',
      imageCategory: 'Dining',
      sortOrder: 1,
    },
    {
      id: '00000000-0000-4000-b100-000000000004',
      provider: { id: QA_PROVIDERS[1].id } as MealProvider,
      providerId: QA_PROVIDERS[1].id,
      imageUrl: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=800&auto=format&fit=crop',
      imageCategory: 'Food',
      sortOrder: 2,
    },
  ];

  return { providers, images };
}
