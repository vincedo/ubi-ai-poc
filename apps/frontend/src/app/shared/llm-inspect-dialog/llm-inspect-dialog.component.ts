import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { DecimalPipe } from '@angular/common';
import type { ChatSource, GuardrailResult, LlmCall } from '@ubi-ai/shared';
import { InspectService } from '../../services/inspect.service';

export interface LlmInspectDialogData {
  llmCallId: string;
  presetName?: string | null;
}

@Component({
  selector: 'app-llm-inspect-dialog',
  imports: [DecimalPipe, MatExpansionModule, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './llm-inspect-dialog.component.html',
  styleUrl: './llm-inspect-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LlmInspectDialogComponent {
  private dialogRef = inject(MatDialogRef<LlmInspectDialogComponent>);
  private inspectService = inject(InspectService);
  private destroyRef = inject(DestroyRef);
  data: LlmInspectDialogData = inject(MAT_DIALOG_DATA);

  call = signal<LlmCall | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  constructor() {
    this.inspectService
      .getCall(this.data.llmCallId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.call.set(result);
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Failed to load LLM call:', err);
          this.error.set('Failed to load inspection data');
          this.loading.set(false);
        },
      });
  }

  close() {
    this.dialogRef.close();
  }

  formatCost(cost: number): string {
    return cost < 0.01 ? `€${cost.toFixed(6)}` : `€${cost.toFixed(4)}`;
  }

  parseMessages(json: string | null): Array<{ role: string; content: string }> {
    if (!json) return [];
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  }

  parseSources(json: string | null): ChatSource[] {
    if (!json) return [];
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  }

  formatJson(json: string | null): string {
    if (!json) return '';
    try {
      return JSON.stringify(JSON.parse(json), null, 2);
    } catch {
      return json;
    }
  }

  extractUserQuery(json: string | null): string {
    const messages = this.parseMessages(json);
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    return lastUser?.content ?? '';
  }

  splitSystemPrompt(prompt: string | null): { instructions: string; context: string } | null {
    if (!prompt) return null;
    const marker = '\nContext:\n';
    const idx = prompt.indexOf(marker);
    if (idx === -1) return { instructions: prompt, context: '' };
    return {
      instructions: prompt.slice(0, idx).trim(),
      context: prompt.slice(idx + marker.length).trim(),
    };
  }

  splitEnrichmentPrompt(prompt: string | null): { instructions: string; transcript: string } | null {
    if (!prompt) return null;
    const marker = '\nTranscript:\n';
    const idx = prompt.indexOf(marker);
    if (idx !== -1) {
      return {
        instructions: prompt.slice(0, idx).trim(),
        transcript: prompt.slice(idx + marker.length).trim(),
      };
    }
    // minimal prompt uses a blank line as separator
    const sep = '\n\n';
    const sepIdx = prompt.indexOf(sep);
    if (sepIdx === -1) return { instructions: prompt, transcript: '' };
    return {
      instructions: prompt.slice(0, sepIdx).trim(),
      transcript: prompt.slice(sepIdx + sep.length).trim(),
    };
  }

  sourceLocation(source: ChatSource): string {
    if (source.mediaType === 'pdf') return `Page ${source.pageNumber}`;
    return source.timestamp;
  }

  parseGuardrails(json: string | null): GuardrailResult[] {
    if (!json) return [];
    try {
      return JSON.parse(json);
    } catch {
      return [];
    }
  }
}
