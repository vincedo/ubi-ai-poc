import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { IngestResult } from '@ubi-ai/shared';
import { NotificationService } from './notification.service';
import { API_BASE_URL } from '../api-base-url.token';

@Injectable({ providedIn: 'root' })
export class IngestionService {
  private http = inject(HttpClient);
  private readonly API = inject(API_BASE_URL);
  private notification = inject(NotificationService);

  isRunning = signal(false);
  errors = signal(new Map<string, string>());

  async runAll(presetId: string): Promise<void> {
    if (this.isRunning()) return;
    this.isRunning.set(true);
    this.errors.set(new Map());
    try {
      const result = await firstValueFrom(
        this.http.post<IngestResult>(`${this.API}/ingest`, { presetId }),
      );
      const errMap = new Map<string, string>();
      result.failed.forEach(({ id, error }) => errMap.set(id, error));
      this.errors.set(errMap);
      if (result.failed.length === 0) {
        this.notification.success('Ingestion complete');
      } else {
        this.notification.warning(`Ingestion complete — ${result.failed.length} item(s) failed`);
      }
    } finally {
      this.isRunning.set(false);
    }
  }

  async reset(presetId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.API}/ingest`, { body: { presetId } }));
  }
}
