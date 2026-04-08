import { eq, inArray } from 'drizzle-orm';
import { media } from '../db/schema/media.js';
import type { Media, NewMedia } from '../db/schema/media.js';
import type { AppDatabase } from '../plugins/db.js';
import type { MediaRepository } from './media.repository.js';

export class SqliteMediaRepository implements MediaRepository {
  constructor(private db: AppDatabase) {}

  async findAll(): Promise<Media[]> {
    return this.db.select().from(media);
  }

  async findById(id: string): Promise<Media | null> {
    const rows = await this.db.select().from(media).where(eq(media.id, id));
    return rows[0] ?? null;
  }

  async findByIds(ids: string[]): Promise<Media[]> {
    if (ids.length === 0) return [];
    return this.db.select().from(media).where(inArray(media.id, ids));
  }

  async save(data: NewMedia): Promise<Media> {
    const rows = await this.db.insert(media).values(data).returning();
    return rows[0];
  }

  async updateTranscriptionStatus(id: string, status: Media['transcriptionStatus']): Promise<void> {
    await this.db.update(media).set({ transcriptionStatus: status }).where(eq(media.id, id));
  }
}
