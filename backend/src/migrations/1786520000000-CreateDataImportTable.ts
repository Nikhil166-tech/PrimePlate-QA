import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDataImportTable1786520000000 implements MigrationInterface {
  name = 'CreateDataImportTable1786520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const isPostgres = queryRunner.connection.options.type === 'postgres';

    if (isPostgres) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "data_imports" (
          "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          "importId" varchar(64) NOT NULL UNIQUE,
          "exportId" varchar(128) NOT NULL,
          "source" varchar(128) NOT NULL DEFAULT 'primeplate-production',
          "formatVersion" varchar(32) NOT NULL DEFAULT '1.0',
          "mode" varchar(32) NOT NULL DEFAULT 'MERGE',
          "status" varchar(32) NOT NULL DEFAULT 'PROCESSING',
          "initiatedBy" varchar(255) NOT NULL,
          "recordCountsJson" text,
          "sanitizedCount" int NOT NULL DEFAULT 0,
          "insertedCount" int NOT NULL DEFAULT 0,
          "updatedCount" int NOT NULL DEFAULT 0,
          "skippedCount" int NOT NULL DEFAULT 0,
          "conflictCount" int NOT NULL DEFAULT 0,
          "forbiddenFieldsCount" int NOT NULL DEFAULT 0,
          "forbiddenFieldsExcludedJson" text,
          "warningCount" int NOT NULL DEFAULT 0,
          "warningsJson" text,
          "errorSummary" text,
          "startedAt" TIMESTAMP NOT NULL DEFAULT now(),
          "completedAt" TIMESTAMP,
          "createdAt" TIMESTAMP NOT NULL DEFAULT now()
        );
      `);

      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "IDX_data_imports_importId"
        ON "data_imports" ("importId");
      `);
    } else {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "data_imports" (
          "id" varchar PRIMARY KEY,
          "importId" varchar(64) NOT NULL UNIQUE,
          "exportId" varchar(128) NOT NULL,
          "source" varchar(128) NOT NULL DEFAULT 'primeplate-production',
          "formatVersion" varchar(32) NOT NULL DEFAULT '1.0',
          "mode" varchar(32) NOT NULL DEFAULT 'MERGE',
          "status" varchar(32) NOT NULL DEFAULT 'PROCESSING',
          "initiatedBy" varchar(255) NOT NULL,
          "recordCountsJson" text,
          "sanitizedCount" integer NOT NULL DEFAULT 0,
          "insertedCount" integer NOT NULL DEFAULT 0,
          "updatedCount" integer NOT NULL DEFAULT 0,
          "skippedCount" integer NOT NULL DEFAULT 0,
          "conflictCount" integer NOT NULL DEFAULT 0,
          "forbiddenFieldsCount" integer NOT NULL DEFAULT 0,
          "forbiddenFieldsExcludedJson" text,
          "warningCount" integer NOT NULL DEFAULT 0,
          "warningsJson" text,
          "errorSummary" text,
          "startedAt" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "completedAt" datetime,
          "createdAt" datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await queryRunner.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS "IDX_data_imports_importId"
        ON "data_imports" ("importId");
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "data_imports";`);
  }
}
