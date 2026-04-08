import type {
  ChatPresetRow,
  NewChatPresetRow,
  EnrichmentPresetRow,
  NewEnrichmentPresetRow,
} from '../db/schema/preset.js';
import type { PresetIngestionStatus } from '@ubi-ai/shared';

export interface IngestionStats {
  chunkCount: number | null;
  tokenCount: number | null;
  estimatedCost: number | null;
}

export interface PresetRepository {
  listChatPresets(): Promise<ChatPresetRow[]>;
  findChatPresetById(id: string): Promise<ChatPresetRow | null>;
  createChatPreset(data: NewChatPresetRow): Promise<ChatPresetRow>;
  deleteChatPreset(id: string): Promise<boolean>;
  updateIngestionStatus(
    id: string,
    status: PresetIngestionStatus,
    stats?: IngestionStats,
  ): Promise<void>;

  renameChatPreset(id: string, name: string): Promise<ChatPresetRow | null>;

  listEnrichmentPresets(): Promise<EnrichmentPresetRow[]>;
  findEnrichmentPresetById(id: string): Promise<EnrichmentPresetRow | null>;
  createEnrichmentPreset(data: NewEnrichmentPresetRow): Promise<EnrichmentPresetRow>;
  deleteEnrichmentPreset(id: string): Promise<boolean>;
  renameEnrichmentPreset(id: string, name: string): Promise<EnrichmentPresetRow | null>;
}
