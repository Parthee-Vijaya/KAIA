import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
let connection: ReturnType<typeof postgres> | undefined;
let ormConnection: ReturnType<typeof postgres> | undefined;
let orm: ReturnType<typeof createOrm> | undefined;
function url() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_NOT_CONFIGURED');
  return process.env.DATABASE_URL;
}
const options = {
  prepare: false,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {},
  types: { bigint: { to: 20, from: [20, 1700], serialize: String, parse: Number } },
};
export function sql() {
  connection ??= postgres(url(), { ...options, max: 2 });
  return connection;
}
function createOrm() {
  ormConnection = postgres(url(), { ...options, max: 1 });
  return drizzle(ormConnection, { schema });
}
// Drizzle deliberately overrides postgres.js JSON/date serializers. Keep its one-connection pool separate from raw transactions.
export function db() {
  orm ??= createOrm();
  return orm;
}
export async function closeDb() {
  if (connection) {
    await connection.end();
    connection = undefined;
  }
  if (ormConnection) {
    await ormConnection.end();
    ormConnection = undefined;
    orm = undefined;
  }
}
