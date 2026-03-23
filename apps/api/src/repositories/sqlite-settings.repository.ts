import { eq } from 'drizzle-orm';
import { settings } from '../db/schema/settings.js';
import { DEFAULT_SETTINGS } from '@ubi-ai/shared';
import type { SettingsValues } from '@ubi-ai/shared';
import type { AppDatabase } from '../plugins/db.js';
import type { SettingsRepository } from './settings.repository.js';

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private db: AppDatabase) {}

  async get(): Promise<SettingsValues> {
    const rows = await this.db.select().from(settings).where(eq(settings.id, 1));
    if (rows.length === 0) {
      // First access — insert defaults
      await this.db.insert(settings).values({ id: 1, values: JSON.stringify(DEFAULT_SETTINGS) });
      return { ...DEFAULT_SETTINGS };
    }
    // Merge with defaults so new keys added in future versions are filled in
    return { ...DEFAULT_SETTINGS, ...JSON.parse(rows[0].values) };
  }

  async update(values: SettingsValues): Promise<SettingsValues> {
    const json = JSON.stringify(values);
    const rows = await this.db.select().from(settings).where(eq(settings.id, 1));
    if (rows.length === 0) {
      await this.db.insert(settings).values({ id: 1, values: json });
    } else {
      await this.db.update(settings).set({ values: json }).where(eq(settings.id, 1));
    }
    return values;
  }
}
