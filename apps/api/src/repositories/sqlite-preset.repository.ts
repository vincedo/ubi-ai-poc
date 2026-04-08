import { desc, eq } from 'drizzle-orm';
import { chatPreset, enrichmentPreset } from '../db/schema/preset.js';
import type {
  ChatPresetRow,
  NewChatPresetRow,
  EnrichmentPresetRow,
  NewEnrichmentPresetRow,
} from '../db/schema/preset.js';
import type { AppDatabase } from '../plugins/db.js';
import type { PresetRepository, IngestionStats } from './preset.repository.js';
import type { PresetIngestionStatus } from '@ubi-ai/shared';

export class SqlitePresetRepository implements PresetRepository {
  constructor(private db: AppDatabase) {}

  async listChatPresets(): Promise<ChatPresetRow[]> {
    return this.db.select().from(chatPreset).orderBy(desc(chatPreset.createdAt));
  }

  async findChatPresetById(id: string): Promise<ChatPresetRow | null> {
    const rows = await this.db.select().from(chatPreset).where(eq(chatPreset.id, id));
    return rows[0] ?? null;
  }

  async createChatPreset(data: NewChatPresetRow): Promise<ChatPresetRow> {
    const rows = await this.db.insert(chatPreset).values(data).returning();
    return rows[0];
  }

  async deleteChatPreset(id: string): Promise<boolean> {
    const result = await this.db.delete(chatPreset).where(eq(chatPreset.id, id)).returning();
    return result.length > 0;
  }

  async updateIngestionStatus(
    id: string,
    status: PresetIngestionStatus,
    stats?: IngestionStats,
  ): Promise<void> {
    await this.db
      .update(chatPreset)
      .set({
        ingestionStatus: status,
        ...(stats !== undefined && {
          chunkCount: stats.chunkCount,
          tokenCount: stats.tokenCount,
          estimatedCost: stats.estimatedCost,
        }),
      })
      .where(eq(chatPreset.id, id));
  }

  async renameChatPreset(id: string, name: string): Promise<ChatPresetRow | null> {
    const rows = await this.db
      .update(chatPreset)
      .set({ name })
      .where(eq(chatPreset.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async listEnrichmentPresets(): Promise<EnrichmentPresetRow[]> {
    return this.db.select().from(enrichmentPreset).orderBy(desc(enrichmentPreset.createdAt));
  }

  async findEnrichmentPresetById(id: string): Promise<EnrichmentPresetRow | null> {
    const rows = await this.db.select().from(enrichmentPreset).where(eq(enrichmentPreset.id, id));
    return rows[0] ?? null;
  }

  async createEnrichmentPreset(data: NewEnrichmentPresetRow): Promise<EnrichmentPresetRow> {
    const rows = await this.db.insert(enrichmentPreset).values(data).returning();
    return rows[0];
  }

  async deleteEnrichmentPreset(id: string): Promise<boolean> {
    const result = await this.db
      .delete(enrichmentPreset)
      .where(eq(enrichmentPreset.id, id))
      .returning();
    return result.length > 0;
  }

  async renameEnrichmentPreset(id: string, name: string): Promise<EnrichmentPresetRow | null> {
    const rows = await this.db
      .update(enrichmentPreset)
      .set({ name })
      .where(eq(enrichmentPreset.id, id))
      .returning();
    return rows[0] ?? null;
  }
}
