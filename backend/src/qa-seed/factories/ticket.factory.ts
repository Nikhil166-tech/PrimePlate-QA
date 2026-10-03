import {
  SupportTicket,
  SupportTicketStatus,
  SupportTicketIssueType,
} from '../../support/support-ticket.entity';
import { User } from '../../users/user.entity';
import { Payment } from '../../payments/payment.entity';
import { QA_USERS } from '../qa-seed.constants';
import { getRelativeTimestampIst } from '../date.helper';

export function buildQaSupportTickets(): Partial<SupportTicket>[] {
  const stu1Id = QA_USERS.STUDENTS[0].id;
  const stu2Id = QA_USERS.STUDENTS[1].id;
  const stu4Id = QA_USERS.STUDENTS[3].id;

  const pay1Id = '00000000-0000-4000-e000-000000000001';
  const pay2Id = '00000000-0000-4000-e000-000000000002';
  const pay5Id = '00000000-0000-4000-e000-000000000005';

  return [
    // 1. OPEN Ticket (Student 2)
    {
      id: '00000000-0000-4000-7000-000000000001',
      ticketNumber: 'TKT-QA-1001',
      student: { id: stu2Id } as User,
      payment: { id: pay2Id } as Payment,
      razorpayOrderId: 'order_test_qa_002',
      issueType: SupportTicketIssueType.MONEY_DEBITED_PAYMENT_FAILED,
      description: 'Money debited from UPI bank account but order status took time to reflect in app.',
      utrReference: 'UTR-QA-9901',
      status: SupportTicketStatus.OPEN,
      createdAt: getRelativeTimestampIst(-1, 16, 0),
    },

    // 2. INVESTIGATING Ticket (Student 4)
    {
      id: '00000000-0000-4000-7000-000000000002',
      ticketNumber: 'TKT-QA-1002',
      student: { id: stu4Id } as User,
      payment: { id: pay5Id } as Payment,
      razorpayOrderId: 'order_test_qa_005',
      razorpayPaymentId: 'pay_test_qa_005',
      issueType: SupportTicketIssueType.PAYMENT_SUCCESSFUL_MESSCARD_MISSING,
      description: 'Card activation took a few minutes after successful payment.',
      status: SupportTicketStatus.INVESTIGATING,
      createdAt: getRelativeTimestampIst(-3, 11, 20),
    },

    // 3. RESOLVED Ticket (Student 1)
    {
      id: '00000000-0000-4000-7000-000000000003',
      ticketNumber: 'TKT-QA-1003',
      student: { id: stu1Id } as User,
      payment: { id: pay1Id } as Payment,
      razorpayOrderId: 'order_test_qa_001',
      razorpayPaymentId: 'pay_test_qa_001',
      issueType: SupportTicketIssueType.OTHER,
      description: 'Inquired about how weekend meal menu schedules work.',
      status: SupportTicketStatus.RESOLVED,
      createdAt: getRelativeTimestampIst(-4, 9, 30),
    },
  ];
}
