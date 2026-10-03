/**
 * Deterministic QA Seed Constants
 * 
 * Minimal synthetic dataset designed strictly for the QA environment.
 * Contains predictable UUIDs, QA emails (*@qa.primeplate.local),
 * a single documented QA password, and test-only sandbox IDs.
 */

export const QA_PASSWORD = 'QaPrimePlate@2026!';

// Precomputed bcrypt hash (cost factor 10) for 'QaPrimePlate@2026!'
export const QA_PASSWORD_HASH = '$2b$10$xRDfHCWgzq7yXoduQckXsu4Ki./pq/aYUI1kxzBnDSPBBMFWZs1C2';

export const QA_USERS = {
  ADMIN: {
    id: '00000000-0000-4000-a000-000000000001',
    email: 'admin@qa.primeplate.local',
    name: 'QA System Admin',
    phone: '+919800000001',
  },
  PROVIDERS: [
    {
      id: '00000000-0000-4000-a000-000000000011',
      email: 'provider1@qa.primeplate.local',
      name: 'Rajesh Sharma (Gourmet Owner)',
      phone: '+919800000011',
    },
    {
      id: '00000000-0000-4000-a000-000000000012',
      email: 'provider2@qa.primeplate.local',
      name: 'Priya Reddy (SpiceCraft Owner)',
      phone: '+919800000012',
    },
  ],
  STUDENTS: [
    {
      id: '00000000-0000-4000-a000-000000000021',
      email: 'student1@qa.primeplate.local',
      name: 'Aarav Patel',
      phone: '+919800000021',
      area: 'Koramangala',
      foodPreference: 'North Indian Veg',
      monthlyBudget: 3500,
    },
    {
      id: '00000000-0000-4000-a000-000000000022',
      email: 'student2@qa.primeplate.local',
      name: 'Ananya Sen',
      phone: '+919800000022',
      area: 'Indiranagar',
      foodPreference: 'Healthy Meals',
      monthlyBudget: 4000,
    },
    {
      id: '00000000-0000-4000-a000-000000000023',
      email: 'student3@qa.primeplate.local',
      name: 'Rohan Gupta',
      phone: '+919800000023',
      area: 'Hitech City',
      foodPreference: 'South Indian',
      monthlyBudget: 3000,
    },
    {
      id: '00000000-0000-4000-a000-000000000024',
      email: 'student4@qa.primeplate.local',
      name: 'Sneha Rao',
      phone: '+919800000024',
      area: 'Gachibowli',
      foodPreference: 'Andhra Meals',
      monthlyBudget: 3200,
    },
  ],
};

export const QA_PROVIDERS = [
  {
    id: '00000000-0000-4000-b000-000000000001',
    userIndex: 0, // provider1
    name: 'Gourmet Tiffin Express (QA Provider A)',
    description: 'Fresh homestyle North Indian thalis delivered daily to students.',
    city: 'Bangalore',
    address: '12th Main Road, Koramangala, Bangalore',
    monthlyPrice: 2999,
    rating: 4.8,
    recoveryPercentage: 80,
    mealRecoveryEnabled: true,
    qrToken: 'pp_qr_qa_provider_1_token',
    verified: true,
  },
  {
    id: '00000000-0000-4000-b000-000000000002',
    userIndex: 1, // provider2
    name: 'SpiceCraft Healthy Kitchen (QA Provider B)',
    description: 'Organic & nutritious South Indian breakfast & lunch subscription plans.',
    city: 'Hyderabad',
    address: 'Plot 45, Hitech City, Hyderabad',
    monthlyPrice: 3200,
    rating: 4.9,
    recoveryPercentage: 0,
    mealRecoveryEnabled: false, // Testing provider with recovery disabled
    qrToken: 'pp_qr_qa_provider_2_token',
    verified: true,
  },
];

export const QA_MEAL_PLANS = [
  // Provider A Plans
  {
    id: '00000000-0000-4000-c000-000000000001',
    providerIndex: 0,
    title: 'Standard Full-Day Deluxe Thali',
    mealType: 'FULL_DAY',
    pricePerMonth: 2999,
    originalPrice: 3499,
    sellingPrice: 2999,
    customOneDayPrice: 150.0, // 1-day pricing enabled
    isActive: true,
    description: '30-Day complete lunch & dinner thali (4 Roti, Rice, 2 Sabzi, Dal, Salad).',
  },
  {
    id: '00000000-0000-4000-c000-000000000002',
    providerIndex: 0,
    title: 'Executive Lunch Only Saver Plan',
    mealType: 'LUNCH_ONLY',
    pricePerMonth: 1800,
    originalPrice: 1800,
    sellingPrice: 1800,
    customOneDayPrice: 90.0,
    isActive: true,
    description: 'Weekday campus lunch box with hot fresh delivery.',
  },
  {
    id: '00000000-0000-4000-c000-000000000003',
    providerIndex: 0,
    title: 'Deluxe Dinner Only Campus Box',
    mealType: 'DINNER_ONLY',
    pricePerMonth: 1800,
    originalPrice: 2000,
    sellingPrice: 1800,
    customOneDayPrice: 90.0,
    isActive: true,
    description: 'Nutritious dinner meal box delivered before 8:30 PM.',
  },
  {
    id: '00000000-0000-4000-c000-000000000004',
    providerIndex: 0,
    title: 'Seasonal Special Feast (Disabled Plan)',
    mealType: 'FULL_DAY',
    pricePerMonth: 3500,
    originalPrice: 3500,
    sellingPrice: 3500,
    customOneDayPrice: null,
    isActive: false, // Testing disabled meal option
    description: 'Special seasonal weekend feast (currently disabled).',
  },

  // Provider B Plans
  {
    id: '00000000-0000-4000-c000-000000000005',
    providerIndex: 1,
    title: 'South Indian Complete Thali (Full Day)',
    mealType: 'FULL_DAY',
    pricePerMonth: 3200,
    originalPrice: 3600,
    sellingPrice: 3200,
    customOneDayPrice: null, // Tests 1-day pricing disabled/null
    isActive: true,
    description: 'Authentic South Indian lunch & dinner subscription.',
  },
  {
    id: '00000000-0000-4000-c000-000000000006',
    providerIndex: 1,
    title: 'Traditional Andhra Lunch Only',
    mealType: 'LUNCH_ONLY',
    pricePerMonth: 1950,
    originalPrice: 1950,
    sellingPrice: 1950,
    customOneDayPrice: null,
    isActive: true,
    description: 'Wholesome nutritious Andhra lunch meal.',
  },
];

export const QA_SUBSCRIPTIONS = [
  // 1. Active FULL_DAY subscription (Student 1 -> Provider A Plan 1) - covers today
  {
    id: '00000000-0000-4000-d000-000000000001',
    studentIndex: 0,
    planIndex: 0,
    status: 'active',
    offsetStart: -10,
    offsetEnd: 20,
    recoveryDaysApplied: 0,
  },
  // 2. Expired FULL_DAY subscription eligible for Meal Recovery (Student 2 -> Provider A Plan 1)
  {
    id: '00000000-0000-4000-d000-000000000002',
    studentIndex: 1,
    planIndex: 0,
    status: 'expired',
    offsetStart: -35,
    offsetEnd: -5,
    recoveryDaysApplied: 0,
  },
  // 3. Active LUNCH_ONLY subscription (Student 3 -> Provider A Plan 2)
  {
    id: '00000000-0000-4000-d000-000000000003',
    studentIndex: 2,
    planIndex: 1,
    status: 'active',
    offsetStart: -7,
    offsetEnd: 23,
    recoveryDaysApplied: 0,
  },
  // 4. Active DINNER_ONLY subscription (Student 3 -> Provider A Plan 3) - Dual active subscription for Student 3!
  {
    id: '00000000-0000-4000-d000-000000000004',
    studentIndex: 2,
    planIndex: 2,
    status: 'active',
    offsetStart: -7,
    offsetEnd: 23,
    recoveryDaysApplied: 0,
  },
  // 5. Active FULL_DAY subscription (Student 4 -> Provider B Plan 5)
  {
    id: '00000000-0000-4000-d000-000000000005',
    studentIndex: 3,
    planIndex: 4,
    status: 'active',
    offsetStart: -5,
    offsetEnd: 25,
    recoveryDaysApplied: 0,
  },
  // 6. Past Expired FULL_DAY subscription (Student 1 -> Provider A Plan 1) - Recovery Source 2
  {
    id: '00000000-0000-4000-d000-000000000006',
    studentIndex: 0,
    planIndex: 0,
    status: 'expired',
    offsetStart: -65,
    offsetEnd: -35,
    recoveryDaysApplied: 0,
  },
];
