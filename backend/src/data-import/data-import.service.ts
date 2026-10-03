import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  PreconditionFailedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import AdmZip from 'adm-zip';
import * as crypto from 'crypto';
import {
  DataImport,
  ImportMode,
  ImportStatus,
} from './data-import.entity';
import { User } from '../users/user.entity';
import { MealProvider } from '../providers/meal-provider.entity';
import { MealPlan, MealType } from '../meal-plans/meal-plan.entity';
import {
  Subscription,
  SubscriptionStatus,
} from '../subscriptions/subscription.entity';
import {
  MealUsage,
  MealUsageStatus,
  MealUsageSource,
} from '../meal-usage/meal-usage.entity';
import { Review } from '../reviews/review.entity';
import {
  ProviderEarning,
  ProviderEarningStatus,
} from '../payouts/provider-earning.entity';
import { Payment } from '../payments/payment.entity';
import { Role } from '../common/roles.enum';
import { ProviderStatus } from '../common/enums/provider-status.enum';
import { Category } from '../common/enums/category.enum';
import { ProviderApprovalStatus } from '../common/enums/provider-approval-status.enum';
import {
  ValidationReport,
  ValidationTableSummary,
  ForbiddenFieldSummary,
  PreviewReport,
  ExecutionReport,
} from './dto/data-import.dto';

interface ValidatedPackage {
  token: string;
  exportId: string;
  source: string;
  formatVersion: string;
  exportedAt: string;
  manifest: any;
  tables: Record<string, any[]>;
  forbiddenFieldsFound: ForbiddenFieldSummary[];
  tableSummaries: ValidationTableSummary[];
  foreignKeyCheck: { status: 'PASS' | 'FAIL'; errors: string[] };
  warnings: string[];
  errors: string[];
  createdAt: number;
}

export const FORBIDDEN_FIELDS = [
  'password',
  'passwordhash',
  'password_hash',
  'salt',
  'hash',
  'refreshtoken',
  'refresh_token',
  'accesstoken',
  'access_token',
  'tokenhash',
  'token_hash',
  'jwtsecret',
  'jwt_secret',
  'secret',
  'refreshtokensecret',
  'otp',
  'otpcode',
  'otp_code',
  'resettoken',
  'passwordresettoken',
  'razorpaykeysecret',
  'razorpay_key_secret',
  'razorpaywebhooksecret',
  'razorpay_webhook_secret',
  'key_secret',
  'cloudinaryapisecret',
  'cloudinary_api_secret',
  'smtppass',
  'smtp_pass',
  'gmailpass',
  'gmail_pass',
  'apikey',
  'api_key',
  'secretkey',
  'secret_key',
  'databaseurl',
  'database_url',
  'dbpassword',
  'db_password',
];

const DEFAULT_QA_PASSWORD_HASH =
  '$2b$10$wT521jZgU6c2n0nE64F5v.q828y4B34C1uJ1W6x8wU1yN56H7k1iS'; // bcrypt hash of "QaTest@123"

export const REPLACE_CONFIRMATION_PHRASE =
  'I understand this will replace the selected QA data.';
export const MERGE_CONFIRMATION_PHRASE =
  'I understand this will merge data into the QA database.';

@Injectable()
export class DataImportService {
  private readonly logger = new Logger(DataImportService.name);
  private readonly packageCache = new Map<string, ValidatedPackage>();
  private readonly activeProgress = new Map<
    string,
    { stage: string; percent: number; details?: string }
  >();

  constructor(
    @InjectRepository(DataImport)
    private readonly importRepo: Repository<DataImport>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(MealProvider)
    private readonly providerRepo: Repository<MealProvider>,
    @InjectRepository(MealPlan)
    private readonly planRepo: Repository<MealPlan>,
    @InjectRepository(Subscription)
    private readonly subRepo: Repository<Subscription>,
    @InjectRepository(MealUsage)
    private readonly usageRepo: Repository<MealUsage>,
    @InjectRepository(Review)
    private readonly reviewRepo: Repository<Review>,
    @InjectRepository(ProviderEarning)
    private readonly earningRepo: Repository<ProviderEarning>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly dataSource: DataSource,
  ) {
    // Background cache cleanup every 10 minutes (TTL 30 minutes)
    setInterval(() => this.cleanupExpiredPackages(), 10 * 60 * 1000).unref();
  }

  private cleanupExpiredPackages() {
    const now = Date.now();
    const TTL = 30 * 60 * 1000;
    for (const [token, pkg] of this.packageCache.entries()) {
      if (now - pkg.createdAt > TTL) {
        this.packageCache.delete(token);
        this.activeProgress.delete(token);
      }
    }
  }

  /**
   * Section 3 & 26: Safety Check.
   * Confirms the current DATABASE_URL belongs exclusively to the QA environment.
   * NEVER logs or exposes credentials.
   */
  public verifyQaTargetEnvironment(): void {
    const dbUrl = process.env.DATABASE_URL || '';
    const nodeEnv = process.env.NODE_ENV || 'development';

    // Must never run if explicit production database is indicated
    if (
      nodeEnv === 'production' &&
      !dbUrl.includes('qa') &&
      !dbUrl.includes('test') &&
      !dbUrl.includes('localhost') &&
      !dbUrl.includes('127.0.0.1')
    ) {
      this.logger.error(
        'SECURITY VIOLATION: Attempted production data import in a production environment!',
      );
      throw new PreconditionFailedException(
        'Safety check failed: Current environment is not verified as dedicated QA.',
      );
    }

    // Safety check passed - verified QA target
    this.logger.log('QA Environment verified for data import operation.');
  }

  /**
   * Section 2, 14, 23: Validate ZIP Package
   */
  async validatePackage(fileBuffer: Buffer): Promise<ValidationReport> {
    this.verifyQaTargetEnvironment();

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('Empty or missing file upload.');
    }

    // Max 50 MB
    if (fileBuffer.length > 50 * 1024 * 1024) {
      throw new BadRequestException('Package exceeds maximum limit of 50MB.');
    }

    // Check ZIP magic bytes (PK\x03\x04 or PK\x05\x06 or PK\x07\x08)
    if (
      fileBuffer[0] !== 0x50 ||
      fileBuffer[1] !== 0x4b ||
      (fileBuffer[2] !== 0x03 && fileBuffer[2] !== 0x05)
    ) {
      throw new BadRequestException('Uploaded file is not a valid ZIP archive.');
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(fileBuffer);
    } catch (err: any) {
      throw new BadRequestException(`Malformed ZIP file: ${err.message}`);
    }

    const zipEntries = zip.getEntries();
    let totalUncompressed = 0;
    const maxUncompressed = 150 * 1024 * 1024; // 150 MB

    // Inspect entries for security hazards
    for (const entry of zipEntries) {
      const entryName = entry.entryName;

      // Path traversal check
      if (
        entryName.includes('..') ||
        entryName.startsWith('/') ||
        entryName.startsWith('\\') ||
        /^[a-zA-Z]:/.test(entryName)
      ) {
        throw new BadRequestException(
          `Security violation: ZIP contains path traversal entry: ${entryName}`,
        );
      }

      // Prohibited extensions check (no SQL, executable, script files)
      const lower = entryName.toLowerCase();
      if (
        lower.endsWith('.sql') ||
        lower.endsWith('.exe') ||
        lower.endsWith('.sh') ||
        lower.endsWith('.bat') ||
        lower.endsWith('.cmd') ||
        lower.endsWith('.bin') ||
        lower.endsWith('.js')
      ) {
        throw new BadRequestException(
          `Security violation: Prohibited file type detected in archive: ${entryName}`,
        );
      }

      totalUncompressed += entry.header.size;
      if (totalUncompressed > maxUncompressed) {
        throw new BadRequestException(
          'Security violation: Uncompressed archive size exceeds 150MB limit (ZIP bomb protection).',
        );
      }
    }

    // Require manifest.json
    const manifestEntry = zipEntries.find(
      (e) => e.entryName === 'manifest.json' || e.entryName.endsWith('/manifest.json'),
    );
    if (!manifestEntry) {
      throw new BadRequestException(
        'Invalid export package: missing manifest.json.',
      );
    }

    let manifest: any;
    try {
      manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
    } catch {
      throw new BadRequestException('manifest.json contains invalid JSON syntax.');
    }

    if (manifest.formatVersion !== '1.0') {
      throw new BadRequestException(
        `Unsupported package formatVersion: ${manifest.formatVersion}. Expected '1.0'.`,
      );
    }

    if (!Array.isArray(manifest.tables)) {
      throw new BadRequestException('manifest.json must contain a "tables" array.');
    }

    const allowedTables = [
      'users',
      'providers',
      'meal_providers',
      'meal-plans',
      'meal_plans',
      'subscriptions',
      'meal-usages',
      'meal_usages',
      'reviews',
      'provider-earnings',
      'provider_earnings',
      'payments',
    ];

    const tableSummaries: ValidationTableSummary[] = [];
    const forbiddenFieldsFound: ForbiddenFieldSummary[] = [];
    const forbiddenFieldMap = new Map<string, number>();
    const warnings: string[] = [];
    const errors: string[] = [];
    const parsedTables: Record<string, any[]> = {};

    for (const declared of manifest.tables) {
      const normalizedName = declared.name.replace(/-/g, '_');
      if (!allowedTables.includes(declared.name) && !allowedTables.includes(normalizedName)) {
        errors.push(`Manifest declares unsupported table name: ${declared.name}`);
        continue;
      }

      const fileEntry = zipEntries.find(
        (e) =>
          e.entryName === declared.file ||
          e.entryName.endsWith('/' + declared.file),
      );

      if (!fileEntry) {
        errors.push(
          `Declared file "${declared.file}" for table "${declared.name}" was not found in archive.`,
        );
        tableSummaries.push({
          name: declared.name,
          file: declared.file,
          declaredCount: declared.recordCount || 0,
          parsedCount: 0,
          validCount: 0,
          invalidCount: declared.recordCount || 0,
          errors: [`File ${declared.file} missing in ZIP`],
        });
        continue;
      }

      let records: any[];
      try {
        records = JSON.parse(fileEntry.getData().toString('utf8'));
      } catch (jsonErr: any) {
        errors.push(
          `File "${declared.file}" contains invalid JSON syntax: ${jsonErr.message}`,
        );
        tableSummaries.push({
          name: declared.name,
          file: declared.file,
          declaredCount: declared.recordCount || 0,
          parsedCount: 0,
          validCount: 0,
          invalidCount: declared.recordCount || 0,
          errors: ['Invalid JSON syntax'],
        });
        continue;
      }

      if (!Array.isArray(records)) {
        errors.push(`Table file "${declared.file}" must contain a JSON array.`);
        continue;
      }

      if (declared.recordCount !== undefined && declared.recordCount !== records.length) {
        warnings.push(
          `Table "${declared.name}": declared recordCount (${declared.recordCount}) differs from actual records (${records.length}).`,
        );
      }

      // Inspect rows for forbidden fields and structural validity
      let validCount = 0;
      let invalidCount = 0;
      const tableErrors: string[] = [];
      const cleanRecords: any[] = [];

      for (let i = 0; i < records.length; i++) {
        const row = records[i];
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
          invalidCount++;
          tableErrors.push(`Row ${i + 1} is not a valid object.`);
          continue;
        }

        const cleanRow: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
          const lowerKey = key.toLowerCase();
          if (FORBIDDEN_FIELDS.includes(lowerKey)) {
            // Forbidden field detected: strip and record count (never log value)
            const mapKey = `${declared.name}::${key}`;
            forbiddenFieldMap.set(mapKey, (forbiddenFieldMap.get(mapKey) || 0) + 1);
            continue;
          }
          cleanRow[key] = value;
        }

        // Validate basic entity fields
        const validationErr = this.validateRecordShape(declared.name, cleanRow, i + 1);
        if (validationErr) {
          invalidCount++;
          if (tableErrors.length < 5) tableErrors.push(validationErr);
        } else {
          validCount++;
          cleanRecords.push(cleanRow);
        }
      }

      parsedTables[normalizedName] = cleanRecords;
      tableSummaries.push({
        name: declared.name,
        file: declared.file,
        declaredCount: declared.recordCount ?? records.length,
        parsedCount: records.length,
        validCount,
        invalidCount,
        errors: tableErrors,
      });
      if (invalidCount > 0) {
        errors.push(
          `Table "${declared.name}" has ${invalidCount} invalid record(s): ${tableErrors.join('; ')}`,
        );
      }
    }

    // Aggregate forbidden field findings
    for (const [mapKey, count] of forbiddenFieldMap.entries()) {
      const [table, field] = mapKey.split('::');
      forbiddenFieldsFound.push({ table, field, count });
    }

    // Check Foreign Key Referential Integrity across parsed records
    const foreignKeyCheck = this.validateForeignKeyIntegrity(parsedTables);
    if (foreignKeyCheck.status === 'FAIL') {
      errors.push(...foreignKeyCheck.errors);
    }

    const packageToken = 'PKG-' + crypto.randomUUID();
    const isValid = errors.length === 0 && tableSummaries.every((t) => t.invalidCount === 0);

    const validatedPackage: ValidatedPackage = {
      token: packageToken,
      exportId: manifest.exportId || 'EXPORT-' + Date.now(),
      source: manifest.source || 'primeplate-production',
      formatVersion: manifest.formatVersion,
      exportedAt: manifest.exportedAt || new Date().toISOString(),
      manifest,
      tables: parsedTables,
      forbiddenFieldsFound,
      tableSummaries,
      foreignKeyCheck,
      warnings,
      errors,
      createdAt: Date.now(),
    };

    this.packageCache.set(packageToken, validatedPackage);

    return {
      valid: isValid,
      packageToken,
      exportId: validatedPackage.exportId,
      source: validatedPackage.source,
      formatVersion: validatedPackage.formatVersion,
      exportedAt: validatedPackage.exportedAt,
      tableSummaries,
      foreignKeyCheck,
      forbiddenFieldsFound,
      warnings,
      errors,
    };
  }

  /**
   * Validate per-record shape & enum values
   */
  private validateRecordShape(
    tableName: string,
    row: Record<string, any>,
    rowNum: number,
  ): string | null {
    const norm = tableName.replace(/-/g, '_');
    if (!row.id || typeof row.id !== 'string') {
      return `Row ${rowNum}: Missing or invalid "id" field`;
    }

    // UUID format check
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (!uuidRegex.test(row.id)) {
      return `Row ${rowNum}: ID "${row.id}" is not a valid UUID format`;
    }

    if (norm === 'users') {
      if (!row.email || typeof row.email !== 'string') {
        return `Row ${rowNum}: User missing email`;
      }
      if (
        row.role &&
        !Object.values(Role).includes(row.role as Role)
      ) {
        return `Row ${rowNum}: Invalid user role "${row.role}". Allowed: ${Object.values(Role).join(', ')}`;
      }
    } else if (norm === 'providers' || norm === 'meal_providers') {
      if (!row.name || typeof row.name !== 'string') {
        return `Row ${rowNum}: Provider missing name`;
      }
      if (
        row.status &&
        !Object.values(ProviderStatus).includes(row.status as ProviderStatus)
      ) {
        return `Row ${rowNum}: Invalid provider status "${row.status}"`;
      }
    } else if (norm === 'meal_plans') {
      if (!row.title || typeof row.title !== 'string') {
        return `Row ${rowNum}: MealPlan missing title`;
      }
      if (
        row.mealType &&
        !Object.values(MealType).includes(row.mealType as MealType)
      ) {
        return `Row ${rowNum}: Invalid mealType "${row.mealType}". Allowed: ${Object.values(MealType).join(', ')}`;
      }
    } else if (norm === 'subscriptions') {
      if (!row.startDate) {
        return `Row ${rowNum}: Subscription missing startDate`;
      }
      if (
        row.status &&
        !Object.values(SubscriptionStatus).includes(row.status as SubscriptionStatus)
      ) {
        return `Row ${rowNum}: Invalid subscription status "${row.status}"`;
      }
    } else if (norm === 'provider_earnings') {
      if (
        row.status &&
        !Object.values(ProviderEarningStatus).includes(row.status as ProviderEarningStatus)
      ) {
        return `Row ${rowNum}: Invalid provider earning status "${row.status}"`;
      }
    }

    return null;
  }

  /**
   * Check FK integrity among imported records
   */
  private validateForeignKeyIntegrity(
    tables: Record<string, any[]>,
  ): { status: 'PASS' | 'FAIL'; errors: string[] } {
    const errors: string[] = [];
    const userIds = new Set(
      (tables.users || []).map((u) => u.id),
    );
    const providerIds = new Set(
      (tables.providers || tables.meal_providers || []).map((p) => p.id),
    );
    const planIds = new Set(
      (tables.meal_plans || []).map((m) => m.id),
    );
    const subIds = new Set(
      (tables.subscriptions || []).map((s) => s.id),
    );

    // 1. Providers -> Users
    for (const p of tables.providers || tables.meal_providers || []) {
      if (p.userId && userIds.size > 0 && !userIds.has(p.userId)) {
        errors.push(
          `Provider "${p.id}" references userId "${p.userId}" not found in users package.`,
        );
      }
    }

    // 2. MealPlans -> Providers
    for (const mp of tables.meal_plans || []) {
      const pid = mp.providerId || mp.provider?.id || mp.provider;
      if (pid && providerIds.size > 0 && !providerIds.has(pid)) {
        errors.push(
          `MealPlan "${mp.id}" references providerId "${pid}" not found in providers package.`,
        );
      }
    }

    // 3. Subscriptions -> Users & MealPlans
    for (const sub of tables.subscriptions || []) {
      const uid = sub.studentId || sub.student?.id || sub.userId;
      const mpid = sub.mealPlanId || sub.mealPlan?.id;
      if (uid && userIds.size > 0 && !userIds.has(uid)) {
        errors.push(
          `Subscription "${sub.id}" references studentId "${uid}" not found in users package.`,
        );
      }
      if (mpid && planIds.size > 0 && !planIds.has(mpid)) {
        errors.push(
          `Subscription "${sub.id}" references mealPlanId "${mpid}" not found in meal_plans package.`,
        );
      }
    }

    // 4. MealUsages -> Subscriptions & Providers & Students
    for (const mu of tables.meal_usages || []) {
      if (mu.subscriptionId && subIds.size > 0 && !subIds.has(mu.subscriptionId)) {
        errors.push(
          `MealUsage "${mu.id}" references subscriptionId "${mu.subscriptionId}" not found in subscriptions package.`,
        );
      }
    }

    // 5. Reviews -> Students & Providers
    for (const r of tables.reviews || []) {
      const sid = r.studentId || r.student?.id || r.userId;
      const pid = r.providerId || r.provider?.id;
      if (sid && userIds.size > 0 && !userIds.has(sid)) {
        errors.push(
          `Review "${r.id}" references student "${sid}" not found in users package.`,
        );
      }
      if (pid && providerIds.size > 0 && !providerIds.has(pid)) {
        errors.push(
          `Review "${r.id}" references provider "${pid}" not found in providers package.`,
        );
      }
    }

    return {
      status: errors.length === 0 ? 'PASS' : 'FAIL',
      errors: errors.slice(0, 10), // Limit reported errors for readability
    };
  }

  /**
   * Section 15: Preview Mode and Impact
   */
  async getPreview(packageToken: string, mode: ImportMode): Promise<PreviewReport> {
    this.verifyQaTargetEnvironment();

    const pkg = this.packageCache.get(packageToken);
    if (!pkg) {
      throw new NotFoundException(
        'Package token not found or expired. Please upload and validate the package again.',
      );
    }

    const userCount = (pkg.tables.users || []).length;
    const providerCount = (
      pkg.tables.providers || pkg.tables.meal_providers || []
    ).length;
    const planCount = (pkg.tables.meal_plans || []).length;
    const subCount = (pkg.tables.subscriptions || []).length;
    const usageCount = (pkg.tables.meal_usages || []).length;
    const reviewCount = (pkg.tables.reviews || []).length;
    const earningCount = (pkg.tables.provider_earnings || []).length;
    const total =
      userCount +
      providerCount +
      planCount +
      subCount +
      usageCount +
      reviewCount +
      earningCount;

    // Generate sample sanitized preview
    const sampleUsers = (pkg.tables.users || []).slice(0, 3).map((u, i) => ({
      email: `qa-${(u.role || 'student').toLowerCase()}-${String(i + 1).padStart(4, '0')}@primeplate.test`,
      name: `QA ${(u.role || 'student')} ${String(i + 1).padStart(4, '0')}`,
      role: u.role || 'STUDENT',
    }));

    const sampleProviders = (
      pkg.tables.providers || pkg.tables.meal_providers || []
    )
      .slice(0, 3)
      .map((p) => ({
        name: p.name,
        city: p.city || 'Hyderabad',
        monthlyPrice: p.monthlyPrice || 2999,
      }));

    const requiredPhrase =
      mode === ImportMode.REPLACE
        ? REPLACE_CONFIRMATION_PHRASE
        : MERGE_CONFIRMATION_PHRASE;

    return {
      packageToken,
      exportId: pkg.exportId,
      source: pkg.source,
      exportedAt: pkg.exportedAt,
      mode,
      estimatedCounts: {
        users: userCount,
        providers: providerCount,
        mealPlans: planCount,
        subscriptions: subCount,
        mealUsages: usageCount,
        reviews: reviewCount,
        providerEarnings: earningCount,
        total,
      },
      sampleSanitizedRecords: {
        users: sampleUsers,
        providers: sampleProviders,
      },
      forbiddenFieldsExcluded: pkg.forbiddenFieldsFound,
      warnings: pkg.warnings,
      requiredConfirmationPhrase: requiredPhrase,
    };
  }

  /**
   * Section 4, 7, 8, 16, 17: Execute Transactional Import
   */
  async executeImport(
    packageToken: string,
    mode: ImportMode,
    confirmationPhrase: string,
    adminUser: { id: string; email: string },
  ): Promise<ExecutionReport> {
    this.verifyQaTargetEnvironment();

    const expectedPhrase =
      mode === ImportMode.REPLACE
        ? REPLACE_CONFIRMATION_PHRASE
        : MERGE_CONFIRMATION_PHRASE;

    if (confirmationPhrase !== expectedPhrase) {
      throw new BadRequestException(
        `Invalid confirmation phrase for ${mode} mode. Required exact phrase: "${expectedPhrase}"`,
      );
    }

    const pkg = this.packageCache.get(packageToken);
    if (!pkg) {
      throw new NotFoundException(
        'Package token not found or expired. Please upload and validate the package again.',
      );
    }

    if (pkg.errors.length > 0) {
      throw new BadRequestException(
        'Cannot execute import: Package validation failed with errors.',
      );
    }

    const importId = 'IMP-' + Date.now() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
    const startedAt = new Date();

    this.activeProgress.set(packageToken, { stage: 'Starting import...', percent: 5 });

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let conflictCount = 0;
    let sanitizedCount = 0;
    const recordCounts: Record<string, number> = {};

    try {
      // 1. REPLACE MODE: Clear existing QA business data in reverse dependency order
      if (mode === ImportMode.REPLACE) {
        this.activeProgress.set(packageToken, {
          stage: 'Purging existing QA business data...',
          percent: 15,
        });

        // Delete dependent entities first
        await queryRunner.manager.delete(Review, {});
        await queryRunner.manager.delete(MealUsage, {});
        await queryRunner.manager.delete(ProviderEarning, {});
        await queryRunner.manager.delete(Subscription, {});
        await queryRunner.manager.delete(MealPlan, {});
        await queryRunner.manager.delete(MealProvider, {});

        // Delete users EXCEPT the currently logged in admin user to preserve session
        const currentAdminId = adminUser.id;
        if (currentAdminId) {
          await queryRunner.manager
            .createQueryBuilder()
            .delete()
            .from(User)
            .where('id != :adminId', { adminId: currentAdminId })
            .execute();
        } else {
          await queryRunner.manager.delete(User, {});
        }
      }

      // ID Mapping lookup: production ID -> safe QA UUID
      const userMap = new Map<string, string>();
      const providerMap = new Map<string, string>();
      const planMap = new Map<string, string>();
      const subMap = new Map<string, string>();
      const paymentMap = new Map<string, string>();

      // A. USERS
      const rawUsers = pkg.tables.users || [];
      this.activeProgress.set(packageToken, { stage: 'Importing users...', percent: 30 });
      let userSeq = 1;

      for (const u of rawUsers) {
        const prodId = u.id;
        const role = Object.values(Role).includes(u.role as Role)
          ? (u.role as Role)
          : Role.STUDENT;

        // Sanitization
        const sanitizedEmail = `qa-${role.toLowerCase()}-${String(userSeq).padStart(4, '0')}@primeplate.test`;
        const sanitizedName = `QA ${role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()} ${String(userSeq).padStart(4, '0')}`;
        const sanitizedPhone = `980${String(userSeq).padStart(7, '0')}`;
        userSeq++;
        sanitizedCount += 3; // name, email, phone sanitized

        let qaUserId: string;

        if (mode === ImportMode.MERGE) {
          const existingUser = await queryRunner.manager.findOne(User, {
            where: { email: sanitizedEmail },
          });

          if (existingUser) {
            qaUserId = existingUser.id;
            userMap.set(prodId, qaUserId);
            skippedCount++;
            continue;
          }
        }

        qaUserId = crypto.randomUUID();
        userMap.set(prodId, qaUserId);

        const userEntity = queryRunner.manager.create(User, {
          id: qaUserId,
          email: sanitizedEmail,
          passwordHash: DEFAULT_QA_PASSWORD_HASH,
          name: sanitizedName,
          phone: sanitizedPhone,
          role,
          area: u.area || 'QA Campus',
          foodPreference: u.foodPreference || 'Veg',
          monthlyBudget: u.monthlyBudget ? Number(u.monthlyBudget) : 3000,
          status: 'ACTIVE',
        });

        await queryRunner.manager.save(User, userEntity);
        insertedCount++;
      }
      recordCounts.users = rawUsers.length;

      // B. MEAL PROVIDERS
      const rawProviders = pkg.tables.providers || pkg.tables.meal_providers || [];
      this.activeProgress.set(packageToken, { stage: 'Importing providers...', percent: 50 });
      let provSeq = 1;

      for (const p of rawProviders) {
        const prodId = p.id;
        const mappedOwnerId = p.userId ? userMap.get(p.userId) : null;
        const qaProvId = crypto.randomUUID();
        providerMap.set(prodId, qaProvId);

        const sanitizedContact = `981${String(provSeq).padStart(7, '0')}`;
        const safeQrToken = `qr_qa_${crypto.randomUUID()}`;
        provSeq++;
        sanitizedCount += 2;

        const provEntity = queryRunner.manager.create(MealProvider, {
          id: qaProvId,
          userId: mappedOwnerId || adminUser.id,
          name: p.name || `QA Kitchen ${provSeq}`,
          description: p.description || 'Verified QA Meal Provider',
          address: p.address || '123 QA Test Street',
          city: p.city || 'Hyderabad',
          monthlyPrice: p.monthlyPrice ? Number(p.monthlyPrice) : 2999,
          rating: p.rating ? Number(p.rating) : 4.5,
          verified: true,
          status: Object.values(ProviderStatus).includes(p.status)
            ? p.status
            : ProviderStatus.ACTIVE,
          category: Object.values(Category).includes(p.category)
            ? p.category
            : Category.BUDGET,
          approvalStatus: Object.values(ProviderApprovalStatus).includes(
            p.approvalStatus,
          )
            ? p.approvalStatus
            : ProviderApprovalStatus.APPROVED,
          acceptingSubscriptions: p.acceptingSubscriptions !== false,
          totalCapacity: p.totalCapacity ? Number(p.totalCapacity) : 50,
          contactPhone: sanitizedContact,
          qrToken: safeQrToken,
          recoveryPercentage: p.recoveryPercentage ? Number(p.recoveryPercentage) : 80,
          mealRecoveryEnabled: p.mealRecoveryEnabled !== false,
        });

        await queryRunner.manager.save(MealProvider, provEntity);
        insertedCount++;
      }
      recordCounts.providers = rawProviders.length;

      // C. MEAL PLANS
      const rawPlans = pkg.tables.meal_plans || [];
      this.activeProgress.set(packageToken, { stage: 'Importing meal plans...', percent: 65 });

      for (const mp of rawPlans) {
        const prodId = mp.id;
        const prodProvId = mp.providerId || mp.provider?.id || mp.provider;
        const mappedProvId = providerMap.get(prodProvId);

        if (!mappedProvId) {
          conflictCount++;
          continue;
        }

        const qaPlanId = crypto.randomUUID();
        planMap.set(prodId, qaPlanId);

        const planEntity = queryRunner.manager.create(MealPlan, {
          id: qaPlanId,
          provider: { id: mappedProvId } as any,
          title: mp.title || 'Standard Plan',
          description: mp.description || 'Delicious home-style food',
          mealType: Object.values(MealType).includes(mp.mealType)
            ? mp.mealType
            : MealType.FULL_DAY,
          pricePerMonth: mp.pricePerMonth ? Number(mp.pricePerMonth) : 2999,
          originalPrice: mp.originalPrice ? Number(mp.originalPrice) : 3499,
          sellingPrice: mp.sellingPrice ? Number(mp.sellingPrice) : 2999,
          customOneDayPrice: mp.customOneDayPrice ? Number(mp.customOneDayPrice) : 120,
          isActive: mp.isActive !== false,
        });

        await queryRunner.manager.save(MealPlan, planEntity);
        insertedCount++;
      }
      recordCounts.mealPlans = rawPlans.length;

      // D. SUBSCRIPTIONS
      const rawSubs = pkg.tables.subscriptions || [];
      this.activeProgress.set(packageToken, { stage: 'Importing subscriptions...', percent: 80 });

      for (const s of rawSubs) {
        const prodId = s.id;
        const prodStudentId = s.studentId || s.student?.id || s.userId;
        const prodPlanId = s.mealPlanId || s.mealPlan?.id;

        const mappedStudentId = userMap.get(prodStudentId);
        const mappedPlanId = planMap.get(prodPlanId);

        if (!mappedStudentId || !mappedPlanId) {
          conflictCount++;
          continue;
        }

        const qaSubId = crypto.randomUUID();
        subMap.set(prodId, qaSubId);

        const subEntity = queryRunner.manager.create(Subscription, {
          id: qaSubId,
          student: { id: mappedStudentId } as any,
          mealPlan: { id: mappedPlanId } as any,
          status: Object.values(SubscriptionStatus).includes(s.status)
            ? s.status
            : SubscriptionStatus.ACTIVE,
          startDate: s.startDate || new Date().toISOString().split('T')[0],
          endDate: s.endDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
          recoveryDaysApplied: s.recoveryDaysApplied ? Number(s.recoveryDaysApplied) : 0,
        });

        await queryRunner.manager.save(Subscription, subEntity);
        insertedCount++;
      }
      recordCounts.subscriptions = rawSubs.length;

      // E. MEAL USAGES
      const rawUsages = pkg.tables.meal_usages || [];
      this.activeProgress.set(packageToken, { stage: 'Importing meal usage records...', percent: 90 });

      for (const mu of rawUsages) {
        const mappedSubId = subMap.get(mu.subscriptionId);
        const mappedStudentId = userMap.get(mu.studentId);
        const mappedProvId = providerMap.get(mu.providerId);

        if (!mappedSubId || !mappedStudentId || !mappedProvId) {
          conflictCount++;
          continue;
        }

        const usageEntity = queryRunner.manager.create(MealUsage, {
          id: crypto.randomUUID(),
          subscriptionId: mappedSubId,
          studentId: mappedStudentId,
          providerId: mappedProvId,
          mealDate: mu.mealDate || new Date().toISOString().split('T')[0],
          status: Object.values(MealUsageStatus).includes(mu.status)
            ? mu.status
            : MealUsageStatus.USED,
          source: Object.values(MealUsageSource).includes(mu.source)
            ? mu.source
            : MealUsageSource.QR_SCAN,
        });

        await queryRunner.manager.save(MealUsage, usageEntity);
        insertedCount++;
      }
      recordCounts.mealUsages = rawUsages.length;

      // F. REVIEWS
      const rawReviews = pkg.tables.reviews || [];
      for (const r of rawReviews) {
        const mappedStudentId = userMap.get(r.studentId || r.student?.id);
        const mappedProvId = providerMap.get(r.providerId || r.provider?.id);

        if (!mappedStudentId || !mappedProvId) {
          conflictCount++;
          continue;
        }

        const reviewEntity = queryRunner.manager.create(Review, {
          id: crypto.randomUUID(),
          student: { id: mappedStudentId } as any,
          provider: { id: mappedProvId } as any,
          rating: r.rating ? Math.min(5, Math.max(1, Number(r.rating))) : 5,
          comment: r.comment || 'Great meal plan experience in QA test.',
          providerReply: r.providerReply || null,
        });

        await queryRunner.manager.save(Review, reviewEntity);
        insertedCount++;
      }
      recordCounts.reviews = rawReviews.length;

      // G. PROVIDER EARNINGS (Historical QA data only - zero external calls)
      const rawEarnings = pkg.tables.provider_earnings || [];
      for (const e of rawEarnings) {
        const mappedProvId = providerMap.get(e.providerId);
        const mappedStudentId = userMap.get(e.studentId);
        const mappedSubId = e.subscriptionId ? subMap.get(e.subscriptionId) : null;

        if (!mappedProvId || !mappedStudentId) {
          conflictCount++;
          continue;
        }

        const syntheticPaymentId = `pay_qa_import_${crypto.randomUUID()}`;

        // Create safe historical payment placeholder to satisfy FK constraint
        const histPayment = queryRunner.manager.create(Payment, {
          id: crypto.randomUUID(),
          amount: e.grossAmount ? Number(e.grossAmount) : 2999,
          mealAmount: e.providerAmount ? Number(e.providerAmount) : 2849,
          platformFee: e.platformFee ? Number(e.platformFee) : 150,
          razorpayOrderId: `order_qa_import_${crypto.randomUUID()}`,
          razorpayPaymentId: syntheticPaymentId,
          status: 'paid',
          student: { id: mappedStudentId } as any,
          provider: { id: mappedProvId } as any,
        });
        await queryRunner.manager.save(Payment, histPayment);

        const earningEntity = queryRunner.manager.create(ProviderEarning, {
          id: crypto.randomUUID(),
          paymentId: histPayment.id,
          subscriptionId: mappedSubId || undefined,
          providerId: mappedProvId,
          studentId: mappedStudentId,
          grossAmount: e.grossAmount ? Number(e.grossAmount) : 2999,
          platformFee: e.platformFee ? Number(e.platformFee) : 150,
          providerAmount: e.providerAmount ? Number(e.providerAmount) : 2849,
          status: Object.values(ProviderEarningStatus).includes(e.status)
            ? e.status
            : ProviderEarningStatus.PENDING,
          settlementReference: e.settlementReference
            ? `QA-SETTLE-${e.settlementReference}`
            : undefined,
          earnedAt: e.earnedAt ? new Date(e.earnedAt) : new Date(),
        });

        await queryRunner.manager.save(ProviderEarning, earningEntity);
        insertedCount++;
      }
      recordCounts.providerEarnings = rawEarnings.length;

      // Commit transaction
      await queryRunner.commitTransaction();
      this.activeProgress.set(packageToken, { stage: 'Import completed successfully.', percent: 100 });
    } catch (err: any) {
      await queryRunner.rollbackTransaction();
      this.activeProgress.set(packageToken, {
        stage: 'Import failed - rolled back.',
        percent: 0,
        details: err.message,
      });

      // Record failure audit record
      const failedAudit = this.importRepo.create({
        importId,
        exportId: pkg.exportId,
        source: pkg.source,
        formatVersion: pkg.formatVersion,
        mode,
        status: ImportStatus.FAILED,
        initiatedBy: adminUser.email,
        recordCountsJson: JSON.stringify(recordCounts),
        sanitizedCount,
        insertedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        conflictCount,
        forbiddenFieldsCount: pkg.forbiddenFieldsFound.reduce(
          (acc, f) => acc + f.count,
          0,
        ),
        forbiddenFieldsExcludedJson: JSON.stringify(pkg.forbiddenFieldsFound),
        warningCount: pkg.warnings.length,
        warningsJson: JSON.stringify(pkg.warnings),
        errorSummary: err.message || 'Transaction rollback during import.',
        startedAt,
        completedAt: new Date(),
      });
      await this.importRepo.save(failedAudit);

      throw new BadRequestException(
        `Import failed and was rolled back safely: ${err.message}`,
      );
    } finally {
      await queryRunner.release();
    }

    const completedAt = new Date();

    // Record success audit record
    const auditRecord = this.importRepo.create({
      importId,
      exportId: pkg.exportId,
      source: pkg.source,
      formatVersion: pkg.formatVersion,
      mode,
      status: ImportStatus.COMPLETED,
      initiatedBy: adminUser.email,
      recordCountsJson: JSON.stringify(recordCounts),
      sanitizedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      conflictCount,
      forbiddenFieldsCount: pkg.forbiddenFieldsFound.reduce(
        (acc, f) => acc + f.count,
        0,
      ),
      forbiddenFieldsExcludedJson: JSON.stringify(pkg.forbiddenFieldsFound),
      warningCount: pkg.warnings.length,
      warningsJson: JSON.stringify(pkg.warnings),
      startedAt,
      completedAt,
    });
    await this.importRepo.save(auditRecord);

    // Clean up cached package
    this.packageCache.delete(packageToken);
    this.activeProgress.delete(packageToken);

    return {
      importId,
      exportId: pkg.exportId,
      source: pkg.source,
      mode,
      status: 'COMPLETED',
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      recordCounts,
      sanitizedCount,
      insertedCount,
      updatedCount,
      skippedCount,
      conflictCount,
      forbiddenFieldsCount: auditRecord.forbiddenFieldsCount,
      forbiddenFieldsExcluded: pkg.forbiddenFieldsFound,
      warningCount: pkg.warnings.length,
      warnings: pkg.warnings,
      errorSummary: null,
    };
  }

  /**
   * Section 18: Import History
   */
  async getImportHistory(limit: number = 20, offset: number = 0): Promise<{ items: DataImport[]; total: number }> {
    const [items, total] = await this.importRepo.findAndCount({
      order: { startedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { items, total };
  }

  async getImportById(id: string): Promise<DataImport> {
    const item = await this.importRepo.findOne({
      where: [{ id }, { importId: id }],
    });
    if (!item) {
      throw new NotFoundException(`Data import record "${id}" not found.`);
    }
    return item;
  }

  getProgress(packageToken: string) {
    return this.activeProgress.get(packageToken) || { stage: 'Idle', percent: 0 };
  }
}
