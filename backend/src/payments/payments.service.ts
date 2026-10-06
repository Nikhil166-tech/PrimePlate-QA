import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
  Inject,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Payment } from './payment.entity';
import { PaymentWebhookEvent } from './webhook-event.entity';
import { MealPlan, MealType } from '../meal-plans/meal-plan.entity';
import { MealProvider } from '../providers/meal-provider.entity';
import { SupportTicket } from '../support/support-ticket.entity';
import {
  Subscription,
  SubscriptionStatus,
} from '../subscriptions/subscription.entity';
import { User } from '../users/user.entity';
import {
  ProviderEarning,
  ProviderEarningStatus,
} from '../payouts/provider-earning.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MealRecoveryService } from '../meal-recovery/meal-recovery.service';
import { SettingsService } from '../settings/settings.service';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';

function parseDurationDays(durationInput: string | number | undefined): number {
  if (!durationInput) return 30; // default to 1 month (30 days)

  if (typeof durationInput === 'number') {
    if ([1, 7, 15, 30].includes(durationInput)) return durationInput;
    throw new BadRequestException(
      'Invalid subscription duration. Supported durations: 1 Day (1), 1 Week (7), 15 Days (15), 1 Month (30).',
    );
  }

  const normalized = String(durationInput).trim().toUpperCase();
  if (
    normalized === 'DAY' ||
    normalized === '1' ||
    normalized === 'ONE_DAY' ||
    normalized === 'ONEDAY'
  )
    return 1;
  if (
    normalized === 'WEEK' ||
    normalized === '7' ||
    normalized === 'ONE_WEEK' ||
    normalized === 'ONEWEEK'
  )
    return 7;
  if (
    normalized === 'FIFTEEN_DAYS' ||
    normalized === '15' ||
    normalized === 'FIFTEENDAYS' ||
    normalized === 'HALF_MONTH'
  )
    return 15;
  if (
    normalized === 'MONTH' ||
    normalized === '30' ||
    normalized === 'ONE_MONTH' ||
    normalized === 'ONEMONTH'
  )
    return 30;

  const parsedNum = parseInt(normalized, 10);
  if (!isNaN(parsedNum) && [1, 7, 15, 30].includes(parsedNum)) {
    return parsedNum;
  }

  throw new BadRequestException(
    'Invalid subscription duration. Supported duration values: DAY (1), WEEK (7), FIFTEEN_DAYS (15), MONTH (30).',
  );
}

export function calculateAuthoritativeAmount(
  monthlyPrice: number,
  durationDays: number,
  customOneDayPrice?: number | null,
): number {
  if (durationDays === 1) {
    if (
      customOneDayPrice !== undefined &&
      customOneDayPrice !== null &&
      Number(customOneDayPrice) > 0
    ) {
      return Number(customOneDayPrice);
    }
    throw new BadRequestException(
      '1-day pass is not available for this meal plan until a 1-day price is configured',
    );
  }
  if (isNaN(monthlyPrice) || !isFinite(monthlyPrice) || monthlyPrice <= 0) {
    throw new BadRequestException('Invalid provider monthly price');
  }
  return Math.max(1, Math.round((monthlyPrice / 30) * durationDays));
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private razorpay: Razorpay | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(PaymentWebhookEvent)
    private readonly webhookEventRepo: Repository<PaymentWebhookEvent>,
    @InjectRepository(MealPlan) private readonly planRepo: Repository<MealPlan>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(SupportTicket)
    private readonly ticketRepo: Repository<SupportTicket>,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    @Optional()
    private readonly mealRecoveryService?: MealRecoveryService,
    @Optional()
    private readonly settingsService?: SettingsService,
  ) {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (keyId && keySecret && keyId !== 'your_razorpay_key_id') {
      this.razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
    }
  }

  async createOrder(
    mealPlanId: string,
    userId: string,
    durationInput?: string | number,
  ) {
    if (!mealPlanId) throw new BadRequestException('Meal plan ID is required');
    const durationDays = parseDurationDays(durationInput);

    this.logger.log(
      `CREATE_ORDER_STARTED: userId=${userId}, mealPlanId=${mealPlanId}, durationDays=${durationDays}`,
    );

    const plan = await this.planRepo.findOne({
      where: { id: mealPlanId },
      relations: { provider: true },
    });
    if (!plan) throw new NotFoundException('Meal plan not found');

    const provider = plan.provider;
    if (provider) {
      if (provider.approvalStatus !== 'APPROVED') {
        throw new BadRequestException(
          'Provider is not approved to accept subscriptions',
        );
      }
      if (!provider.acceptingSubscriptions) {
        throw new BadRequestException(
          'Provider is currently closed for new subscriptions',
        );
      }
    }

    if (plan.isActive === false) {
      throw new BadRequestException('This meal plan is currently disabled');
    }

    const baseMonthlyPrice = Number(
      plan.sellingPrice ?? plan.pricePerMonth ?? provider?.monthlyPrice ?? 0,
    );
    const mealAmount = calculateAuthoritativeAmount(
      baseMonthlyPrice,
      durationDays,
      plan.customOneDayPrice,
    );

    // Retrieve active platform fee setting (authoritative from system_settings)
    const feeConfig = this.settingsService
      ? await this.settingsService.getFeeSettings()
      : {
          enabled: false,
          type: 'FLAT',
          amount: 5,
          label: 'PrimePlate Platform Fee',
        };

    const platformFee =
      feeConfig.enabled && feeConfig.amount > 0 ? Number(feeConfig.amount) : 0;
    const totalAmount = mealAmount + platformFee;
    const amountInPaise = Math.round(totalAmount * 100);
    if (amountInPaise < 100) {
      throw new BadRequestException(
        'Minimum order amount must be at least 100 paise (₹1.00)',
      );
    }
    const receipt = `rcpt_${userId.slice(0, 8)}_${Date.now()}`;
    const isProduction = process.env.NODE_ENV === 'production';

    let orderId: string;
    let keyId = this.config.get<string>('RAZORPAY_KEY_ID') || 'rzp_test_key';
    let orderResult: any;

    if (!this.razorpay) {
      if (isProduction) {
        throw new BadRequestException(
          'Razorpay production credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) are missing or misconfigured. Order creation fail-closed.',
        );
      }
      orderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      orderResult = {
        id: orderId,
        entity: 'order',
        amount: amountInPaise,
        amount_paid: 0,
        amount_due: amountInPaise,
        currency: 'INR',
        receipt,
        status: 'created',
        key_id: keyId,
        notes: {
          mealPlanId,
          userId,
          durationDays,
          authoritativeAmount: totalAmount,
          mealAmount,
          platformFee,
        },
      };
    } else {
      try {
        const order = await this.razorpay.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt,
          notes: {
            mealPlanId,
            userId,
            durationDays,
            authoritativeAmount: totalAmount,
            mealAmount,
            platformFee,
          },
        });
        orderId = order.id;
        orderResult = {
          ...order,
          key_id: this.config.get<string>('RAZORPAY_KEY_ID'),
        };
      } catch (err: any) {
        if (isProduction) {
          throw new BadRequestException(
            `Razorpay Order creation failed in production: ${err.message || err}`,
          );
        }
        this.logger.warn(
          `Razorpay API warning (${err.message}). Falling back to development test order structure.`,
        );
        orderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        keyId = this.config.get<string>('RAZORPAY_KEY_ID') || '';
        orderResult = {
          id: orderId,
          entity: 'order',
          amount: amountInPaise,
          amount_paid: 0,
          amount_due: amountInPaise,
          currency: 'INR',
          receipt,
          status: 'created',
          key_id: keyId,
          notes: {
            mealPlanId,
            userId,
            durationDays,
            authoritativeAmount: totalAmount,
            mealAmount,
            platformFee,
          },
        };
      }
    }

    this.logger.log(
      `CREATE_RAZORPAY_ORDER_SUCCESS: orderId=${orderId}, userId=${userId}, totalAmount=${totalAmount}, mealAmount=${mealAmount}, platformFee=${platformFee}`,
    );

    // Pre-persist order in Payment table to establish authoritative ownership, fee snapshot, and duration metadata
    const student = await this.userRepo.findOne({ where: { id: userId } });
    if (!student) {
      throw new NotFoundException('Student user not found for order creation');
    }

    try {
      const prePayment = this.paymentRepo.create({
        student,
        provider: provider || undefined,
        amount: totalAmount,
        totalAmount,
        mealAmount,
        platformFee,
        platformFeeType: feeConfig.type,
        platformFeeLabel: feeConfig.label,
        razorpayOrderId: orderId,
        status: 'created',
        durationDays,
        mealPlanId,
      });
      await this.paymentRepo.save(prePayment);
      this.logger.log(
        `LOCAL_PAYMENT_CREATED: orderId=${orderId}, userId=${userId}, mealPlanId=${mealPlanId}, durationDays=${durationDays}, status=created`,
      );
    } catch (saveErr: any) {
      this.logger.error(
        `Failed to pre-persist pending order record: ${saveErr.message || saveErr}`,
      );
      throw new BadRequestException(
        `Failed to persist order record locally: ${saveErr.message || saveErr}`,
      );
    }

    return orderResult;
  }

  verifyCheckoutSignature(payload: string, signature: string): boolean {
    if (!signature) return false;
    if (
      process.env.NODE_ENV !== 'production' &&
      (signature.startsWith('sig_test_') ||
        signature.startsWith('sig_sandbox_') ||
        signature.startsWith('sig_e2e_'))
    ) {
      return true;
    }
    const secret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!secret) return false;
    const generated = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const genBuf = Buffer.from(generated, 'utf8');
    const sigBuf = Buffer.from(signature, 'utf8');
    return (
      genBuf.length === sigBuf.length && crypto.timingSafeEqual(genBuf, sigBuf)
    );
  }

  // Alias for backward compatibility with checkout callers/tests
  verifySignature(payload: string, signature: string): boolean {
    return this.verifyCheckoutSignature(payload, signature);
  }

  verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
    if (!signature) {
      this.logger.warn(
        'Webhook signature check failed: signature header is missing',
      );
      return false;
    }
    const cleanSignature = signature.trim();

    if (
      process.env.NODE_ENV !== 'production' &&
      (cleanSignature.startsWith('sig_test_') ||
        cleanSignature.startsWith('sig_sandbox_') ||
        cleanSignature.startsWith('sig_e2e_'))
    ) {
      this.logger.log(
        'Webhook signature bypass matched non-production test signature pattern',
      );
      return true;
    }
    const rawSecret = this.config.get<string>('RAZORPAY_WEBHOOK_SECRET');
    if (!rawSecret) {
      this.logger.error(
        'RAZORPAY_WEBHOOK_SECRET environment variable is missing in configuration!',
      );
      return false;
    }
    const webhookSecret = rawSecret.trim();

    const bodyBuffer = Buffer.isBuffer(rawBody)
      ? rawBody
      : Buffer.from(
          typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody),
          'utf8',
        );

    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(bodyBuffer)
      .digest('hex');

    const expectedBuf = Buffer.from(expected, 'utf8');
    const sigBuf = Buffer.from(cleanSignature, 'utf8');
    const isValid =
      expectedBuf.length === sigBuf.length &&
      crypto.timingSafeEqual(expectedBuf, sigBuf);

    if (!isValid) {
      this.logger.warn(
        `Webhook signature HMAC verification failed. Secret configured=true, signatureLength=${cleanSignature.length}`,
      );
    }
    return isValid;
  }

  /**
   * Internal authoritative payment reconciliation method.
   * Reconciles captured payment, persists Payment status as paid, creates Subscription and ProviderEarning.
   */
  async reconcileCapturedPayment(params: {
    userId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature?: string;
    mealPlanId?: string;
    durationInput?: string | number;
    skipSignatureCheck?: boolean;
    paymentAmountInPaise?: number;
  }) {
    const {
      userId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      mealPlanId,
      durationInput,
      skipSignatureCheck,
      paymentAmountInPaise,
    } = params;

    // Retrieve pre-persisted order record if available
    const preOrder = await this.paymentRepo.findOne({
      where: [{ razorpayOrderId }, { razorpayPaymentId }],
      relations: { student: true, provider: true },
    });

    // Enforce order-user binding ownership
    if (preOrder && preOrder.student && preOrder.student.id !== userId) {
      throw new ForbiddenException(
        'Payment order does not belong to the authenticated student',
      );
    }

    const targetPlanId = mealPlanId || preOrder?.mealPlanId;
    if (!targetPlanId) {
      throw new BadRequestException(
        'Meal plan ID is required for verification',
      );
    }

    const durationDays = parseDurationDays(
      durationInput !== undefined ? durationInput : preOrder?.durationDays,
    );

    // Idempotency check: Return existing payment record if already processed
    if (preOrder && preOrder.status === 'paid') {
      this.logger.log(
        `Payment ${razorpayPaymentId} already processed (Idempotent replay).`,
      );
      const existingSubs =
        await this.subscriptionsService.findByStudent(userId);
      const sub = existingSubs.find((s) => s.mealPlan?.id === targetPlanId);
      return {
        success: true,
        verified: true,
        idempotent: true,
        payment: preOrder,
        subscription: sub,
      };
    }

    // Verify Checkout HMAC-SHA256 signature if not skipped (e.g. webhook pre-verified)
    if (!skipSignatureCheck) {
      const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
      const isValid = this.verifyCheckoutSignature(
        payload,
        razorpaySignature || '',
      );
      if (!isValid) {
        throw new BadRequestException(
          'Invalid payment signature. Verification failed.',
        );
      }
    }

    return await this.paymentRepo.manager.transaction(async (manager) => {
      // 1. Idempotency check inside transaction
      const existingPayment = await manager.findOne(Payment, {
        where: [{ razorpayOrderId }, { razorpayPaymentId }],
        relations: { student: true, provider: true },
      });

      if (existingPayment && existingPayment.status === 'paid') {
        this.logger.log(
          `Payment ${razorpayPaymentId} already processed (Idempotent replay).`,
        );
        const existingSubs =
          await this.subscriptionsService.findByStudent(userId);
        const sub = existingSubs.find((s) => s.mealPlan?.id === targetPlanId);
        return {
          success: true,
          verified: true,
          idempotent: true,
          payment: existingPayment,
          subscription: sub,
        };
      }

      // 2. Load student and meal plan with provider inside transaction
      const student = await manager.findOne(User, { where: { id: userId } });
      if (!student) throw new NotFoundException('Student user not found');

      const mealPlan = await manager.findOne(MealPlan, {
        where: { id: targetPlanId },
        relations: { provider: true },
      });
      if (!mealPlan) throw new NotFoundException('Meal plan not found');
      if (!mealPlan.provider)
        throw new NotFoundException('Associated provider kitchen not found');

      const providerId = mealPlan.provider.id;
      const dbType = manager.connection.options.type;

      // 3. Apply pessimistic write lock on PostgreSQL driver for capacity check
      if (dbType === 'postgres') {
        await manager
          .createQueryBuilder(MealProvider, 'p')
          .setLock('pessimistic_write')
          .where('p.id = :id', { id: providerId })
          .getOne();
      }

      const provider = await manager.findOne(MealProvider, {
        where: { id: providerId },
      });
      if (!provider) throw new NotFoundException('Provider record not found');

      if (provider.approvalStatus !== 'APPROVED') {
        throw new BadRequestException(
          'This provider is not currently approved for subscriptions',
        );
      }

      if (!provider.acceptingSubscriptions) {
        throw new BadRequestException(
          'This provider is currently closed for new subscriptions',
        );
      }

      const activeCount = await manager.count(Subscription, {
        where: {
          mealPlan: { provider: { id: provider.id } },
          status: SubscriptionStatus.ACTIVE,
        },
      });

      const targetMealType = mealPlan.mealType || MealType.FULL_DAY;

      let studentActiveSubsForProvider: Subscription[] = [];
      if (typeof manager.find === 'function') {
        studentActiveSubsForProvider = await manager.find(Subscription, {
          where: {
            student: { id: student.id },
            mealPlan: { provider: { id: provider.id } },
            status: SubscriptionStatus.ACTIVE,
          },
          relations: { mealPlan: { provider: true } },
        });
      } else if (typeof manager.findOne === 'function') {
        const singleSub = await manager.findOne(Subscription, {
          where: {
            student: { id: student.id },
            mealPlan: { provider: { id: provider.id } },
            status: SubscriptionStatus.ACTIVE,
          },
          relations: { mealPlan: { provider: true } },
        });
        if (singleSub) {
          studentActiveSubsForProvider = [singleSub];
        }
      }

      const studentExistingActiveForMealType =
        studentActiveSubsForProvider.find(
          (s) => (s.mealPlan?.mealType || MealType.FULL_DAY) === targetMealType,
        );

      const effectiveActiveSeats = studentExistingActiveForMealType
        ? Math.max(0, activeCount - 1)
        : activeCount;

      if (
        provider.totalCapacity === null ||
        provider.totalCapacity === undefined
      ) {
        throw new BadRequestException(
          'Provider total student capacity is not set',
        );
      }

      const totalCap = Number(provider.totalCapacity);
      if (effectiveActiveSeats >= totalCap) {
        throw new BadRequestException(
          'This mess is fully booked. Maximum student capacity reached.',
        );
      }

      if (mealPlan.isActive === false) {
        throw new BadRequestException('This meal plan is currently disabled');
      }

      const baseMonthlyPrice = Number(
        mealPlan.sellingPrice ??
          mealPlan.pricePerMonth ??
          provider.monthlyPrice ??
          0,
      );
      const mealAmount = calculateAuthoritativeAmount(
        baseMonthlyPrice,
        durationDays,
        mealPlan.customOneDayPrice,
      );

      // Determine platform fee snapshot from preOrder or settings
      let platformFee = 0;
      let platformFeeType: string | null = null;
      let platformFeeLabel: string | null = null;

      if (
        preOrder &&
        preOrder.platformFee !== undefined &&
        preOrder.platformFee !== null
      ) {
        platformFee = Number(preOrder.platformFee);
        platformFeeType = preOrder.platformFeeType || null;
        platformFeeLabel = preOrder.platformFeeLabel || null;
      } else if (this.settingsService) {
        const feeConfig = await this.settingsService.getFeeSettings();
        if (feeConfig && feeConfig.enabled && feeConfig.amount > 0) {
          platformFee = Number(feeConfig.amount);
          platformFeeType = feeConfig.type;
          platformFeeLabel = feeConfig.label;
        }
      }

      const authoritativeAmount = mealAmount + platformFee;

      // Amount Integrity Validation
      if (paymentAmountInPaise !== undefined && paymentAmountInPaise > 0) {
        const paymentAmountInRupees = paymentAmountInPaise / 100;
        if (Math.abs(paymentAmountInRupees - authoritativeAmount) > 0.01) {
          throw new BadRequestException(
            `Payment amount mismatch. Expected ₹${authoritativeAmount}, got ₹${paymentAmountInRupees}`,
          );
        }
      }

      if (
        preOrder &&
        preOrder.amount &&
        Math.abs(Number(preOrder.amount) - authoritativeAmount) > 0.01
      ) {
        throw new BadRequestException(
          `Payment amount mismatch with order authoritative amount`,
        );
      }

      // 4. Save/Update Payment FIRST inside the transaction
      let paymentToSave: Payment;
      if (existingPayment) {
        existingPayment.status = 'paid';
        existingPayment.razorpayPaymentId = razorpayPaymentId;
        existingPayment.razorpaySignature = razorpaySignature;
        existingPayment.amount = authoritativeAmount;
        existingPayment.totalAmount = authoritativeAmount;
        existingPayment.mealAmount = mealAmount;
        existingPayment.platformFee = platformFee;
        existingPayment.durationDays = durationDays;
        existingPayment.mealPlanId = targetPlanId;
        paymentToSave = existingPayment;
      } else {
        paymentToSave = manager.create(Payment, {
          student,
          provider,
          amount: authoritativeAmount,
          totalAmount: authoritativeAmount,
          mealAmount,
          platformFee,
          platformFeeType,
          platformFeeLabel,
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
          status: 'paid',
          durationDays,
          mealPlanId: targetPlanId,
        });
      }

      const savedPayment = await manager.save(Payment, paymentToSave);

      // 5. Idempotency Check: Check if ProviderEarning / Subscription already exists for savedPayment
      let earning = await manager.findOne(ProviderEarning, {
        where: { paymentId: savedPayment.id },
        relations: { subscription: true },
      });

      if (earning && earning.subscription) {
        return {
          success: true,
          verified: true,
          idempotent: true,
          payment: savedPayment,
          subscription: earning.subscription,
          earning,
        };
      }

      // Check if an active Subscription already exists for this student in this PG/provider FOR THIS MEAL TYPE
      const existingActiveSub = studentActiveSubsForProvider.find(
        (s) => (s.mealPlan?.mealType || MealType.FULL_DAY) === targetMealType,
      );

      let savedSubscription: Subscription;
      const todayStr = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());

      if (
        existingActiveSub &&
        existingActiveSub.endDate &&
        existingActiveSub.endDate >= todayStr
      ) {
        // Renewal logic: Extend existing active subscription in this PG for this meal type by durationDays
        const baseEndStr = existingActiveSub.endDate;
        const baseEndObj = new Date(baseEndStr + 'T00:00:00Z');
        baseEndObj.setUTCDate(baseEndObj.getUTCDate() + durationDays);
        const newEndDate = baseEndObj.toISOString().split('T')[0];

        existingActiveSub.endDate = newEndDate;
        existingActiveSub.mealPlan = mealPlan;
        existingActiveSub.status = SubscriptionStatus.ACTIVE;

        savedSubscription = await manager.save(Subscription, existingActiveSub);
      } else {
        // If there was an old subscription whose endDate has already passed, mark it as EXPIRED
        if (existingActiveSub) {
          existingActiveSub.status = SubscriptionStatus.EXPIRED;
          await manager.save(Subscription, existingActiveSub);
        }

        const startDate = todayStr;
        const startObj = new Date(startDate + 'T00:00:00Z');
        startObj.setUTCDate(
          startObj.getUTCDate() + Math.max(0, durationDays - 1),
        );
        const endDate = startObj.toISOString().split('T')[0];

        const subscriptionEntity = manager.create(Subscription, {
          student,
          mealPlan,
          status: SubscriptionStatus.ACTIVE,
          startDate,
          endDate,
          recoveryDaysApplied: 0,
        });

        savedSubscription = await manager.save(
          Subscription,
          subscriptionEntity,
        );
      }

      // 5b. Apply provider-specific meal recovery days (inside same transaction — atomic).
      // Meal Recovery is ONLY available for FULL_DAY subscriptions.
      if (this.mealRecoveryService && targetMealType === MealType.FULL_DAY) {
        const recoveryDaysConsumed =
          await this.mealRecoveryService.consumeRecovery(
            student.id,
            provider.id,
            manager,
          );
        if (recoveryDaysConsumed > 0) {
          const baseEnd = new Date(savedSubscription.endDate + 'T00:00:00Z');
          baseEnd.setUTCDate(baseEnd.getUTCDate() + recoveryDaysConsumed);
          savedSubscription.endDate = baseEnd.toISOString().split('T')[0];
          savedSubscription.recoveryDaysApplied =
            (savedSubscription.recoveryDaysApplied || 0) + recoveryDaysConsumed;
          savedSubscription = await manager.save(
            Subscription,
            savedSubscription,
          );
          this.logger.log(
            `Recovery applied: studentId=${student.id}, providerId=${provider.id}, days=${recoveryDaysConsumed}, totalApplied=${savedSubscription.recoveryDaysApplied}, newEndDate=${savedSubscription.endDate}`,
          );
        }
      }

      // 6. Create and save Provider Earning record atomically
      const grossAmount = Number(savedPayment.amount);
      const earnedPlatformFee = Number(savedPayment.platformFee || 0);
      const providerAmount = Number(
        savedPayment.mealAmount || grossAmount - earnedPlatformFee,
      );

      if (!earning) {
        earning = manager.create(ProviderEarning, {
          paymentId: savedPayment.id,
          subscriptionId: savedSubscription.id,
          providerId: provider.id,
          studentId: student.id,
          grossAmount,
          platformFee: earnedPlatformFee,
          providerAmount,
          status: ProviderEarningStatus.PENDING,
          earnedAt: new Date(),
        });
        await manager.save(ProviderEarning, earning);
      }

      return {
        success: true,
        verified: true,
        payment: savedPayment,
        subscription: savedSubscription,
        earning,
      };
    });
  }

  /**
   * Public endpoint helper for payment verification. Delegated to reconcileCapturedPayment.
   */
  async processVerifiedPayment(params: {
    userId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature?: string;
    mealPlanId?: string;
    durationInput?: string | number;
    skipSignatureCheck?: boolean;
    paymentAmountInPaise?: number;
  }) {
    return this.reconcileCapturedPayment(params);
  }

  async handleWebhook(
    rawBody: string | Buffer,
    signature: string,
    eventData: any,
    headers?: Record<string, any>,
  ) {
    const isValid = this.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      this.logger.warn(
        `Razorpay webhook signature verification failed. Rejecting with HTTP 400 Bad Request.`,
      );
      throw new BadRequestException('Invalid webhook signature');
    }

    const eventId =
      headers?.['x-razorpay-event-id'] ||
      (headers as any)?.['X-Razorpay-Event-Id'] ||
      eventData?.id ||
      `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const event = eventData?.event;
    const paymentEntity = eventData.payload?.payment?.entity;
    const orderEntity = eventData.payload?.order?.entity;
    const entity = paymentEntity || orderEntity;

    const orderId =
      paymentEntity?.order_id ||
      orderEntity?.id ||
      entity?.order_id ||
      entity?.id ||
      'unknown';
    const paymentId =
      paymentEntity?.id || (entity?.order_id ? entity?.id : null) || 'unknown';

    this.logger.log(
      `RAZORPAY_WEBHOOK_RECEIVED: eventId=${eventId}, eventType=${event}, orderId=${orderId}, paymentId=${paymentId}`,
    );

    if (event === 'payment.authorized') {
      this.logger.log(
        `Razorpay webhook received payment.authorized (eventId=${eventId}). Acknowledging intermediate state without subscription activation.`,
      );
      try {
        const webhookEvent = this.webhookEventRepo.create({
          eventId,
          eventType: event || 'unknown',
          processedAt: new Date(),
        });
        await this.webhookEventRepo.save(webhookEvent);
      } catch {}
      return { status: 'OK', message: 'payment.authorized acknowledged' };
    }

    if (event === 'payment.captured' || event === 'order.paid') {
      const notes = entity?.notes || {};
      const amountInPaise =
        paymentEntity?.amount ||
        paymentEntity?.amount_paid ||
        orderEntity?.amount_paid;

      // Look up pre-persisted order record to retrieve authoritative metadata
      const preOrder =
        orderId && orderId !== 'unknown'
          ? await this.paymentRepo.findOne({
              where: { razorpayOrderId: orderId },
              relations: { student: true },
            })
          : null;

      let userId = notes.userId || preOrder?.student?.id;
      let mealPlanId = notes.mealPlanId || preOrder?.mealPlanId;
      let durationDays = notes.durationDays || preOrder?.durationDays || 30;

      // If metadata missing, attempt recovery from Razorpay API
      if (
        (!userId || !mealPlanId) &&
        this.razorpay &&
        orderId &&
        orderId !== 'unknown'
      ) {
        try {
          const rzpOrder: any = await this.razorpay.orders.fetch(orderId);
          const rzpNotes = rzpOrder?.notes || {};
          if (!userId) userId = rzpNotes.userId;
          if (!mealPlanId) mealPlanId = rzpNotes.mealPlanId;
          if (!durationDays) durationDays = rzpNotes.durationDays;
        } catch (fetchErr: any) {
          this.logger.warn(
            `Failed to fetch order notes from Razorpay API for ${orderId}: ${fetchErr.message}`,
          );
        }
      }

      if (!mealPlanId || !userId || !orderId || orderId === 'unknown') {
        this.logger.error(
          `RAZORPAY_PAYMENT_RECONCILIATION_FAILED: orderId=${orderId}, paymentId=${paymentId}, reason="Missing required order metadata (userId or mealPlanId)"`,
        );
        throw new BadRequestException(
          `Cannot reconcile webhook: missing required order metadata for order ${orderId}`,
        );
      }

      this.logger.log(
        `RAZORPAY_PAYMENT_RECONCILIATION_STARTED: orderId=${orderId}, paymentId=${paymentId}, userId=${userId}`,
      );

      try {
        await this.reconcileCapturedPayment({
          userId,
          razorpayOrderId: orderId,
          razorpayPaymentId: paymentId || orderId,
          mealPlanId,
          durationInput: durationDays,
          skipSignatureCheck: true,
          paymentAmountInPaise: amountInPaise
            ? Number(amountInPaise)
            : undefined,
        });

        this.logger.log(
          `RAZORPAY_PAYMENT_RECONCILIATION_SUCCESS: orderId=${orderId}, paymentId=${paymentId}`,
        );
      } catch (reconcileErr: any) {
        this.logger.error(
          `RAZORPAY_PAYMENT_RECONCILIATION_FAILED: orderId=${orderId}, paymentId=${paymentId}, reason="${reconcileErr.message || reconcileErr}"`,
        );
        throw reconcileErr;
      }

      // Record webhook event idempotency AFTER business operation succeeds
      try {
        const webhookEvent = this.webhookEventRepo.create({
          eventId,
          eventType: event || 'unknown',
          processedAt: new Date(),
        });
        await this.webhookEventRepo.save(webhookEvent);
      } catch (err: any) {
        if (
          err.code === '23505' ||
          err.message?.includes('duplicate') ||
          err.message?.includes('UNIQUE')
        ) {
          this.logger.log(
            `Webhook event ${eventId} already processed (Idempotent replay).`,
          );
          return { status: 'OK', message: 'Event already processed' };
        }
        throw err;
      }
    } else if (event === 'payment.failed') {
      const entity = eventData.payload?.payment?.entity;
      const orderId = entity?.order_id;
      if (orderId) {
        const preOrder = await this.paymentRepo.findOne({
          where: { razorpayOrderId: orderId },
        });
        if (preOrder && preOrder.status !== 'paid') {
          preOrder.status = 'failed';
          await this.paymentRepo.save(preOrder);
        }
      }

      try {
        const webhookEvent = this.webhookEventRepo.create({
          eventId,
          eventType: event || 'unknown',
          processedAt: new Date(),
        });
        await this.webhookEventRepo.save(webhookEvent);
      } catch {}
    }

    return { status: 'OK' };
  }

  async getPaymentStatus(orderId: string, userId: string) {
    if (!orderId) throw new BadRequestException('Order ID is required');

    this.logger.log(
      `PAYMENT_STATUS_CHECK: orderId=${orderId}, userId=${userId}`,
    );

    let payment = await this.paymentRepo.findOne({
      where: { razorpayOrderId: orderId },
      relations: { student: true, provider: true },
    });

    if (!payment) {
      payment = await this.paymentRepo.findOne({
        where: { id: orderId },
        relations: { student: true, provider: true },
      });
    }

    if (!payment) {
      payment = await this.paymentRepo.findOne({
        where: { razorpayPaymentId: orderId },
        relations: { student: true, provider: true },
      });
    }

    if (payment && payment.student && payment.student.id !== userId) {
      throw new ForbiddenException(
        'Cannot check payment status belonging to another user',
      );
    }

    if (payment && payment.status === 'paid') {
      const existingSubs =
        await this.subscriptionsService.findByStudent(userId);
      const sub = existingSubs.find(
        (s) =>
          s.mealPlan?.id === payment.mealPlanId ||
          s.razorpayOrderId === orderId,
      );
      this.logger.log(
        `PAYMENT_STATUS_CHECK: orderId=${orderId}, status=SUCCESS`,
      );
      return {
        status: 'SUCCESS',
        paymentStatus: 'PAID',
        orderId,
        paymentId: payment.razorpayPaymentId,
        amount: Number(payment.amount),
        subscription: sub || null,
      };
    }

    // Reconcile with Razorpay API if available, even if local status is 'created', 'processing', 'failed', or missing
    if (this.razorpay) {
      try {
        const rzpOrder: any = await this.razorpay.orders.fetch(orderId);
        if (
          rzpOrder &&
          (rzpOrder.status === 'paid' || rzpOrder.amount_paid > 0)
        ) {
          const paymentsObj: any =
            await this.razorpay.orders.fetchPayments(orderId);
          const capturedPayment = paymentsObj?.items?.find(
            (p: any) => p.status === 'captured',
          );
          const paymentId = capturedPayment?.id || `pay_rzp_${Date.now()}`;
          const amountInPaise = capturedPayment?.amount || rzpOrder.amount_paid;

          const rzpNotes = rzpOrder.notes || {};
          const mealPlanId = payment?.mealPlanId || rzpNotes.mealPlanId;
          const durationDays =
            payment?.durationDays || rzpNotes.durationDays || 30;

          if (mealPlanId) {
            const result = await this.reconcileCapturedPayment({
              userId,
              razorpayOrderId: orderId,
              razorpayPaymentId: paymentId,
              mealPlanId,
              durationInput: durationDays,
              skipSignatureCheck: true,
              paymentAmountInPaise: amountInPaise
                ? Number(amountInPaise)
                : undefined,
            });

            this.logger.log(
              `PAYMENT_STATUS_CHECK: orderId=${orderId}, status=SUCCESS`,
            );
            return {
              status: 'SUCCESS',
              paymentStatus: 'PAID',
              orderId,
              paymentId,
              amount: result.payment?.amount
                ? Number(result.payment.amount)
                : Number(amountInPaise / 100),
              subscription: result.subscription,
            };
          }
        } else if (
          rzpOrder &&
          (rzpOrder.status === 'attempted' || rzpOrder.status === 'expired')
        ) {
          const paymentsObj: any =
            await this.razorpay.orders.fetchPayments(orderId);
          const allFailed =
            paymentsObj?.items?.length > 0 &&
            paymentsObj.items.every((p: any) => p.status === 'failed');
          if (allFailed || rzpOrder.status === 'expired') {
            if (payment && payment.status !== 'paid') {
              payment.status = 'failed';
              await this.paymentRepo.save(payment);
            }
            this.logger.log(
              `PAYMENT_STATUS_CHECK: orderId=${orderId}, status=FAILED`,
            );
            return {
              status: 'FAILED',
              paymentStatus: 'FAILED',
              orderId,
              message: 'Payment attempts failed.',
            };
          }
        }
      } catch (err: any) {
        this.logger.warn(
          `Razorpay order status fetch error for ${orderId}: ${err.message}`,
        );
      }
    }

    if (!payment) {
      this.logger.log(
        `PAYMENT_STATUS_CHECK: orderId=${orderId}, status=FAILED (not found)`,
      );
      return {
        status: 'FAILED',
        paymentStatus: 'FAILED',
        orderId,
        message: 'Order record not found on server.',
      };
    }

    if (payment.status === 'failed') {
      this.logger.log(
        `PAYMENT_STATUS_CHECK: orderId=${orderId}, status=FAILED`,
      );
      return {
        status: 'FAILED',
        paymentStatus: 'FAILED',
        orderId,
        message: 'Payment attempt was failed or cancelled.',
      };
    }

    this.logger.log(
      `PAYMENT_STATUS_CHECK: orderId=${orderId}, status=PROCESSING`,
    );
    return {
      status: 'PROCESSING',
      paymentStatus: (payment.status || 'PENDING').toUpperCase(),
      orderId,
      message: 'Payment confirmation is pending. Please check again shortly.',
    };
  }

  async processRefund(paymentId: string): Promise<Payment> {
    return await this.paymentRepo.manager.transaction(async (manager) => {
      const payment = await manager.findOne(Payment, {
        where: { id: paymentId },
        relations: { student: true, provider: true },
      });
      if (!payment) throw new NotFoundException('Payment record not found');

      payment.status = 'refunded';
      const saved = await manager.save(Payment, payment);

      const earning = await manager.findOne(ProviderEarning, {
        where: { paymentId: payment.id },
      });
      if (earning) {
        earning.status = ProviderEarningStatus.REFUNDED;
        await manager.save(ProviderEarning, earning);
      }
      return saved;
    });
  }

  async recoverPendingPayments(userId: string): Promise<{
    status: string;
    totalChecked: number;
    recoveredCount: number;
    recoveredOrders: string[];
    durationMs: number;
  }> {
    const startTime = Date.now();
    this.logger.log(`PAYMENT_RECOVERY_STARTED: userId=${userId}`);

    // Bounded search: limit to newest 5 unresolved payments ('created', 'processing', 'authorized')
    const pendingPayments = await this.paymentRepo.find({
      where: {
        student: { id: userId },
        status: In(['created', 'processing', 'authorized']),
      },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    if (!pendingPayments || pendingPayments.length === 0) {
      const durationMs = Date.now() - startTime;
      this.logger.log(
        `PAYMENT_RECOVERY_COMPLETED: userId=${userId}, checked=0, recovered=0, durationMs=${durationMs}`,
      );
      return {
        status: 'NO_PENDING_PAYMENTS',
        totalChecked: 0,
        recoveredCount: 0,
        recoveredOrders: [],
        durationMs,
      };
    }

    let recoveredCount = 0;
    const recoveredOrders: string[] = [];

    if (this.razorpay) {
      for (const payment of pendingPayments) {
        if (!payment.razorpayOrderId) continue;

        try {
          // Bounded 5-second fetch timeout per Razorpay call
          const fetchPromise = this.razorpay.orders.fetch(
            payment.razorpayOrderId,
          );
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Razorpay API timeout')), 5000),
          );

          const rzpOrder: any = await Promise.race([
            fetchPromise,
            timeoutPromise,
          ]);

          if (
            rzpOrder &&
            (rzpOrder.status === 'paid' || rzpOrder.amount_paid > 0)
          ) {
            const paymentsObj: any = await this.razorpay.orders.fetchPayments(
              payment.razorpayOrderId,
            );
            const captured = paymentsObj?.items?.find(
              (p: any) => p.status === 'captured',
            );
            const paymentId = captured?.id || `pay_rzp_${Date.now()}`;
            const amountInPaise = captured?.amount || rzpOrder.amount_paid;
            const rzpNotes = rzpOrder.notes || {};
            const mealPlanId = payment.mealPlanId || rzpNotes.mealPlanId;
            const durationDays =
              payment.durationDays || rzpNotes.durationDays || 30;

            if (mealPlanId) {
              await this.reconcileCapturedPayment({
                userId,
                razorpayOrderId: payment.razorpayOrderId,
                razorpayPaymentId: paymentId,
                mealPlanId,
                durationInput: durationDays,
                skipSignatureCheck: true,
                paymentAmountInPaise: amountInPaise
                  ? Number(amountInPaise)
                  : undefined,
              });
              recoveredCount++;
              recoveredOrders.push(payment.razorpayOrderId);
            }
          } else if (
            rzpOrder &&
            (rzpOrder.status === 'attempted' || rzpOrder.status === 'expired')
          ) {
            const paymentsObj: any = await this.razorpay.orders.fetchPayments(
              payment.razorpayOrderId,
            );
            const allFailed =
              paymentsObj?.items?.length > 0 &&
              paymentsObj.items.every((p: any) => p.status === 'failed');
            if (allFailed || rzpOrder.status === 'expired') {
              payment.status = 'failed';
              await this.paymentRepo.save(payment);
            }
          }
        } catch (err: any) {
          this.logger.error(
            `Error recovering order ${payment.razorpayOrderId}: ${err.message}`,
          );
        }
      }
    }

    const durationMs = Date.now() - startTime;
    this.logger.log(
      `PAYMENT_RECOVERY_COMPLETED: userId=${userId}, checked=${pendingPayments.length}, recovered=${recoveredCount}, durationMs=${durationMs}`,
    );

    return {
      status: 'SUCCESS',
      totalChecked: pendingPayments.length,
      recoveredCount,
      recoveredOrders,
      durationMs,
    };
  }

  async getHistory(userId: string): Promise<any[]> {
    const payments = await this.paymentRepo.find({
      where: { student: { id: userId } },
      relations: { provider: true, student: true },
      order: { createdAt: 'DESC' },
    });

    const mealPlanIds = [
      ...new Set(
        payments
          .map((p) => p.mealPlanId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const mealPlansMap: Record<string, any> = {};
    if (mealPlanIds.length > 0) {
      const plans = await this.planRepo.find({
        where: { id: In(mealPlanIds) },
        relations: { provider: true },
      });
      plans.forEach((p) => {
        mealPlansMap[p.id] = p;
      });
    }

    const ticketsMap: Record<string, any> = {};
    if (this.ticketRepo) {
      const tickets = await this.ticketRepo.find({
        where: { student: { id: userId } },
        order: { createdAt: 'DESC' },
      });
      tickets.forEach((t) => {
        if (!ticketsMap[t.razorpayOrderId]) {
          ticketsMap[t.razorpayOrderId] = t;
        }
      });
    }

    let subscriptions: any[] = [];
    if (this.subscriptionsService) {
      try {
        subscriptions = await this.subscriptionsService.findByStudent(userId);
      } catch {
        subscriptions = [];
      }
    }

    return payments.map((p) => {
      const statusLower = (p.status || 'created').toLowerCase();
      let displayStatus = 'PENDING';
      if (statusLower === 'paid') displayStatus = 'SUCCESS';
      else if (statusLower === 'failed') displayStatus = 'FAILED';
      else if (statusLower === 'refunded') displayStatus = 'REFUNDED';
      else displayStatus = 'PENDING';

      const plan = p.mealPlanId ? mealPlansMap[p.mealPlanId] : null;
      const sub =
        statusLower === 'paid'
          ? subscriptions.find(
              (s: any) =>
                s.mealPlan?.id === p.mealPlanId ||
                (p.provider && s.provider?.id === p.provider.id),
            )
          : null;

      const ticket = ticketsMap[p.razorpayOrderId] || null;

      return {
        id: p.id,
        amount: Number(p.amount),
        currency: 'INR',
        status: displayStatus,
        rawStatus: p.status,
        razorpayOrderId: p.razorpayOrderId,
        razorpayPaymentId: p.razorpayPaymentId || null,
        durationDays: p.durationDays || 30,
        mealPlanId: p.mealPlanId || null,
        createdAt: p.createdAt,
        provider: p.provider
          ? {
              id: p.provider.id,
              name: p.provider.name,
              city: p.provider.city || '',
              address: p.provider.address || '',
            }
          : plan?.provider
            ? {
                id: plan.provider.id,
                name: plan.provider.name,
                city: plan.provider.city || '',
                address: plan.provider.address || '',
              }
            : null,
        mealPlan: plan
          ? {
              id: plan.id,
              title: plan.title,
              pricePerMonth: Number(
                plan.sellingPrice ?? plan.pricePerMonth ?? 0,
              ),
              sellingPrice: Number(
                plan.sellingPrice ?? plan.pricePerMonth ?? 0,
              ),
              originalPrice: Number(
                plan.originalPrice ??
                  plan.sellingPrice ??
                  plan.pricePerMonth ??
                  0,
              ),
            }
          : null,
        subscription: sub
          ? {
              id: sub.id,
              status: sub.status,
              startDate: sub.startDate,
              endDate: sub.endDate,
            }
          : null,
        supportTicket: ticket
          ? {
              id: ticket.id,
              ticketNumber: ticket.ticketNumber,
              status: ticket.status,
              issueType: ticket.issueType,
              createdAt: ticket.createdAt,
            }
          : null,
      };
    });
  }

  async getPaymentDetails(orderId: string, userId: string): Promise<any> {
    let payment = await this.paymentRepo.findOne({
      where: { razorpayOrderId: orderId },
      relations: { student: true, provider: true },
    });

    if (!payment) {
      payment = await this.paymentRepo.findOne({
        where: { id: orderId },
        relations: { student: true, provider: true },
      });
    }

    if (!payment) {
      payment = await this.paymentRepo.findOne({
        where: { razorpayPaymentId: orderId },
        relations: { student: true, provider: true },
      });
    }

    if (!payment) {
      // Check active subscriptions fallback
      const existingSubs = this.subscriptionsService
        ? await this.subscriptionsService.findByStudent(userId)
        : [];
      const subMatch = existingSubs.find(
        (s: any) => s.razorpayOrderId === orderId || s.id === orderId,
      );

      if (subMatch) {
        return {
          payment: {
            id: subMatch.id,
            amount: Number(subMatch.mealPlan?.price || 0),
            currency: 'INR',
            status: 'SUCCESS',
            rawStatus: 'paid',
            razorpayOrderId: orderId,
            razorpayPaymentId: subMatch.razorpayPaymentId || null,
            durationDays: 30,
            createdAt: subMatch.createdAt || subMatch.startDate || new Date(),
          },
          provider: subMatch.provider || null,
          mealPlan: subMatch.mealPlan || null,
          subscription: subMatch,
          supportTicket: null,
          timeline: [
            {
              event: 'PAYMENT_INITIATED',
              title: 'Payment Initiated',
              description: `Payment order initiated`,
              timestamp: subMatch.createdAt || subMatch.startDate || new Date(),
              status: 'COMPLETED',
            },
            {
              event: 'PAYMENT_SUCCESS',
              title: 'Payment Successful',
              description: `Payment verified & confirmed`,
              timestamp: subMatch.createdAt || subMatch.startDate || new Date(),
              status: 'COMPLETED',
            },
            {
              event: 'MESSCARD_ACTIVATED',
              title: 'Mess Card Activated',
              description: `Digital QR Mess Card active & ready for daily meal scanning`,
              timestamp: subMatch.createdAt || subMatch.startDate || new Date(),
              status: 'COMPLETED',
            },
          ],
        };
      }

      throw new NotFoundException(`Payment order "${orderId}" not found.`);
    }

    // IDOR Check: Ensure authenticated student owns the payment order
    if (payment.student && payment.student.id !== userId) {
      this.logger.warn(
        `IDOR_PREVENTED: Student ${userId} attempted to access payment details for order ${orderId} owned by ${payment.student.id}`,
      );
      throw new ForbiddenException(
        'You do not have permission to view details for this payment order.',
      );
    }

    let mealPlan: any = null;
    if (payment.mealPlanId) {
      mealPlan = await this.planRepo.findOne({
        where: { id: payment.mealPlanId },
        relations: { provider: true },
      });
    }

    const provider = payment.provider || mealPlan?.provider || null;

    const statusLower = (payment.status || 'created').toLowerCase();
    let displayStatus = 'PENDING';
    if (statusLower === 'paid') displayStatus = 'SUCCESS';
    else if (statusLower === 'failed') displayStatus = 'FAILED';
    else if (statusLower === 'refunded') displayStatus = 'REFUNDED';
    else displayStatus = 'PENDING';

    let sub: any = null;
    if (statusLower === 'paid') {
      try {
        const earning = await this.paymentRepo.manager.findOne(
          ProviderEarning,
          {
            where: { paymentId: payment.id },
            relations: { subscription: { mealPlan: { provider: true } } },
          },
        );
        if (earning?.subscription) {
          sub = earning.subscription;
        }
      } catch {}

      if (!sub && this.subscriptionsService) {
        try {
          const subscriptions =
            await this.subscriptionsService.findByStudent(userId);
          sub = subscriptions.find(
            (s: any) =>
              s.mealPlan?.id === payment.mealPlanId ||
              (provider && s.provider?.id === provider.id),
          );
        } catch {}
      }
    }

    let ticket: any = null;
    if (this.ticketRepo) {
      ticket = await this.ticketRepo.findOne({
        where: { student: { id: userId }, razorpayOrderId: orderId },
        order: { createdAt: 'DESC' },
      });
    }

    // Construct clean 3-step timeline: Payment Initiated -> Payment Status -> Mess Card Activated (if success)
    const timeline: any[] = [];

    const initiatedTime = payment.createdAt;
    const statusUpdatedTime = (payment as any).updatedAt || sub?.createdAt || payment.createdAt;
    const messCardActivatedTime = sub?.createdAt || sub?.startDate || payment.createdAt;

    // Step 1: Payment Initiated
    timeline.push({
      event: 'PAYMENT_INITIATED',
      title: 'Payment Initiated',
      description: `Payment order initiated for ₹${Number(payment.amount).toLocaleString('en-IN')}`,
      timestamp: initiatedTime,
      status: 'COMPLETED',
    });

    // Step 2: Payment Status
    if (statusLower === 'paid') {
      timeline.push({
        event: 'PAYMENT_SUCCESS',
        title: 'Payment Successful',
        description: `Payment of ₹${Number(payment.amount).toLocaleString('en-IN')} verified & confirmed`,
        timestamp: statusUpdatedTime,
        status: 'COMPLETED',
      });
    } else if (statusLower === 'failed') {
      timeline.push({
        event: 'PAYMENT_FAILED',
        title: 'Payment Failed',
        description: 'Payment attempt was failed or cancelled',
        timestamp: statusUpdatedTime,
        status: 'FAILED',
      });
    } else if (statusLower === 'refunded') {
      timeline.push({
        event: 'PAYMENT_REFUNDED',
        title: 'Payment Refunded',
        description: 'Payment amount has been refunded',
        timestamp: statusUpdatedTime,
        status: 'REFUNDED',
      });
    } else {
      timeline.push({
        event: 'PAYMENT_PENDING',
        title: 'Payment Pending',
        description: 'Payment verification is in progress',
        timestamp: statusUpdatedTime,
        status: 'PENDING',
      });
    }

    // Step 3: Mess Card Activated (Only if payment is SUCCESS and subscription exists)
    if (statusLower === 'paid' && sub) {
      timeline.push({
        event: 'MESSCARD_ACTIVATED',
        title: 'Mess Card Activated',
        description:
          'Digital QR Mess Card active & ready for daily meal scanning',
        timestamp: messCardActivatedTime,
        status: 'COMPLETED',
      });
    }

    return {
      payment: {
        id: payment.id,
        amount: Number(payment.amount),
        currency: 'INR',
        status: displayStatus,
        rawStatus: payment.status,
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId || null,
        durationDays: payment.durationDays || 30,
        createdAt: payment.createdAt,
        paymentMethod: payment.razorpayPaymentId ? 'Razorpay Online' : 'Online',
      },
      purchaseDetails: {
        mealPlanId: payment.mealPlanId,
        mealPlanTitle: mealPlan?.title || 'Standard Mess Subscription',
        durationDays: payment.durationDays || 30,
        amount: Number(payment.amount),
        providerId: provider?.id || null,
        providerName: provider?.name || 'Mess Provider',
        providerAddress: provider?.address || provider?.city || '',
      },
      subscription: sub
        ? {
            id: sub.id,
            status: sub.status,
            startDate: sub.startDate,
            endDate: sub.endDate,
            messCardAvailable: true,
          }
        : null,
      timeline,
      supportTicket: ticket
        ? {
            id: ticket.id,
            ticketNumber: ticket.ticketNumber,
            status: ticket.status,
            issueType: ticket.issueType,
            description: ticket.description,
            utrReference: ticket.utrReference || null,
            createdAt: ticket.createdAt,
          }
        : null,
    };
  }
}
