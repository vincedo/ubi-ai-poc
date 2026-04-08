import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import type { ChatMessage, ChatSource } from '@ubi-ai/shared';
import { isStreamEvent } from '@ubi-ai/shared';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api-base-url.token';
import { NotificationService } from './notification.service';

export interface ChatSessionSummary {
  id: string;
  chatPresetId: string | null;
  chatPresetName: string;
  title: string;
  createdAt: string;
  totalCost: number;
  totalTokens: number;
  scopeSummary: { mediaCount: number };
}

export interface ChatSessionWithMessages {
  session: {
    id: string;
    chatPresetId: string | null;
    chatPresetName: string;
    title: string;
    createdAt: string;
    totalCost: number;
    totalTokens: number;
    individualMediaIds: string[];
  };
  messages: ChatMessage[];
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private readonly API = inject(API_BASE_URL);
  private notification = inject(NotificationService);

  messages = signal<ChatMessage[]>([]);
  isStreaming = signal(false);
  individualMediaIds = signal<string[]>([]);
  selectedChatPresetId = signal<string | null>(null);
  currentSessionId = signal<string | null>(null);
  sessions = signal<ChatSessionSummary[]>([]);
  activeSession = signal<ChatSessionWithMessages['session'] | null>(null);

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

    let success = false;
    try {
      const body = {
        messages: [...history, { role: 'user', content: text }],
        individualMediaIds: this.individualMediaIds(),
        chatPresetId: this.selectedChatPresetId(),
        ...(this.currentSessionId() ? { sessionId: this.currentSessionId() } : {}),
      };
      const res = await fetch(`${this.API}/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: this.abortController.signal,
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        const msg =
          errBody.error ??
          (res.status === 400
            ? 'Invalid request — check your message and try again'
            : res.status === 401 || res.status === 403
              ? 'Not authorized — check your credentials'
              : res.status === 429
                ? 'Rate limited — please wait a moment and try again'
                : res.status === 503
                  ? 'Service unavailable — try again later'
                  : `Request failed (HTTP ${res.status})`);
        this.markLastError(msg);
        this.notification.error(msg);
        return;
      }
      await this.readDataStream(res.body);
      success = true;
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
      const sessionId = this.currentSessionId();
      if (sessionId) {
        this.router.navigate(['/chat', sessionId], { replaceUrl: true });
      }
      this.loadSessions();
      if (success && sessionId) {
        this.loadSession(sessionId);
      }
    }
  }

  listSessions(): Observable<ChatSessionSummary[]> {
    return this.http.get<ChatSessionSummary[]>(`${this.API}/chat/sessions`);
  }

  getSession(id: string): Observable<ChatSessionWithMessages> {
    return this.http.get<ChatSessionWithMessages>(`${this.API}/chat/sessions/${id}`);
  }

  loadSessions(): void {
    this.listSessions().subscribe({
      next: (sessions) => this.sessions.set(sessions),
      error: (err) => {
        console.error('Failed to load sessions:', err);
        this.notification.error('Failed to load chat sessions');
      },
    });
  }

  loadSession(id: string): void {
    this.getSession(id).subscribe({
      next: (result) => {
        this.currentSessionId.set(result.session.id);
        this.activeSession.set(result.session);
        this.messages.set(result.messages);
        this.individualMediaIds.set(result.session.individualMediaIds);
        this.selectedChatPresetId.set(result.session.chatPresetId);
      },
      error: (err) => {
        console.error('Failed to load session:', err);
        this.notification.error('Failed to load chat session');
      },
    });
  }

  renameSession(id: string, title: string): void {
    this.http.patch(`${this.API}/chat/sessions/${id}`, { title }).subscribe({
      next: () => {
        this.sessions.update((s) =>
          s.map((session) => (session.id === id ? { ...session, title } : session)),
        );
        if (this.activeSession()?.id === id) {
          this.activeSession.update((s) => (s ? { ...s, title } : s));
        }
      },
      error: (err) => console.error('Failed to rename session:', err),
    });
  }

  deleteSession(id: string): void {
    this.http.delete(`${this.API}/chat/sessions/${id}`).subscribe({
      next: () => {
        this.sessions.update((s) => s.filter((session) => session.id !== id));
        if (this.currentSessionId() === id) {
          this.newChat();
          this.router.navigate(['/chat']);
        }
      },
      error: (err) => {
        console.error('Failed to delete session:', err);
        this.notification.error('Failed to delete chat session');
      },
    });
  }

  newChat(): void {
    this.currentSessionId.set(null);
    this.activeSession.set(null);
    this.messages.set([]);
    this.individualMediaIds.set([]);
    this.selectedChatPresetId.set(null);
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
              this.appendContent(event.delta);
            } else if (event.type === 'data-sources') {
              const data = event.data;
              const first = data[0] as { type?: string; sessionId?: string } | undefined;
              if (first?.type === 'session') {
                const sessionId = typeof first.sessionId === 'string' ? first.sessionId : null;
                this.currentSessionId.set(sessionId);
                // Navigation is deferred to after streaming ends to avoid destroying
                // the component mid-stream (chat vs chat/:sessionId are separate routes).
              } else {
                this.setSources(data as ChatSource[]);
              }
            } else if (event.type === 'data-llm-call') {
              this.setLlmCallId(event.data.llmCallId);
            } else if (event.type === 'data-error') {
              this.notification.error(event.data.message);
            }
          } catch (err) {
            if (err instanceof SyntaxError) continue;
            console.error('Unexpected error processing stream event:', err);
            throw err;
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

  private setLlmCallId(llmCallId: string) {
    this.messages.update((msgs) => {
      if (msgs.length === 0) return msgs;
      const copy = [...msgs];
      copy[copy.length - 1] = { ...copy[copy.length - 1], llmCallId };
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
