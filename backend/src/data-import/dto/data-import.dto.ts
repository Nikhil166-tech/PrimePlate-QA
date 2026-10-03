import { IsString, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { ImportMode } from '../data-import.entity';

export class PreviewImportDto {
  @IsString()
  @IsNotEmpty()
  packageToken: string;

  @IsEnum(ImportMode)
  mode: ImportMode;
}

export class ExecuteImportDto {
  @IsString()
  @IsNotEmpty()
  packageToken: string;

  @IsEnum(ImportMode)
  mode: ImportMode;

  @IsString()
  @IsNotEmpty()
  confirmationPhrase: string;
}

export interface ValidationTableSummary {
  name: string;
  file: string;
  declaredCount: number;
  parsedCount: number;
  validCount: number;
  invalidCount: number;
  errors: string[];
}

export interface ForbiddenFieldSummary {
  table: string;
  field: string;
  count: number;
}

export interface ValidationReport {
  valid: boolean;
  packageToken: string;
  exportId: string;
  source: string;
  formatVersion: string;
  exportedAt: string;
  tableSummaries: ValidationTableSummary[];
  foreignKeyCheck: {
    status: 'PASS' | 'FAIL';
    errors: string[];
  };
  forbiddenFieldsFound: ForbiddenFieldSummary[];
  warnings: string[];
  errors: string[];
}

export interface PreviewReport {
  packageToken: string;
  exportId: string;
  source: string;
  exportedAt: string;
  mode: ImportMode;
  estimatedCounts: {
    users: number;
    providers: number;
    mealPlans: number;
    subscriptions: number;
    mealUsages: number;
    reviews: number;
    providerEarnings: number;
    total: number;
  };
  sampleSanitizedRecords: {
    users?: Array<{ email: string; name: string; role: string }>;
    providers?: Array<{ name: string; city?: string; monthlyPrice?: number }>;
  };
  forbiddenFieldsExcluded: ForbiddenFieldSummary[];
  warnings: string[];
  requiredConfirmationPhrase: string;
}

export interface ExecutionReport {
  importId: string;
  exportId: string;
  source: string;
  mode: ImportMode;
  status: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  recordCounts: Record<string, number>;
  sanitizedCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  conflictCount: number;
  forbiddenFieldsCount: number;
  forbiddenFieldsExcluded: ForbiddenFieldSummary[];
  warningCount: number;
  warnings: string[];
  errorSummary?: string | null;
}
