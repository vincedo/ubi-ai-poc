import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DEFAULT_SETTINGS } from '@ubi-ai/shared';
import type { SettingsValues } from '@ubi-ai/shared';
import { API_BASE_URL } from '../api-base-url.token';
import { NotificationService } from './notification.service';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private http = inject(HttpClient);
  private readonly API = inject(API_BASE_URL);
  private notification = inject(NotificationService);

  private _settings = signal<SettingsValues>(DEFAULT_SETTINGS);
  private _availableProviders = signal<Record<string, boolean>>({});

  readonly settings = this._settings.asReadonly();
  readonly availableProviders = this._availableProviders.asReadonly();

  async load(): Promise<void> {
    try {
      const values = await firstValueFrom(this.http.get<SettingsValues>(`${this.API}/settings`));
      this._settings.set(values);
    } catch {
      this._settings.set({ ...DEFAULT_SETTINGS });
      this.notification.warning('Could not load settings from server — using defaults.');
    }
  }

  save(values: SettingsValues) {
    return this.http.put<SettingsValues>(`${this.API}/settings`, values);
  }

  loadAvailableProviders(onComplete?: () => void): void {
    this.http.get<Record<string, boolean>>(`${this.API}/settings/available-providers`).subscribe({
      next: (providers) => {
        this._availableProviders.set(providers);
        onComplete?.();
      },
      error: (err) => {
        console.error('Failed to load available providers:', err);
        onComplete?.();
      },
    });
  }
}
