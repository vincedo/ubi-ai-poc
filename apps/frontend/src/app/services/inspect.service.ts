import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { LlmCall } from '@ubi-ai/shared';
import { API_BASE_URL } from '../api-base-url.token';

@Injectable({ providedIn: 'root' })
export class InspectService {
  private http = inject(HttpClient);
  private readonly API = inject(API_BASE_URL);

  getCall(llmCallId: string): Observable<LlmCall> {
    return this.http.get<LlmCall>(`${this.API}/inspect/${llmCallId}`);
  }
}
