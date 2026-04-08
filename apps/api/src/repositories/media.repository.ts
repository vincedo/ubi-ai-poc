import type { Media, NewMedia } from '../db/schema/media.js';

export interface MediaRepository {
  findAll(): Promise<Media[]>;
  findById(id: string): Promise<Media | null>;
  findByIds(ids: string[]): Promise<Media[]>;
  save(data: NewMedia): Promise<Media>;
  updateTranscriptionStatus(id: string, status: Media['transcriptionStatus']): Promise<void>;
}
