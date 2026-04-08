import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { MediaItem } from '@ubi-ai/shared';
import { signal } from '@angular/core';
import { API_BASE_URL } from '../api-base-url.token';

@Injectable({ providedIn: 'root' })
export class MediaService {
  private http = inject(HttpClient);
  private readonly API = inject(API_BASE_URL);

  private _catalogue = signal<MediaItem[]>([]);
  readonly catalogue = this._catalogue.asReadonly();

  private pollInterval: ReturnType<typeof setInterval> | null = null;

  loadCatalogue() {
    this.http.get<MediaItem[]>(`${this.API}/media`).subscribe({
      next: (items) => this._catalogue.set(items),
      error: (err) => console.error('Failed to load media catalogue:', err),
    });
  }

  startPolling(intervalMs = 2000) {
    if (this.pollInterval) return;
    this.pollInterval = setInterval(() => this.loadCatalogue(), intervalMs);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

}
