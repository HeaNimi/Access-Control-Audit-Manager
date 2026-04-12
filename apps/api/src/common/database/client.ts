import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';

import type { DatabaseSchema } from './schema';

pg.types.setTypeParser(20, (value) => Number(value));

export function createPgPool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
  });
}

export function createKyselyDb(
  connectionString: string,
): Kysely<DatabaseSchema> {
  const db = new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({
      pool: createPgPool(connectionString),
    }),
  });

  return db.withSchema('acma_schema');
}
