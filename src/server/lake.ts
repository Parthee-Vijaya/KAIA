import { PostgresLakeAdapter, type SqlExecutor } from '@/integrations/lake';
import { sql } from './db';
import type { Sql, TransactionSql } from 'postgres';
/** postgres.js serializes inferred JSONB parameters itself; normalize pre-encoded generic SQL JSON values once. */
export function postgresLakeExecutor(client: Sql | TransactionSql = sql()): SqlExecutor {
  return {
    query: async <T extends Record<string, unknown>>(query: string, values: unknown[]) => {
      const params = values.map((value, i) =>
        typeof value === 'string' && new RegExp(`\\$${i + 1}::jsonb\\b`).test(query)
          ? JSON.parse(value)
          : value,
      );
      return (await client.unsafe(query, params as never[])) as unknown as T[];
    },
    transaction: async <T>(work: (tx: SqlExecutor) => Promise<T>) => {
      if ('begin' in client)
        return (await client.begin(async (tx) => work(postgresLakeExecutor(tx)))) as T;
      return (await client.savepoint(async (tx) => work(postgresLakeExecutor(tx)))) as T;
    },
  };
}
export function postgresLake() {
  return new PostgresLakeAdapter(postgresLakeExecutor());
}
