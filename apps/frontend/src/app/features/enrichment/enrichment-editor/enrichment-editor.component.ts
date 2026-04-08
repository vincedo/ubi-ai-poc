import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import type { EnrichmentPreset, EnrichmentResult, MediaItem, MCQ } from '@ubi-ai/shared';
import {
  LlmInspectDialogComponent,
  type LlmInspectDialogData,
} from '../../../shared/llm-inspect-dialog/llm-inspect-dialog.component';

@Component({
  selector: 'app-enrichment-editor',
  imports: [],
  templateUrl: './enrichment-editor.component.html',
  styleUrl: './enrichment-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnrichmentEditorComponent {
  item = input<MediaItem | null>(null);
  result = input<EnrichmentResult | null>(null);
  loading = input(false);
  saving = input(false);
  llmCallId = input<string | null>(null);
  enrichmentPresets = input<EnrichmentPreset[]>([]);
  selectedPresetId = input<string | null>(null);

  private dialog = inject(MatDialog);
  enrich = output<{ mediaId: string }>();
  presetChange = output<string>();
  save = output<{
    mediaId: string;
    data: { title: string; summary: string; keywords: string[]; mcqs: MCQ[] };
  }>();

  // Editable form state — synced from result input
  editTitle = signal('');
  editSummary = signal('');
  editKeywords = signal<string[]>([]);

  // Tracks save feedback: shows "Saved!" briefly after save completes
  saveConfirmed = signal(false);
  private saveConfirmedTimer: ReturnType<typeof setTimeout> | null = null;

  optionLabel = (i: number) => ['A', 'B', 'C', 'D'][i];

  /** Name of the preset that produced the existing enrichment result, for the Inspect dialog. */
  resultPresetName = computed(() => {
    const id = this.result()?.enrichmentPresetId;
    if (!id) return null;
    return this.enrichmentPresets().find((p) => p.id === id)?.name ?? null;
  });

  isDirty = computed(() => {
    const r = this.result();
    if (!r) return false;
    return r.title !== this.editTitle() || r.summary !== this.editSummary();
  });

  constructor() {
    effect(() => {
      const r = this.result();
      if (r) {
        this.editTitle.set(r.title);
        this.editSummary.set(r.summary);
        this.editKeywords.set(Array.isArray(r.keywords) ? r.keywords : []);
      } else {
        this.editTitle.set('');
        this.editSummary.set('');
        this.editKeywords.set([]);
      }
    });

    // Detect save completion (saving transitions from true → false).
    let wasSaving = false;
    effect(() => {
      const isSaving = this.saving();
      if (wasSaving && !isSaving) {
        this.saveConfirmed.set(true);
        if (this.saveConfirmedTimer) clearTimeout(this.saveConfirmedTimer);
        this.saveConfirmedTimer = setTimeout(() => this.saveConfirmed.set(false), 2500);
      }
      wasSaving = isSaving;
    });
  }

  onTitleInput(event: Event): void {
    this.editTitle.set((event.target as HTMLInputElement).value);
  }

  onSummaryInput(event: Event): void {
    this.editSummary.set((event.target as HTMLTextAreaElement).value);
  }

  onPresetChange(event: Event): void {
    this.presetChange.emit((event.target as HTMLSelectElement).value);
  }

  onEnrich() {
    const item = this.item();
    if (item) this.enrich.emit({ mediaId: item.id });
  }

  openInspect() {
    const id = this.llmCallId();
    if (id) {
      this.dialog.open(LlmInspectDialogComponent, {
        data: { llmCallId: id, presetName: this.resultPresetName() } satisfies LlmInspectDialogData,
        autoFocus: 'dialog',
        panelClass: 'inspect-dialog-panel',
        height: '90vh',
      });
    }
  }

  onSave() {
    const item = this.item();
    const r = this.result();
    if (item && r) {
      this.save.emit({
        mediaId: item.id,
        data: {
          title: this.editTitle(),
          summary: this.editSummary(),
          keywords: this.editKeywords(),
          mcqs: r.mcqs,
        },
      });
    }
  }
}
