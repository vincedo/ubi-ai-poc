import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import type { EnrichmentResult, MediaItem, LanguageModel, MCQ } from '@ubi-ai/shared';
import { LANGUAGE_MODELS } from '@ubi-ai/shared';

@Component({
  selector: 'app-enrichment-editor',
  imports: [MatFormFieldModule, MatSelectModule],
  templateUrl: './enrichment-editor.component.html',
  styleUrl: './enrichment-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnrichmentEditorComponent {
  item = input<MediaItem | null>(null);
  result = input<EnrichmentResult | null>(null);
  loading = input(false);
  saving = input(false);
  enrich = output<{ mediaId: string; model: LanguageModel }>();
  save = output<{
    mediaId: string;
    data: { title: string; summary: string; keywords: string[]; mcqs: MCQ[] };
  }>();

  readonly models = LANGUAGE_MODELS;
  selectedModel = signal<LanguageModel>('mistral-large-latest');

  // Editable form state — synced from result input
  editTitle = signal('');
  editSummary = signal('');
  editKeywords = signal<string[]>([]);

  // Tracks save feedback: shows "Saved!" briefly after save completes
  saveConfirmed = signal(false);
  private saveConfirmedTimer: ReturnType<typeof setTimeout> | null = null;

  optionLabel = (i: number) => ['A', 'B', 'C', 'D'][i];

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
    // Track previous state locally since effect() has no "previous value" API.
    // Show "Saved!" confirmation for 2.5s after each save completes.
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

  onEnrich() {
    const item = this.item();
    if (item) this.enrich.emit({ mediaId: item.id, model: this.selectedModel() });
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
