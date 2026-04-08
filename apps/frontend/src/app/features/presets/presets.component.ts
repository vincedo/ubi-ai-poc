import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PresetService } from '../../services/preset.service';
import { NotificationService } from '../../services/notification.service';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '../../shared/confirm-dialog/confirm-dialog.component';
import { DEFAULT_SETTINGS, EMBEDDING_MODELS, LANGUAGE_MODEL_INFO, SETTINGS_DEFINITIONS } from '@ubi-ai/shared';
import type { ChatPreset, EnrichmentPreset, SettingDefinition } from '@ubi-ai/shared';
import { API_BASE_URL } from '../../api-base-url.token';

const TAB_SLUGS = ['chat', 'enrichment'] as const;

@Component({
  selector: 'app-presets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './presets.component.html',
  styleUrl: './presets.component.scss',
  imports: [ReactiveFormsModule, MatTabsModule, MatProgressSpinnerModule],
})
export class PresetsComponent implements OnInit {
  private http = inject(HttpClient);
  private readonly API = inject(API_BASE_URL);
  private dialog = inject(MatDialog);
  private notification = inject(NotificationService);
  private presetService = inject(PresetService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  loadingChat = signal(true);
  loadingEnrichment = signal(true);
  creatingChat = signal(false);
  creatingEnrichment = signal(false);
  deletingId = signal<string | null>(null);
  editingId = signal<string | null>(null);
  editingName = signal('');

  private readonly tabParam = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('tab'))),
    { initialValue: 'chat' },
  );

  readonly activeTabIndex = computed(() => {
    const index = TAB_SLUGS.indexOf(this.tabParam() as (typeof TAB_SLUGS)[number]);
    return index >= 0 ? index : 0;
  });

  readonly chatPresets = this.presetService.chatPresets;
  readonly enrichmentPresets = this.presetService.enrichmentPresets;

  // SETTINGS_DEFINITIONS refs — cast to the discriminated variant so .options is typed
  readonly chunkSizeDef = SETTINGS_DEFINITIONS.find(
    (d) => d.key === 'chunkSize',
  ) as Extract<SettingDefinition, { type: 'number' }>;
  readonly chunkOverlapDef = SETTINGS_DEFINITIONS.find(
    (d) => d.key === 'chunkOverlap',
  ) as Extract<SettingDefinition, { type: 'number' }>;
  readonly sentenceAwareDef = SETTINGS_DEFINITIONS.find(
    (d) => d.key === 'sentenceAwareSplitting',
  ) as Extract<SettingDefinition, { type: 'boolean' }>;
  readonly topKDef = SETTINGS_DEFINITIONS.find(
    (d) => d.key === 'topK',
  ) as Extract<SettingDefinition, { type: 'number' }>;
  readonly embeddingModelDef = SETTINGS_DEFINITIONS.find(
    (d) => d.key === 'embeddingModel',
  ) as Extract<SettingDefinition, { type: 'string' }>;
  readonly distanceMetricDef = SETTINGS_DEFINITIONS.find(
    (d) => d.key === 'distanceMetric',
  ) as Extract<SettingDefinition, { type: 'string' }>;
  readonly chatSystemPromptDef = SETTINGS_DEFINITIONS.find(
    (d) => d.key === 'chatSystemPrompt',
  ) as Extract<SettingDefinition, { type: 'string' }>;
  readonly enrichmentPromptDef = SETTINGS_DEFINITIONS.find(
    (d) => d.key === 'enrichmentPrompt',
  ) as Extract<SettingDefinition, { type: 'string' }>;

  readonly languageModels = LANGUAGE_MODEL_INFO;

  readonly availableProviders = signal<string[] | null>(null);

  // Initial form values (also used for reset)
  private readonly chatDefaults = {
    name: '',
    embeddingModel: DEFAULT_SETTINGS.embeddingModel,
    chunkSize: DEFAULT_SETTINGS.chunkSize,
    chunkOverlap: DEFAULT_SETTINGS.chunkOverlap,
    sentenceAwareSplitting: DEFAULT_SETTINGS.sentenceAwareSplitting,
    distanceMetric: DEFAULT_SETTINGS.distanceMetric,
    retrievalTopK: DEFAULT_SETTINGS.topK,
    languageModel: LANGUAGE_MODEL_INFO[0].id,
    chatSystemPrompt: DEFAULT_SETTINGS.chatSystemPrompt,
  };

  private readonly enrichDefaults = {
    name: '',
    languageModel: LANGUAGE_MODEL_INFO[0].id,
    enrichmentPrompt: DEFAULT_SETTINGS.enrichmentPrompt,
  };

  chatForm: FormGroup = this.fb.group({
    name: [this.chatDefaults.name, [Validators.required, Validators.minLength(5)]],
    chunkSize: [this.chatDefaults.chunkSize, Validators.required],
    chunkOverlap: [this.chatDefaults.chunkOverlap, Validators.required],
    sentenceAwareSplitting: [this.chatDefaults.sentenceAwareSplitting],
    embeddingModel: [this.chatDefaults.embeddingModel, Validators.required],
    distanceMetric: [this.chatDefaults.distanceMetric, Validators.required],
    retrievalTopK: [this.chatDefaults.retrievalTopK, Validators.required],
    languageModel: [this.chatDefaults.languageModel, Validators.required],
    chatSystemPrompt: [this.chatDefaults.chatSystemPrompt, Validators.required],
  });

  enrichmentForm: FormGroup = this.fb.group({
    name: [this.enrichDefaults.name, [Validators.required, Validators.minLength(5)]],
    languageModel: [this.enrichDefaults.languageModel, Validators.required],
    enrichmentPrompt: [this.enrichDefaults.enrichmentPrompt, Validators.required],
  });

  readonly chatValues = toSignal(
    this.chatForm.valueChanges.pipe(startWith(this.chatForm.value)),
    { initialValue: this.chatForm.value },
  );

  readonly enrichValues = toSignal(
    this.enrichmentForm.valueChanges.pipe(startWith(this.enrichmentForm.value)),
    { initialValue: this.enrichmentForm.value },
  );

  // Reactive option descriptions for each field
  readonly chunkSizeHint = computed(() =>
    this.findHint(this.chunkSizeDef.options, this.chatValues().chunkSize),
  );
  readonly chunkOverlapHint = computed(() =>
    this.findHint(this.chunkOverlapDef.options, this.chatValues().chunkOverlap),
  );
  readonly sentenceAwareHint = computed(() =>
    this.findHint(this.sentenceAwareDef.options, this.chatValues().sentenceAwareSplitting),
  );
  readonly topKHint = computed(() =>
    this.findHint(this.topKDef.options, this.chatValues().retrievalTopK),
  );
  readonly embeddingModelHint = computed(() =>
    this.findHint(this.embeddingModelDef.options, this.chatValues().embeddingModel),
  );
  readonly distanceMetricHint = computed(() =>
    this.findHint(this.distanceMetricDef.options, this.chatValues().distanceMetric),
  );
  readonly chatSystemPromptHint = computed(() =>
    this.findHint(this.chatSystemPromptDef.options, this.chatValues().chatSystemPrompt),
  );
  readonly languageModelChatHint = computed(
    () => this.languageModels.find((m) => m.id === this.chatValues().languageModel)?.description ?? null,
  );
  readonly enrichmentPromptHint = computed(() =>
    this.findHint(this.enrichmentPromptDef.options, this.enrichValues().enrichmentPrompt),
  );
  readonly languageModelEnrichHint = computed(
    () => this.languageModels.find((m) => m.id === this.enrichValues().languageModel)?.description ?? null,
  );

  labelFor(def: SettingDefinition, value: unknown): string {
    return def.options?.find((o) => o.value === value)?.label ?? String(value);
  }

  lmLabel(id: string): string {
    return this.languageModels.find((m) => m.id === id)?.label ?? id;
  }

  private findHint(
    options: { value: unknown; description: string }[] | undefined,
    value: unknown,
  ): string | null {
    return options?.find((o) => o.value === value)?.description ?? null;
  }

  ngOnInit(): void {
    this.loadChat();
    this.loadEnrichment();
    this.http.get<{ availableProviders: string[] }>(`${this.API}/config`).subscribe({
      next: ({ availableProviders }) => this.availableProviders.set(availableProviders),
      error: () => this.availableProviders.set(['mistral', 'anthropic', 'openai']),
    });
  }

  isProviderAvailable(provider: string): boolean {
    const providers = this.availableProviders();
    return providers === null || providers.includes(provider);
  }

  isEmbeddingModelAvailable(modelId: string): boolean {
    const provider = EMBEDDING_MODELS[modelId]?.provider;
    return !provider || this.isProviderAvailable(provider);
  }

  onTabChange(index: number): void {
    void this.router.navigate(['/presets', TAB_SLUGS[index]]);
  }

  private loadChat(): void {
    this.loadingChat.set(true);
    this.presetService.loadChatPresets().finally(() => this.loadingChat.set(false));
  }

  private loadEnrichment(): void {
    this.loadingEnrichment.set(true);
    this.presetService.loadEnrichmentPresets().finally(() => this.loadingEnrichment.set(false));
  }

  createChatPreset(): void {
    if (this.chatForm.invalid) {
      this.notification.warning('Please fill all required fields');
      return;
    }
    this.creatingChat.set(true);
    this.presetService.createChatPreset(this.chatForm.value).subscribe({
      next: () => {
        this.creatingChat.set(false);
        this.chatForm.reset(this.chatDefaults);
        this.loadChat();
        this.notification.success('Chat preset created');
      },
      error: (err) => {
        this.creatingChat.set(false);
        console.error('Failed to create chat preset:', err);
      },
    });
  }

  createEnrichmentPreset(): void {
    if (this.enrichmentForm.invalid) {
      this.notification.warning('Please fill all required fields');
      return;
    }
    this.creatingEnrichment.set(true);
    this.presetService.createEnrichmentPreset(this.enrichmentForm.value).subscribe({
      next: () => {
        this.creatingEnrichment.set(false);
        this.enrichmentForm.reset(this.enrichDefaults);
        this.loadEnrichment();
        this.notification.success('Enrichment preset created');
      },
      error: (err) => {
        this.creatingEnrichment.set(false);
        console.error('Failed to create enrichment preset:', err);
      },
    });
  }

  deleteChatPreset(preset: ChatPreset): void {
    this.openConfirm({
      title: 'Delete Chat Preset',
      message: `Are you sure you want to delete "${preset.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmColor: 'danger',
    }).subscribe((confirmed) => {
      if (!confirmed) return;
      this.deletingId.set(preset.id);
      this.presetService.deleteChatPreset(preset.id).subscribe({
        next: () => {
          this.deletingId.set(null);
          this.loadChat();
          this.notification.success('Chat preset deleted');
        },
        error: (err) => {
          this.deletingId.set(null);
          console.error('Failed to delete chat preset:', err);
        },
      });
    });
  }

  deleteEnrichmentPreset(preset: EnrichmentPreset): void {
    this.openConfirm({
      title: 'Delete Enrichment Preset',
      message: `Are you sure you want to delete "${preset.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmColor: 'danger',
    }).subscribe((confirmed) => {
      if (!confirmed) return;
      this.deletingId.set(preset.id);
      this.presetService.deleteEnrichmentPreset(preset.id).subscribe({
        next: () => {
          this.deletingId.set(null);
          this.loadEnrichment();
          this.notification.success('Enrichment preset deleted');
        },
        error: (err) => {
          this.deletingId.set(null);
          console.error('Failed to delete enrichment preset:', err);
        },
      });
    });
  }

  copyPresetId(id: string): void {
    navigator.clipboard.writeText(id);
  }

  startRename(id: string, currentName: string): void {
    this.editingId.set(id);
    this.editingName.set(currentName);
  }

  cancelRename(): void {
    this.editingId.set(null);
    this.editingName.set('');
  }

  saveRenameChatPreset(id: string): void {
    const name = this.editingName().trim();
    if (!name) return;
    this.presetService.renameChatPreset(id, name).subscribe({
      next: (updated) => {
        this.presetService.patchChatPreset(updated);
        this.editingId.set(null);
        this.notification.success('Preset renamed');
      },
      error: (err) => {
        console.error('Failed to rename chat preset:', err);
      },
    });
  }

  saveRenameEnrichmentPreset(id: string): void {
    const name = this.editingName().trim();
    if (!name) return;
    this.presetService.renameEnrichmentPreset(id, name).subscribe({
      next: (updated) => {
        this.presetService.patchEnrichmentPreset(updated);
        this.editingId.set(null);
        this.notification.success('Preset renamed');
      },
      error: (err) => {
        console.error('Failed to rename enrichment preset:', err);
      },
    });
  }

  onEditNameInput(event: Event): void {
    this.editingName.set((event.target as HTMLInputElement).value);
  }

  onEditNameKey(event: Event, saveCallback: () => void): void {
    const key = (event as KeyboardEvent).key;
    if (key === 'Enter') saveCallback();
    if (key === 'Escape') this.cancelRename();
  }

  private openConfirm(data: ConfirmDialogData) {
    return this.dialog.open(ConfirmDialogComponent, { data, autoFocus: 'dialog' }).afterClosed();
  }
}
