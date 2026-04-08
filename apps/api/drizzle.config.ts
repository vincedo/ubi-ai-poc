/// <reference types="node" />
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema/*',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DB_PATH ?? 'app.db',
  },
});
