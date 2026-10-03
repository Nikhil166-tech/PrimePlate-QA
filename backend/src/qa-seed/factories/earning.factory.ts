import {
  ProviderEarning,
  ProviderEarningStatus,
} from '../../payouts/provider-earning.entity';
import { ProviderSettlementAudit } from '../../payouts/provider-settlement-audit.entity';
import { Payment } from '../../payments/payment.entity';
import { QA_USERS, QA_PROVIDERS, QA_SUBSCRIPTIONS } from '../qa-seed.constants';
import { getRelativeTimestampIst } from '../date.helper';

export function buildQaProviderEarnings(): {
  earnings: Partial<ProviderEarning>[];
  audits: Partial<ProviderSettlementAudit>[];
} {
  const earnings: Partial<ProviderEarning>[] = [];
  const audits: Partial<ProviderSettlementAudit>[] = [];

  const adminId = QA_USERS.ADMIN.id;
  const adminEmail = QA_USERS.ADMIN.email;

  const prov1Id = QA_PROVIDERS[0].id;
  const prov2Id = QA_PROVIDERS[1].id;

  const stu1Id = QA_USERS.STUDENTS[0].id;
  const stu3Id = QA_USERS.STUDENTS[2].id;
  const stu4Id = QA_USERS.STUDENTS[3].id;

  const sub1Id = QA_SUBSCRIPTIONS[0].id;
  const sub3Id = QA_SUBSCRIPTIONS[2].id;
  const sub4Id = QA_SUBSCRIPTIONS[3].id;
  const sub5Id = QA_SUBSCRIPTIONS[4].id;

  const pay1Id = '00000000-0000-4000-e000-000000000001';
  const pay3Id = '00000000-0000-4000-e000-000000000003';
  const pay4Id = '00000000-0000-4000-e000-000000000004';
  const pay5Id = '00000000-0000-4000-e000-000000000005';

  // 1. Earning 1: PAID (Provider A, ₹2999) with Settlement Audit
  const earn1Id = '00000000-0000-4000-9000-000000000001';
  earnings.push({
    id: earn1Id,
    paymentId: pay1Id,
    payment: { id: pay1Id } as Payment,
    subscriptionId: sub1Id,
    providerId: prov1Id,
    studentId: stu1Id,
    grossAmount: 3004.0,
    platformFee: 5.0,
    providerAmount: 2999.0,
    status: ProviderEarningStatus.PAID,
    paidAt: getRelativeTimestampIst(-2, 11, 30),
    settlementReference: 'SETTLE-QA-001',
    earnedAt: getRelativeTimestampIst(-10, 10, 0),
  });

  audits.push({
    id: '00000000-0000-4000-9000-000000000011',
    adminId,
    adminEmail,
    providerId: prov1Id,
    earningId: earn1Id,
    amount: 2999.0,
    previousStatus: ProviderEarningStatus.ELIGIBLE,
    newStatus: ProviderEarningStatus.PAID,
    settlementReference: 'SETTLE-QA-001',
    createdAt: getRelativeTimestampIst(-2, 11, 30),
  });

  // 2. Earning 2: ELIGIBLE (Provider A Lunch Only, ₹1800)
  earnings.push({
    id: '00000000-0000-4000-9000-000000000002',
    paymentId: pay3Id,
    payment: { id: pay3Id } as Payment,
    subscriptionId: sub3Id,
    providerId: prov1Id,
    studentId: stu3Id,
    grossAmount: 1805.0,
    platformFee: 5.0,
    providerAmount: 1800.0,
    status: ProviderEarningStatus.ELIGIBLE,
    earnedAt: getRelativeTimestampIst(-7, 10, 0),
  });

  // 3. Earning 3: ELIGIBLE (Provider A Dinner Only, ₹1800)
  earnings.push({
    id: '00000000-0000-4000-9000-000000000003',
    paymentId: pay4Id,
    payment: { id: pay4Id } as Payment,
    subscriptionId: sub4Id,
    providerId: prov1Id,
    studentId: stu3Id,
    grossAmount: 1805.0,
    platformFee: 5.0,
    providerAmount: 1800.0,
    status: ProviderEarningStatus.ELIGIBLE,
    earnedAt: getRelativeTimestampIst(-7, 10, 0),
  });

  // 4. Earning 4: PENDING (Provider B Full Day, ₹3200)
  earnings.push({
    id: '00000000-0000-4000-9000-000000000004',
    paymentId: pay5Id,
    payment: { id: pay5Id } as Payment,
    subscriptionId: sub5Id,
    providerId: prov2Id,
    studentId: stu4Id,
    grossAmount: 3205.0,
    platformFee: 5.0,
    providerAmount: 3200.0,
    status: ProviderEarningStatus.PENDING,
    earnedAt: getRelativeTimestampIst(-5, 10, 0),
  });

  return { earnings, audits };
}
