import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fp from 'fastify-plugin';

import * as mediaSchema from '../db/schema/media.js';
import * as courseSchema from '../db/schema/course.js';
import * as enrichmentSchema from '../db/schema/enrichment.js';
import * as ingestionSchema from '../db/schema/ingestion.js';
import * as chatSchema from '../db/schema/chat.js';
import * as settingsSchema from '../db/schema/settings.js';

const schema = {
  ...mediaSchema,
  ...courseSchema,
  ...enrichmentSchema,
  ...ingestionSchema,
  ...chatSchema,
  ...settingsSchema,
};

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>;

export default fp(
  async (fastify) => {
    const dbPath = process.env.DB_PATH ?? 'app.db';
    const sqlite = new Database(dbPath);

    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    const db = drizzle(sqlite, { schema });

    fastify.decorate('db', db);

    // Create updatedAt trigger for enrichment_result
    sqlite.exec(`
      CREATE TRIGGER IF NOT EXISTS set_enrichment_result_updated_at
      AFTER UPDATE ON enrichment_result
      BEGIN
        UPDATE enrichment_result SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE media_id = NEW.media_id;
      END;
    `);

    fastify.addHook('onClose', () => {
      sqlite.close();
    });
  },
  { name: 'db' },
);

declare module 'fastify' {
  interface FastifyInstance {
    db: AppDatabase;
  }
}
