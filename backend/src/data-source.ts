import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;
const useSsl = process.env.DATABASE_SSL === 'true';

export const AppDataSource = new DataSource(
  dbUrl && !dbUrl.includes('PLACEHOLDER')
    ? {
        type: 'postgres',
        url: dbUrl,
        synchronize: false,
        migrationsRun: true,
        logging: true,
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/[0-9]*-*{.ts,.js}'],
        ssl: useSsl ? { rejectUnauthorized: false } : false,
      }
    : {
        type: 'better-sqlite3',
        database: 'dev.sqlite',
        synchronize: false,
        logging: true,
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/migrations/[0-9]*-*{.ts,.js}'],
      },
);
