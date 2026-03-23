import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MediaService } from '../../services/media.service';
import { NotificationService } from '../../services/notification.service';
import { SettingsService } from '../../services/settings.service';
import { SettingRadioGroupComponent } from './setting-radio-group/setting-radio-group.component';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '../../shared/confirm-dialog/confirm-dialog.component';
import { SETTINGS_DEFINITIONS, DEFAULT_SETTINGS, EMBEDDING_MODELS } from '@ubi-ai/shared';
import type { SettingsValues, SettingDefinition } from '@ubi-ai/shared';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  imports: [SettingRadioGroupComponent],
})
export class SettingsComponent implements OnInit {
  private dialog = inject(MatDialog);
  private mediaService = inject(MediaService);
  private notification = inject(NotificationService);
  private settingsService = inject(SettingsService);

  // Data management signals
  seeding = signal(false);
  result = signal<number | null>(null);
  error = signal<string | null>(null);

  // Settings signals
  draft = signal<SettingsValues>({ ...DEFAULT_SETTINGS });
  saving = signal(false);
  providersLoaded = signal(false);

  // Group definitions by category
  readonly chunkingDefs = SETTINGS_DEFINITIONS.filter((d) => d.category === 'chunking');
  readonly retrievalDefs = SETTINGS_DEFINITIONS.filter((d) => d.category === 'retrieval');
  readonly embeddingDefs = SETTINGS_DEFINITIONS.filter((d) => d.category === 'embedding');

  // Compute disabled embedding model values based on available providers
  disabledEmbeddingModels = computed(() => {
    const providers = this.settingsService.availableProviders();
    return Object.entries(EMBEDDING_MODELS)
      .filter(([, config]) => !providers[config.provider])
      .map(([id]) => id);
  });

  // Check if draft differs from saved settings
  hasChanges = computed(() => {
    const saved = this.settingsService.settings();
    const current = this.draft();
    return JSON.stringify(saved) !== JSON.stringify(current);
  });

  // True when any requiresReingestion setting differs from saved
  needsReingestion = computed(() => {
    const saved = this.settingsService.settings();
    const current = this.draft();
    return SETTINGS_DEFINITIONS.some(
      (def) => def.requiresReingestion && saved[def.key] !== current[def.key],
    );
  });

  ngOnInit() {
    // Initialize draft from saved settings
    this.draft.set({ ...this.settingsService.settings() });
    // Load available providers
    this.settingsService.loadAvailableProviders(() => this.providersLoaded.set(true));
  }

  updateSetting(key: string, value: unknown) {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  save() {
    if (this.needsReingestion()) {
      this.openConfirm({
        title: 'Reset Data Required',
        message:
          'Saving these settings will delete all existing data and re-seed fixtures. This cannot be undone.',
        confirmLabel: 'Save & Reset Data',
        confirmColor: 'danger',
      }).subscribe((confirmed) => {
        if (confirmed) this.doSave(true);
      });
      return;
    }

    this.doSave(false);
  }

  resetToDefaults() {
    this.draft.set({ ...DEFAULT_SETTINGS });
  }

  private doSave(resetAfter: boolean) {
    this.saving.set(true);
    this.settingsService.save(this.draft()).subscribe({
      next: () => {
        if (resetAfter) {
          this.mediaService.seed().subscribe({
            next: (res) => {
              this.saving.set(false);
              this.settingsService.load();
              this.mediaService.loadCatalogue();
              this.notification.success(
                `Settings saved. Database reset and re-seeded (${res.seeded} items).`,
              );
            },
            error: () => {
              this.saving.set(false);
              this.notification.error('Settings saved but database reset failed.');
            },
          });
        } else {
          this.saving.set(false);
          this.settingsService.load();
          this.notification.success('Settings saved.');
        }
      },
      error: () => {
        this.saving.set(false);
      },
    });
  }

  // --- Seed/reset ---
  seedDatabase() {
    this.openConfirm({
      title: 'Confirm Seed / Reset',
      message:
        'This will permanently delete all existing data and Qdrant vectors. This cannot be undone.',
      confirmLabel: 'Reset & Seed',
      confirmColor: 'danger',
    }).subscribe((confirmed) => {
      if (confirmed) this.doSeed();
    });
  }

  private doSeed() {
    this.seeding.set(true);
    this.result.set(null);
    this.error.set(null);

    this.mediaService.seed().subscribe({
      next: (res) => {
        this.result.set(res.seeded);
        this.seeding.set(false);
        this.mediaService.loadCatalogue();
        this.notification.success(`Catalogue seeded (${res.seeded} items)`);
      },
      error: (err) => {
        this.error.set(err.message ?? 'Unknown error');
        this.seeding.set(false);
      },
    });
  }

  getDisabledValues(def: SettingDefinition): unknown[] {
    if (def.key === 'embeddingModel') {
      return this.disabledEmbeddingModels();
    }
    return [];
  }

  getDisabledTooltip(def: SettingDefinition): string {
    if (def.key === 'embeddingModel') {
      return 'Requires API key for this provider';
    }
    return '';
  }

  private openConfirm(data: ConfirmDialogData) {
    return this.dialog.open(ConfirmDialogComponent, { data, autoFocus: 'dialog' }).afterClosed();
  }
}
