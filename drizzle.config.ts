import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'postgresql',
	dbCredentials: {
		url: process.env.DATABASE_URL ?? 'postgres://birdseye:birdseye@localhost:5432/birdseye'
	},
	verbose: true,
	strict: true
});
