import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { MealProvider } from '../providers/meal-provider.entity';
import { MealPlan } from '../meal-plans/meal-plan.entity';
import {
  Subscription,
  SubscriptionStatus,
} from '../subscriptions/subscription.entity';
import { Payment } from '../payments/payment.entity';
import { Review } from '../reviews/review.entity';
import { WeeklyMenu } from '../weekly-menus/weekly-menu.entity';
import { Role } from './roles.enum';
import { ProviderStatus } from './enums/provider-status.enum';
import { Category } from './enums/category.enum';
import { ProviderApprovalStatus } from './enums/provider-approval-status.enum';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(MealProvider)
    private providerRepo: Repository<MealProvider>,
    @InjectRepository(MealPlan) private planRepo: Repository<MealPlan>,
    @InjectRepository(Subscription) private subRepo: Repository<Subscription>,
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    @InjectRepository(Review) private reviewRepo: Repository<Review>,
    @InjectRepository(WeeklyMenu)
    private weeklyMenuRepo: Repository<WeeklyMenu>,
  ) {}

  async onApplicationBootstrap() {
    const isProduction = process.env.NODE_ENV === 'production';
    const isSeedEnabled = process.env.ENABLE_SEED === 'true';

    try {
      await this.providerRepo.query(
        `ALTER TABLE "meal_providers" ADD COLUMN IF NOT EXISTS "latitude" double precision, ADD COLUMN IF NOT EXISTS "longitude" double precision;`,
      );
    } catch {
      // Ignore for SQLite or if columns exist
    }

    try {
      await this.planRepo.query(
        `UPDATE "meal_plans" SET "originalPrice" = "pricePerMonth", "sellingPrice" = "pricePerMonth" WHERE "originalPrice" <= 0 OR "originalPrice" IS NULL`,
      );
    } catch {
      // Ignore if table or columns not yet ready
    }

    // Production & Default Safety Guard: Disable mock seeding in production or when ENABLE_SEED is not explicitly 'true'
    if (isProduction || !isSeedEnabled) {
      return;
    }

    try {
      await this.seedAdmin();
    } catch (err: any) {
      this.logger.error(
        'Error initializing admin account:',
        err.message || err,
      );
    }

    this.logger.log(
      'Explicit ENABLE_SEED=true flag detected in development. Starting mock database seeding...',
    );

    try {
      const providers = await this.seedProviders();
      const students = await this.seedStudents();
      const plans = await this.seedMealPlans(providers);
      await this.seedWeeklyMenus(providers);
      await this.seedReviews(students, providers);
      await this.seedSubscriptionsAndPayments(students, plans, providers);
      this.logger.log(
        'Database seeding completed successfully! All development mock data ready.',
      );
    } catch (err: any) {
      this.logger.error('Error during database seeding:', err.message || err);
    }
  }

  private async seedAdmin() {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@primeplate.com';
    const adminPassword = process.env.ADMIN_PASSWORD;

    const existing = await this.userRepo.findOne({
      where: { role: Role.ADMIN },
    });
    if (existing) return existing;

    // Do not seed default admin password in production without explicit ADMIN_PASSWORD
    if (!adminPassword && process.env.NODE_ENV === 'production') {
      this.logger.log(
        'No ADMIN_PASSWORD configured in production environment. Skipping initial admin seed.',
      );
      return null;
    }

    const passwordToUse = adminPassword || 'Admin@123';
    const passwordHash = await bcrypt.hash(passwordToUse, 10);
    const admin = this.userRepo.create({
      email: adminEmail,
      passwordHash,
      name: 'System Admin',
      role: Role.ADMIN,
      status: 'ACTIVE',
    });
    const saved = await this.userRepo.save(admin);
    this.logger.log(`Initialized Admin account: ${adminEmail}`);
    return saved;
  }

  private async seedProviders() {
    // Precomputed bcrypt hash for 'Provider@123'
    const passwordHash =
      '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW';

    // Provider 1 - Approved
    let owner1 = await this.userRepo.findOne({
      where: { email: 'gourmet@primeplate.com' },
    });
    if (!owner1) {
      owner1 = await this.userRepo.save(
        this.userRepo.create({
          email: 'gourmet@primeplate.com',
          passwordHash,
          name: 'Rajesh Sharma',
          phone: '+919876543210',
          role: Role.PROVIDER,
        }),
      );
    }

    let prov1 = await this.providerRepo.findOne({
      where: { name: 'Gourmet Tiffin Express' },
    });
    if (!prov1) {
      prov1 = await this.providerRepo.save(
        this.providerRepo.create({
          name: 'Gourmet Tiffin Express',
          user: owner1,
          city: 'Bangalore',
          address: '12th Main Road, Koramangala, Bangalore',
          description:
            'Fresh homestyle North Indian thalis delivered daily to students & professionals.',
          category: Category.NORTH_INDIAN,
          status: ProviderStatus.ACTIVE,
          approvalStatus: ProviderApprovalStatus.APPROVED,
          verified: true,
          rating: 4.8,
          openingTime: '08:00 AM',
          closingTime: '10:00 PM',
          imageUrl:
            'https://images.pexels.com/photos/5775684/pexels-photo-5775684.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
        }),
      );
    }

    // Provider 2 - Approved
    let owner2 = await this.userRepo.findOne({
      where: { email: 'spicecraft@primeplate.com' },
    });
    if (!owner2) {
      owner2 = await this.userRepo.save(
        this.userRepo.create({
          email: 'spicecraft@primeplate.com',
          passwordHash,
          name: 'Priya Reddy',
          phone: '+919876543211',
          role: Role.PROVIDER,
        }),
      );
    }

    let prov2 = await this.providerRepo.findOne({
      where: { name: 'SpiceCraft Healthy Kitchen' },
    });
    if (!prov2) {
      prov2 = await this.providerRepo.save(
        this.providerRepo.create({
          name: 'SpiceCraft Healthy Kitchen',
          user: owner2,
          city: 'Hyderabad',
          address: 'Plot 45, Hitech City, Hyderabad',
          description:
            'Organic & nutritious South Indian breakfast & lunch subscription plans.',
          category: Category.SOUTH_INDIAN,
          status: ProviderStatus.ACTIVE,
          approvalStatus: ProviderApprovalStatus.APPROVED,
          verified: true,
          rating: 4.9,
          openingTime: '07:30 AM',
          closingTime: '09:30 PM',
          imageUrl:
            'https://images.pexels.com/photos/1640777/pexels-photo-1640777.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
        }),
      );
    }

    // Provider 3 - Pending Approval
    let owner3 = await this.userRepo.findOne({
      where: { email: 'fitbites@primeplate.com' },
    });
    if (!owner3) {
      owner3 = await this.userRepo.save(
        this.userRepo.create({
          email: 'fitbites@primeplate.com',
          passwordHash,
          name: 'Ankit Verma',
          phone: '+919876543212',
          role: Role.PROVIDER,
        }),
      );
    }

    let prov3 = await this.providerRepo.findOne({
      where: { name: 'FitBites Protein Meals' },
    });
    if (!prov3) {
      prov3 = await this.providerRepo.save(
        this.providerRepo.create({
          name: 'FitBites Protein Meals',
          user: owner3,
          city: 'Delhi NCR',
          address: 'Sector 28, Cyber City, Gurgaon',
          description:
            'Calorie-counted protein power bowls tailored for active student lifestyles.',
          category: Category.HEALTHY,
          status: ProviderStatus.ACTIVE,
          approvalStatus: ProviderApprovalStatus.PENDING,
          verified: false,
          rating: 4.7,
          openingTime: '08:00 AM',
          closingTime: '09:00 PM',
          imageUrl:
            'https://images.pexels.com/photos/2097090/pexels-photo-2097090.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
        }),
      );
    }

    return [prov1, prov2, prov3];
  }

  private async seedStudents() {
    // Precomputed bcrypt hash for 'Student@123'
    const passwordHash =
      '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeg6Lruj3vjPGga31lW';
    const sampleStudentsData = [
      {
        name: 'Aarav Patel',
        email: 'aarav.p@student.edu',
        area: 'Koramangala',
        foodPreference: 'North Indian Veg',
        monthlyBudget: 3500,
      },
      {
        name: 'Ananya Sen',
        email: 'ananya.s@student.edu',
        area: 'Indiranagar',
        foodPreference: 'Healthy Meals',
        monthlyBudget: 4000,
      },
      {
        name: 'Rohan Gupta',
        email: 'rohan.g@student.edu',
        area: 'Hitech City',
        foodPreference: 'South Indian',
        monthlyBudget: 3000,
      },
      {
        name: 'Sneha Rao',
        email: 'sneha.r@student.edu',
        area: 'Gachibowli',
        foodPreference: 'Andhra Meals',
        monthlyBudget: 3200,
      },
      {
        name: 'Vikram Singh',
        email: 'vikram.s@student.edu',
        area: 'Cyber City',
        foodPreference: 'High Protein Non-Veg',
        monthlyBudget: 4500,
      },
      {
        name: 'Kavya Nair',
        email: 'kavya.n@student.edu',
        area: 'HSR Layout',
        foodPreference: 'Pure Veg',
        monthlyBudget: 2800,
      },
      {
        name: 'Aditya Kumar',
        email: 'aditya.k@student.edu',
        area: 'Kondapur',
        foodPreference: 'North Indian',
        monthlyBudget: 3500,
      },
      {
        name: 'Meera Iyer',
        email: 'meera.i@student.edu',
        area: 'BTM Layout',
        foodPreference: 'Healthy Veg',
        monthlyBudget: 3000,
      },
      {
        name: 'Siddharth Roy',
        email: 'siddharth.r@student.edu',
        area: 'Powai',
        foodPreference: 'Non-Veg',
        monthlyBudget: 4200,
      },
      {
        name: 'Pooja Joshi',
        email: 'pooja.j@student.edu',
        area: 'Noida Sector 62',
        foodPreference: 'North Indian Veg',
        monthlyBudget: 3100,
      },
    ];

    const students: User[] = [];
    for (let i = 0; i < sampleStudentsData.length; i++) {
      const data = sampleStudentsData[i];
      let user = await this.userRepo.findOne({ where: { email: data.email } });
      if (!user) {
        user = await this.userRepo.save(
          this.userRepo.create({
            email: data.email,
            passwordHash,
            name: data.name,
            phone: `+91980000000${i}`,
            area: data.area,
            foodPreference: data.foodPreference,
            monthlyBudget: data.monthlyBudget,
            role: Role.STUDENT,
          }),
        );
      }
      students.push(user);
    }

    return students;
  }

  private async seedMealPlans(providers: MealProvider[]) {
    const existingCount = await this.planRepo.count();
    if (existingCount >= 15) {
      return this.planRepo.find();
    }

    const plansData = [
      {
        title: 'Monthly Deluxe Veg Thali',
        pricePerMonth: 2999,
        description:
          '30-Day lunch & dinner thali (4 Roti, Rice, 2 Sabzi, Dal, Salad & Sweet).',
      },
      {
        title: 'Monthly Non-Veg Feast Plan',
        pricePerMonth: 3499,
        description:
          '30-Day plan including Chicken Curry/Egg curry 4 days a week.',
      },
      {
        title: 'Weekly Executive Lunch Plan',
        pricePerMonth: 899,
        description: '7-Day office/campus lunch box with fresh hot delivery.',
      },
      {
        title: 'Breakfast Only Saver Plan',
        pricePerMonth: 1299,
        description:
          '30-Day South Indian breakfast (Idli, Dosa, Vada, Chutney & Sambar).',
      },
      {
        title: 'Lunch Only Student Plan',
        pricePerMonth: 1799,
        description: '26-Day weekday lunch thali subscription.',
      },
      {
        title: 'Dinner Only Campus Box',
        pricePerMonth: 1899,
        description: '30-Day light dinner meal box.',
      },
      {
        title: 'Weekly Veg Mini Plan',
        pricePerMonth: 699,
        description: '7-Day mini meal plan with 3 Rotis & Rice bowl.',
      },
      {
        title: 'Weekly Non-Veg Mini Plan',
        pricePerMonth: 849,
        description: '7-Day non-veg mini meal box.',
      },
      {
        title: 'Andhra Meal Special Subscription',
        pricePerMonth: 3100,
        description:
          '30-Day authentic spicy Andhra meals with Pappu, Fry & Curd.',
      },
      {
        title: 'Healthy Protein Power Bowl',
        pricePerMonth: 3999,
        description:
          '30-Day calorie-tracked grilled chicken/paneer salad & quinoa bowl.',
      },
      {
        title: 'North Indian Roti Special',
        pricePerMonth: 2799,
        description: '30-Day phulka roti & paneer butter masala combo.',
      },
      {
        title: 'Budget Saver Thali',
        pricePerMonth: 1999,
        description: 'Economical 30-day single daily meal subscription.',
      },
      {
        title: 'Student Combo Plan',
        pricePerMonth: 2499,
        description: 'Lunch + Evening snack combo subscription.',
      },
      {
        title: 'Weekend Special Feast',
        pricePerMonth: 999,
        description: '4-Weekend biryani & special dessert feast subscription.',
      },
      {
        title: 'Custom Diet Fitness Plan',
        pricePerMonth: 4499,
        description:
          'Customized macro-balanced meals for gym & sports athletes.',
      },
    ];

    const savedPlans: MealPlan[] = [];
    for (let i = 0; i < plansData.length; i++) {
      const provider = providers[i % providers.length];
      const pData = plansData[i];
      // Seed some plans with discounts and some with no discount (original == selling)
      const isDiscounted = i % 2 === 0;
      const originalPrice = isDiscounted
        ? Math.round(pData.pricePerMonth * 1.15)
        : pData.pricePerMonth;
      const sellingPrice = pData.pricePerMonth;

      const plan = this.planRepo.create({
        title: pData.title,
        originalPrice,
        sellingPrice,
        pricePerMonth: sellingPrice,
        description: pData.description,
        provider,
        isActive: true,
      });
      savedPlans.push(await this.planRepo.save(plan));
    }

    return savedPlans;
  }

  private async seedReviews(students: User[], providers: MealProvider[]) {
    const existingCount = await this.reviewRepo.count();
    if (existingCount >= 20) return;

    const comments = [
      'Extremely fresh homestyle food! Tastes just like Mom cooked it.',
      'Prompt delivery every single day. Rotis are soft and hot.',
      'Great portion sizes and fantastic value for student budgets.',
      'Super clean and hygienic packaging. Highly recommended!',
      'Loved the Andhra spicy curry! Best meal subscription in town.',
      'Protein bowl is delicious and kept me energetic for my workouts.',
      'Very consistent taste. Has made my college life so much easier.',
    ];

    for (let i = 0; i < 20; i++) {
      const student = students[i % students.length];
      const provider = providers[i % providers.length];
      const rating = 4 + (i % 2); // 4 or 5 stars

      const review = this.reviewRepo.create({
        student,
        provider,
        rating,
        comment: comments[i % comments.length],
        providerReply:
          i % 3 === 0
            ? 'Thank you so much for your support! We are glad you enjoyed the meals.'
            : undefined,
      });
      await this.reviewRepo.save(review);
    }
  }

  private async seedSubscriptionsAndPayments(
    students: User[],
    plans: MealPlan[],
    providers: MealProvider[],
  ) {
    const existingCount = await this.subRepo.count();
    if (existingCount > 0) return;

    const statuses = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.PAUSED,
      SubscriptionStatus.CANCELLED,
    ];

    for (let i = 0; i < 6; i++) {
      const student = students[i % students.length];
      const plan = plans[i % plans.length];
      const status = statuses[i % statuses.length];

      await this.subRepo.save(
        this.subRepo.create({
          student,
          mealPlan: plan,
          status,
          startDate: '2026-08-01',
          endDate: '2026-08-31',
        }),
      );

      // Seed Sandbox Payment record
      await this.paymentRepo.save(
        this.paymentRepo.create({
          student,
          provider: plan.provider || providers[0],
          amount: plan.pricePerMonth,
          razorpayOrderId: `order_sandbox_${i + 100}`,
          razorpayPaymentId: `pay_sandbox_${i + 100}`,
          razorpaySignature: `sig_sandbox_${i + 100}`,
          status: 'paid',
        }),
      );
    }
  }

  private async seedWeeklyMenus(providers: MealProvider[]) {
    const existingCount = await this.weeklyMenuRepo.count();
    if (existingCount > 0) return;

    const sampleWeeklySchedule = [
      {
        dayOfWeek: 0, // Monday
        Breakfast: 'Puri Bhaji, Tea & Banana',
        Lunch: 'Dal Tadka, Shahi Paneer, 4 Phulka Rotis, Basmati Rice & Salad',
        Dinner: 'Mix Veg Curry, Dal Makhani, 4 Rotis & Rice',
      },
      {
        dayOfWeek: 1, // Tuesday
        Breakfast: 'Idli Vada Combo with Coconut Chutney & Sambar',
        Lunch: 'Rajma Masala, Jeera Rice, 4 Rotis & Boondi Raita',
        Dinner: 'Kadhai Paneer, Yellow Dal, 4 Rotis & Gulab Jamun',
      },
      {
        dayOfWeek: 2, // Wednesday
        Breakfast: 'Aloo Paratha with Curd & Butter',
        Lunch: 'Chicken Curry / Paneer Do Pyaza, Steamed Rice & 4 Rotis',
        Dinner: 'Egg Curry / Malai Kofta, Dal Fry, 4 Rotis & Rice',
      },
      {
        dayOfWeek: 3, // Thursday
        Breakfast: 'Masala Dosa with Sambar & Red Chutney',
        Lunch: 'Chole Masala, Bhature / Rice, Salad & Pickle',
        Dinner: 'Palak Paneer, Moong Dal, 4 Rotis & Rice',
      },
      {
        dayOfWeek: 4, // Friday
        Breakfast: 'Poha with Roasted Peanuts & Tea',
        Lunch: 'Butter Chicken / Shahi Paneer, Dum Biryani & Rotis',
        Dinner: 'Veg Kolhapuri, Dal Tadka, 4 Rotis & Kheer',
      },
      {
        dayOfWeek: 5, // Saturday
        Breakfast: 'Uttapam with Sambar & Coconut Chutney',
        Lunch: 'Veg Thali Special: 2 Sabzi, Dal, 4 Rotis, Rice & Sweet',
        Dinner: 'Paneer Butter Masala, Jeera Rice, 4 Phulkas & Salad',
      },
      {
        dayOfWeek: 6, // Sunday
        Breakfast: 'Chole Puri & Hot Masala Chai',
        Lunch: 'Special Sunday Hyderabadi Biryani / Veg Dum Biryani + Raita',
        Dinner: 'Light Khichdi / Butter Roti with Paneer Korma & Ice Cream',
      },
    ];

    for (const provider of providers) {
      for (const daySchedule of sampleWeeklySchedule) {
        const meals: Array<[string, string]> = [
          ['Breakfast', daySchedule.Breakfast],
          ['Lunch', daySchedule.Lunch],
          ['Dinner', daySchedule.Dinner],
        ];

        for (const [mealType, menuItems] of meals) {
          const menu = this.weeklyMenuRepo.create({
            provider,
            dayOfWeek: daySchedule.dayOfWeek,
            mealType,
            menuItems,
            description: `Freshly prepared ${mealType.toLowerCase()} item`,
          });
          await this.weeklyMenuRepo.save(menu);
        }
      }
    }
    this.logger.log('Seeded weekly 7-day menus for all mock providers.');
  }
}
