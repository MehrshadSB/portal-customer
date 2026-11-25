import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { Pool } from 'pg';

config({ path: resolve(process.cwd(), '.env') });
config({ path: resolve(process.cwd(), '../../.env') });

async function runMigrations(): Promise<void> {
  const connectionString =
    process.env.DATABASE_URL ?? 'postgresql://portal:portal_dev_password@localhost:5433/portal_dev';
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  try {
    const migrationsFolder = resolve(__dirname, 'migrations');
    await migrate(db, { migrationsFolder });
    console.log('Database migrations applied successfully.');
  } finally {
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
