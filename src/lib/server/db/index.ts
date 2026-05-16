import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const connectionString =
	env.DATABASE_URL ?? 'postgres://birdseye:birdseye@localhost:5432/birdseye';

const client = postgres(connectionString);

export const db = drizzle(client, { schema });
export { schema };
