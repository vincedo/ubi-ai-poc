import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api-base-url.token';

@Injectable({ providedIn: 'root' })
export class ResetService {
  private http = inject(HttpClient);
  private readonly API = inject(API_BASE_URL);

  isResetting = signal(false);

  async resetAll(): Promise<void> {
    this.isResetting.set(true);
    try {
      await firstValueFrom(this.http.delete(`${this.API}/reset`, { observe: 'response' }));
    } finally {
      this.isResetting.set(false);
    }
  }
}
