import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { EnrichmentResult, MCQ } from '@ubi-ai/shared';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api-base-url.token';

@Injectable({ providedIn: 'root' })
export class EnrichmentService {
  private http = inject(HttpClient);
  private readonly API = inject(API_BASE_URL);

  loading = signal<string | null>(null);
  errors = signal(new Map<string, string>());

  getResult(mediaId: string): Observable<EnrichmentResult | null> {
    return this.http.get<EnrichmentResult | null>(`${this.API}/enrich/${mediaId}`);
  }

  generate(
    mediaId: string,
    presetId: string,
  ): Observable<EnrichmentResult & { llmCallId?: string }> {
    return this.http.post<EnrichmentResult & { llmCallId?: string }>(
      `${this.API}/enrich/${mediaId}`,
      { presetId },
    );
  }

  saveResult(
    mediaId: string,
    data: { title: string; summary: string; keywords: string[]; mcqs: MCQ[] },
  ): Observable<void> {
    return this.http.put<void>(`${this.API}/enrich/${mediaId}`, data);
  }
}
