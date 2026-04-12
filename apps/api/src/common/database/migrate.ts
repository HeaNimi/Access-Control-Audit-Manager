import fs from 'node:fs/promises';
import path from 'node:path';

import pg from 'pg';

export type MigrationResult = {
  applied: string[];
  skipped: string[];
};

export type RunMigrationsOptions = {
  connectionString: string;
  migrationsDir?: string;
  log?: (message: string) => void;
};

async function ensureMigrationTable(client: pg.PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrations(
  client: pg.PoolClient,
): Promise<Set<string>> {
  const result = await client.query<{ filename: string }>(
    'SELECT filename FROM public.schema_migrations ORDER BY filename',
  );

  return new Set(result.rows.map((row) => row.filename));
}

export async function runMigrations(
  options: RunMigrationsOptions,
): Promise<MigrationResult> {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
  });

  const client = await pool.connect();
  const result: MigrationResult = {
    applied: [],
    skipped: [],
  };

  try {
    await ensureMigrationTable(client);
    const applied = await getAppliedMigrations(client);
    const migrationsDir =
      options.migrationsDir ?? path.resolve(__dirname, 'migrations');
    const entries = await fs.readdir(migrationsDir);
    const migrationFiles = entries
      .filter((entry) => entry.endsWith('.sql'))
      .sort();

    for (const filename of migrationFiles) {
      if (applied.has(filename)) {
        result.skipped.push(filename);
        continue;
      }

      const sql = await fs.readFile(path.join(migrationsDir, filename), 'utf8');

      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO public.schema_migrations (filename) VALUES ($1)',
        [filename],
      );
      await client.query('COMMIT');
      result.applied.push(filename);
      options.log?.(`Applied migration ${filename}`);
    }

    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
