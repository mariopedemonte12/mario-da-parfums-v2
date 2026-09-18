import { defineConfig } from 'drizzle-kit';
import '../config/load-env.js';

// drizzle-kit runs outside Nest's bootstrap, so the repo-root env file is
// loaded explicitly (optional; real environment variables take precedence).
export default defineConfig({
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
