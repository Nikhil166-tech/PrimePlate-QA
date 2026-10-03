import { Payment } from '../../payments/payment.entity';
import { User } from '../../users/user.entity';
import { MealProvider } from '../../providers/meal-provider.entity';
import { QA_USERS, QA_PROVIDERS, QA_MEAL_PLANS } from '../qa-seed.constants';
import { getRelativeTimestampIst } from '../date.helper';

export function buildQaPayments(): Partial<Payment>[] {
  const prov1Id = QA_PROVIDERS[0].id;
  const prov2Id = QA_PROVIDERS[1].id;

  const stu1Id = QA_USERS.STUDENTS[0].id;
  const stu2Id = QA_USERS.STUDENTS[1].id;
  const stu3Id = QA_USERS.STUDENTS[2].id;
  const stu4Id = QA_USERS.STUDENTS[3].id;

  const plan1Id = QA_MEAL_PLANS[0].id; // Prov 1 Full Day (₹2999)
  const plan2Id = QA_MEAL_PLANS[1].id; // Prov 1 Lunch (₹1800)
  const plan3Id = QA_MEAL_PLANS[2].id; // Prov 1 Dinner (₹1800)
  const plan5Id = QA_MEAL_PLANS[4].id; // Prov 2 Full Day (₹3200)

  return [
    // 1. Paid - Student 1 -> Plan 1 (Linked to Active Sub 1)
    {
      id: '00000000-0000-4000-e000-000000000001',
      student: { id: stu1Id } as User,
      provider: { id: prov1Id } as MealProvider,
      mealPlanId: plan1Id,
      amount: 3004.0, // 2999 + 5 fee
      mealAmount: 2999.0,
      platformFee: 5.0,
      totalAmount: 3004.0,
      platformFeeType: 'FLAT',
      platformFeeLabel: 'PrimePlate Platform Fee',
      razorpayOrderId: 'order_test_qa_001',
      razorpayPaymentId: 'pay_test_qa_001',
      razorpaySignature: 'sig_test_qa_001',
      status: 'paid',
      durationDays: 30,
      createdAt: getRelativeTimestampIst(-10, 10, 0),
    },
    // 2. Paid - Student 2 -> Plan 1 (Linked to Expired Sub 2)
    {
      id: '00000000-0000-4000-e000-000000000002',
      student: { id: stu2Id } as User,
      provider: { id: prov1Id } as MealProvider,
      mealPlanId: plan1Id,
      amount: 3004.0,
      mealAmount: 2999.0,
      platformFee: 5.0,
      totalAmount: 3004.0,
      platformFeeType: 'FLAT',
      platformFeeLabel: 'PrimePlate Platform Fee',
      razorpayOrderId: 'order_test_qa_002',
      razorpayPaymentId: 'pay_test_qa_002',
      razorpaySignature: 'sig_test_qa_002',
      status: 'paid',
      durationDays: 30,
      createdAt: getRelativeTimestampIst(-35, 10, 0),
    },
    // 3. Paid - Student 3 -> Plan 2 Lunch (Linked to Active Lunch Sub 3)
    {
      id: '00000000-0000-4000-e000-000000000003',
      student: { id: stu3Id } as User,
      provider: { id: prov1Id } as MealProvider,
      mealPlanId: plan2Id,
      amount: 1805.0,
      mealAmount: 1800.0,
      platformFee: 5.0,
      totalAmount: 1805.0,
      platformFeeType: 'FLAT',
      platformFeeLabel: 'PrimePlate Platform Fee',
      razorpayOrderId: 'order_test_qa_003',
      razorpayPaymentId: 'pay_test_qa_003',
      razorpaySignature: 'sig_test_qa_003',
      status: 'paid',
      durationDays: 30,
      createdAt: getRelativeTimestampIst(-7, 10, 0),
    },
    // 4. Paid - Student 3 -> Plan 3 Dinner (Linked to Active Dinner Sub 4)
    {
      id: '00000000-0000-4000-e000-000000000004',
      student: { id: stu3Id } as User,
      provider: { id: prov1Id } as MealProvider,
      mealPlanId: plan3Id,
      amount: 1805.0,
      mealAmount: 1800.0,
      platformFee: 5.0,
      totalAmount: 1805.0,
      platformFeeType: 'FLAT',
      platformFeeLabel: 'PrimePlate Platform Fee',
      razorpayOrderId: 'order_test_qa_004',
      razorpayPaymentId: 'pay_test_qa_004',
      razorpaySignature: 'sig_test_qa_004',
      status: 'paid',
      durationDays: 30,
      createdAt: getRelativeTimestampIst(-7, 10, 0),
    },
    // 5. Paid - Student 4 -> Plan 5 Full Day Provider B (Linked to Active Sub 5)
    {
      id: '00000000-0000-4000-e000-000000000005',
      student: { id: stu4Id } as User,
      provider: { id: prov2Id } as MealProvider,
      mealPlanId: plan5Id,
      amount: 3205.0,
      mealAmount: 3200.0,
      platformFee: 5.0,
      totalAmount: 3205.0,
      platformFeeType: 'FLAT',
      platformFeeLabel: 'PrimePlate Platform Fee',
      razorpayOrderId: 'order_test_qa_005',
      razorpayPaymentId: 'pay_test_qa_005',
      razorpaySignature: 'sig_test_qa_005',
      status: 'paid',
      durationDays: 30,
      createdAt: getRelativeTimestampIst(-5, 10, 0),
    },
    // 6. Paid - Student 1 -> Plan 1 Full Day Provider A (Linked to Expired Sub 6)
    {
      id: '00000000-0000-4000-e000-000000000006',
      student: { id: stu1Id } as User,
      provider: { id: prov1Id } as MealProvider,
      mealPlanId: plan1Id,
      amount: 3004.0,
      mealAmount: 2999.0,
      platformFee: 5.0,
      totalAmount: 3004.0,
      platformFeeType: 'FLAT',
      platformFeeLabel: 'PrimePlate Platform Fee',
      razorpayOrderId: 'order_test_qa_006',
      razorpayPaymentId: 'pay_test_qa_006',
      razorpaySignature: 'sig_test_qa_006',
      status: 'paid',
      durationDays: 30,
      createdAt: getRelativeTimestampIst(-65, 10, 0),
    },
  ];
}
