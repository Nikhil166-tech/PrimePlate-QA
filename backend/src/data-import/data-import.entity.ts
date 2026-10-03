import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum ImportMode {
  REPLACE = 'REPLACE',
  MERGE = 'MERGE',
}

export enum ImportStatus {
  VALIDATED = 'VALIDATED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
}

@Entity({ name: 'data_imports' })
export class DataImport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  importId: string;

  @Column({ type: 'varchar', length: 128 })
  exportId: string;

  @Column({ type: 'varchar', length: 128, default: 'primeplate-production' })
  source: string;

  @Column({ type: 'varchar', length: 32, default: '1.0' })
  formatVersion: string;

  @Column({ type: 'varchar', length: 32, default: ImportMode.MERGE })
  mode: ImportMode;

  @Column({ type: 'varchar', length: 32, default: ImportStatus.PROCESSING })
  status: ImportStatus;

  @Column({ type: 'varchar', length: 255 })
  initiatedBy: string;

  @Column({ type: 'text', nullable: true })
  recordCountsJson: string; // JSON string of Record<string, number>

  @Column({ type: 'int', default: 0 })
  sanitizedCount: number;

  @Column({ type: 'int', default: 0 })
  insertedCount: number;

  @Column({ type: 'int', default: 0 })
  updatedCount: number;

  @Column({ type: 'int', default: 0 })
  skippedCount: number;

  @Column({ type: 'int', default: 0 })
  conflictCount: number;

  @Column({ type: 'int', default: 0 })
  forbiddenFieldsCount: number;

  @Column({ type: 'text', nullable: true })
  forbiddenFieldsExcludedJson: string; // JSON string of excluded forbidden field summaries

  @Column({ type: 'int', default: 0 })
  warningCount: number;

  @Column({ type: 'text', nullable: true })
  warningsJson: string; // JSON string of warnings

  @Column({ type: 'text', nullable: true })
  errorSummary?: string | null;

  @Column({ default: () => 'CURRENT_TIMESTAMP' })
  startedAt: Date;

  @Column({ nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
