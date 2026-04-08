import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ChatPreset, EnrichmentPreset } from '@ubi-ai/shared';
import { API_BASE_URL } from '../api-base-url.token';
import { NotificationService } from './notification.service';

export interface CreateChatPresetDto {
  name: string;
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
  sentenceAwareSplitting: boolean;
  distanceMetric: string;
  retrievalTopK: number;
  languageModel: string;
  chatSystemPrompt: string;
}

export interface CreateEnrichmentPresetDto {
  name: string;
  languageModel: string;
  enrichmentPrompt: string;
}

@Injectable({ providedIn: 'root' })
export class PresetService {
  private http = inject(HttpClient);
  private readonly API = inject(API_BASE_URL);
  private notification = inject(NotificationService);

  private _chatPresets = signal<ChatPreset[]>([]);
  private _enrichmentPresets = signal<EnrichmentPreset[]>([]);

  readonly chatPresets = this._chatPresets.asReadonly();
  readonly enrichmentPresets = this._enrichmentPresets.asReadonly();

  async loadChatPresets(): Promise<void> {
    try {
      const presets = await firstValueFrom(this.http.get<ChatPreset[]>(`${this.API}/presets/chat`));
      this._chatPresets.set(presets);
    } catch (err) {
      console.error('Failed to load chat presets:', err);
      this.notification.warning('Could not load chat presets');
    }
  }

  async loadEnrichmentPresets(): Promise<void> {
    try {
      const presets = await firstValueFrom(
        this.http.get<EnrichmentPreset[]>(`${this.API}/presets/enrichment`),
      );
      this._enrichmentPresets.set(presets);
    } catch (err) {
      console.error('Failed to load enrichment presets:', err);
      this.notification.warning('Could not load enrichment presets');
    }
  }

  createChatPreset(dto: CreateChatPresetDto) {
    return this.http.post<ChatPreset>(`${this.API}/presets/chat`, dto);
  }

  createEnrichmentPreset(dto: CreateEnrichmentPresetDto) {
    return this.http.post<EnrichmentPreset>(`${this.API}/presets/enrichment`, dto);
  }

  deleteChatPreset(id: string) {
    return this.http.delete(`${this.API}/presets/chat/${id}`);
  }

  deleteEnrichmentPreset(id: string) {
    return this.http.delete(`${this.API}/presets/enrichment/${id}`);
  }

  getChatPreset(id: string) {
    return this.http.get<ChatPreset>(`${this.API}/presets/chat/${id}`);
  }

  renameChatPreset(id: string, name: string) {
    return this.http.patch<ChatPreset>(`${this.API}/presets/chat/${id}`, { name });
  }

  renameEnrichmentPreset(id: string, name: string) {
    return this.http.patch<EnrichmentPreset>(`${this.API}/presets/enrichment/${id}`, { name });
  }

  patchChatPreset(updated: ChatPreset): void {
    this._chatPresets.update((list) => list.map((p) => (p.id === updated.id ? updated : p)));
  }

  patchEnrichmentPreset(updated: EnrichmentPreset): void {
    this._enrichmentPresets.update((list) => list.map((p) => (p.id === updated.id ? updated : p)));
  }
}
