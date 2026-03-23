import type { Media, NewMedia } from '../db/schema/media.js';

export interface MediaRepository {
  findAll(): Promise<Media[]>;
  findById(id: string): Promise<Media | null>;
  save(data: NewMedia): Promise<Media>;
  updateIngestionStatus(id: string, status: Media['ingestionStatus']): Promise<void>;
  updateTranscriptionStatus(id: string, status: Media['transcriptionStatus']): Promise<void>;
}
