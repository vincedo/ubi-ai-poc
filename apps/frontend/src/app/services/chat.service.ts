import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { ChatMessage, ChatSource, LanguageModel } from '@ubi-ai/shared';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api-base-url.token';
import { NotificationService } from './notification.service';

export interface ChatSessionSummary {
  id: string;
  model: string;
  createdAt: string;
  totalCost: number;
  totalTokens: number;
  scopeSummary: { mediaCount: number };
}

type StreamEvent =
  | { type: 'text-delta'; delta: string }
  | { type: 'data-sources'; data: ChatSource[] | Array<{ type: string; sessionId?: string }> }
  | { type: string; [key: string]: unknown };

function isStreamEvent(value: unknown): value is StreamEvent {
  return typeof value === 'object' && value !== null && 'type' in value;
}

export interface ChatSessionWithMessages {
  session: {
    id: string;
    model: string;
    createdAt: string;
    totalCost: number;
    totalTokens: number;
  };
  messages: ChatMessage[];
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);
  private readonly API = inject(API_BASE_URL);
  private notification = inject(NotificationService);

  messages = signal<ChatMessage[]>([]);
  isStreaming = signal(false);
  individualMediaIds = signal<string[]>([]);
  selectedModel = signal<LanguageModel>('mistral-large-latest');
  currentSessionId = signal<string | null>(null);

  private abortController: AbortController | null = null;

  stop() {
    this.abortController?.abort();
  }

  async sendMessage(text: string): Promise<void> {
    if (!text.trim() || this.isStreaming()) return;

    const history = this.messages();

    this.messages.update((m) => [
      ...m,
      { role: 'user' as const, content: text },
      { role: 'assistant' as const, content: '', sources: [] },
    ]);
    this.isStreaming.set(true);
    this.abortController = new AbortController();

    try {
      const res = await fetch(`${this.API}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: [...history, { role: 'user', content: text }],
          individualMediaIds: this.individualMediaIds(),
          model: this.selectedModel(),
        }),
        signal: this.abortController.signal,
      });

      if (!res.ok || !res.body) {
        const msg =
          res.status === 503
            ? 'Service unavailable — try again later'
            : `Request failed (HTTP ${res.status})`;
        this.markLastError(msg);
        this.notification.error(msg);
        return;
      }
      await this.readDataStream(res.body);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const msg =
        err instanceof TypeError
          ? 'Network error — check your connection'
          : 'Connection error — try again';
      this.markLastError(msg);
      this.notification.error(msg);
    } finally {
      this.isStreaming.set(false);
      this.abortController = null;
    }
  }

  listSessions(): Observable<ChatSessionSummary[]> {
    return this.http.get<ChatSessionSummary[]>(`${this.API}/chat/sessions`);
  }

  getSession(id: string): Observable<ChatSessionWithMessages> {
    return this.http.get<ChatSessionWithMessages>(`${this.API}/chat/sessions/${id}`);
  }

  private async readDataStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') continue;
          try {
            const event: unknown = JSON.parse(payload);
            if (!isStreamEvent(event)) continue;
            if (event.type === 'text-delta') {
              this.appendContent(String(event.delta ?? ''));
            } else if (event.type === 'data-sources') {
              const data = event.data;
              if (Array.isArray(data) && data.length > 0 && data[0]?.type === 'session') {
                const sessionId = (data[0] as { type: string; sessionId?: string }).sessionId;
                this.currentSessionId.set(typeof sessionId === 'string' ? sessionId : null);
              } else if (Array.isArray(data)) {
                this.setSources(data as ChatSource[]);
              }
            }
          } catch (err) {
            if (!(err instanceof SyntaxError)) throw err;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private appendContent(delta: string) {
    this.messages.update((msgs) => {
      if (msgs.length === 0) return msgs;
      const copy = [...msgs];
      copy[copy.length - 1] = {
        ...copy[copy.length - 1],
        content: copy[copy.length - 1].content + delta,
      };
      return copy;
    });
  }

  private setSources(sources: ChatSource[]) {
    const unique = sources.filter(
      (s, i, arr) => arr.findIndex((x) => x.mediaId === s.mediaId) === i,
    );
    this.messages.update((msgs) => {
      if (msgs.length === 0) return msgs;
      const copy = [...msgs];
      copy[copy.length - 1] = { ...copy[copy.length - 1], sources: unique };
      return copy;
    });
  }

  private markLastError(msg: string) {
    this.messages.update((msgs) => {
      if (msgs.length === 0) return msgs;
      const copy = [...msgs];
      copy[copy.length - 1] = { ...copy[copy.length - 1], content: msg };
      return copy;
    });
  }

  clearHistory() {
    this.messages.set([]);
    this.currentSessionId.set(null);
  }
}
