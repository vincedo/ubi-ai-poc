import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { MediaItem } from '@ubi-ai/shared';
import { API_BASE_URL } from '../api-base-url.token';

@Injectable({ providedIn: 'root' })
export class MediaService {
  private http = inject(HttpClient);
  private readonly API = inject(API_BASE_URL);
  private _catalogue = signal<MediaItem[]>([]);

  readonly catalogue = this._catalogue.asReadonly();

  loadCatalogue() {
    this.http.get<MediaItem[]>(`${this.API}/media`).subscribe({
      next: (items) => this._catalogue.set(items),
      error: (err) => console.error('Failed to load media catalogue:', err),
    });
  }

  seed() {
    return this.http.post<{ seeded: number }>(`${this.API}/seed/media`, {});
  }
}
