import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { IngestResult } from '@ubi-ai/shared';
import { MediaService } from './media.service';
import { NotificationService } from './notification.service';
import { API_BASE_URL } from '../api-base-url.token';

export type ItemStatus = 'ready' | 'ingesting' | 'succeeded' | 'failed';
export interface ItemState {
  status: ItemStatus;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class IngestionService {
  private http = inject(HttpClient);
  private mediaService = inject(MediaService);
  private readonly API = inject(API_BASE_URL);
  private notification = inject(NotificationService);

  itemStates = signal(new Map<string, ItemState>());
  isRunning = signal(false);
  logs = signal<string[]>([]);

  succeededCount = computed(
    () => [...this.itemStates().values()].filter((s) => s.status === 'succeeded').length,
  );
  failedCount = computed(
    () => [...this.itemStates().values()].filter((s) => s.status === 'failed').length,
  );
  ingestingCount = computed(
    () => [...this.itemStates().values()].filter((s) => s.status === 'ingesting').length,
  );
  progressPct = computed(() => {
    const total = this.mediaService.catalogue().length;
    return total === 0 ? 0 : Math.round((this.succeededCount() / total) * 100);
  });

  getState(id: string): ItemState {
    return this.itemStates().get(id) ?? { status: 'ready' };
  }

  runAll() {
    if (this.isRunning()) return;
    this.isRunning.set(true);
    const ids = this.mediaService.catalogue().map((m) => m.id);
    this.itemStates.set(new Map(ids.map((id) => [id, { status: 'ingesting' }])));
    this.logs.set([`[INFO] Starting full corpus ingestion (${ids.length} items)...`]);

    this.http.post<IngestResult>(`${this.API}/ingest`, {}).subscribe({
      next: (result) => {
        const states = new Map<string, ItemState>();
        for (const id of result.succeeded) states.set(id, { status: 'succeeded' });
        for (const f of result.failed) states.set(f.id, { status: 'failed', error: f.error });
        for (const id of ids) if (!states.has(id)) states.set(id, { status: 'ready' });
        this.itemStates.set(states);
        this.isRunning.set(false);
        this.logs.update((l) => [
          ...l,
          `[INFO] Ingestion complete — ${result.succeeded.length} succeeded, ${result.failed.length} failed.`,
          ...result.failed.map((f) => `[ERR]  ${f.id}: ${f.error}`),
        ]);
        if (result.failed.length === 0) {
          this.notification.success('Ingestion complete');
        } else {
          this.notification.warning(`Ingestion complete — ${result.failed.length} item(s) failed`);
        }
      },
      error: (err) => {
        this.itemStates.set(
          new Map(ids.map((id) => [id, { status: 'failed', error: 'Request failed' }])),
        );
        this.isRunning.set(false);
        const errMsg = err instanceof Error ? err.message : String(err?.message ?? err);
        this.logs.update((l) => [...l, `[ERR]  ${errMsg}`]);
      },
    });
  }

  runOne(mediaId: string) {
    this.itemStates.update((m) => new Map(m).set(mediaId, { status: 'ingesting' }));
    this.http
      .post<{ succeeded: boolean; error?: string }>(`${this.API}/ingest/${mediaId}`, {})
      .subscribe({
        next: (result) => {
          this.itemStates.update((m) =>
            new Map(m).set(
              mediaId,
              result.succeeded
                ? { status: 'succeeded' }
                : { status: 'failed', error: result.error },
            ),
          );
        },
        error: () => {
          this.itemStates.update((m) =>
            new Map(m).set(mediaId, { status: 'failed', error: 'Request failed' }),
          );
        },
      });
  }
}
