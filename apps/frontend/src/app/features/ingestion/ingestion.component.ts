import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IngestionService } from '../../services/ingestion.service';
import { MediaService } from '../../services/media.service';
import { PresetService } from '../../services/preset.service';
import { NotificationService } from '../../services/notification.service';
import { SETTINGS_DEFINITIONS } from '@ubi-ai/shared';
import type { ChatPreset, SettingDefinition } from '@ubi-ai/shared';

@Component({
  selector: 'app-ingestion',
  templateUrl: './ingestion.component.html',
  styleUrl: './ingestion.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
})
export class IngestionComponent implements OnInit {
  readonly ingestionService = inject(IngestionService);
  readonly mediaService = inject(MediaService);
  readonly presetService = inject(PresetService);
  private readonly notification = inject(NotificationService);

  readonly runningPresetId = signal<string | null>(null);

  async ngOnInit() {
    this.mediaService.loadCatalogue();
    await this.presetService.loadChatPresets();
  }

  async runAll(preset: ChatPreset) {
    this.runningPresetId.set(preset.id);
    await this.ingestionService.runAll(preset.id);
    await this.presetService.loadChatPresets();
    this.runningPresetId.set(null);
  }

  private readonly embeddingModelDef = SETTINGS_DEFINITIONS.find(
    (d) => d.key === 'embeddingModel',
  ) as Extract<SettingDefinition, { type: 'string' }>;

  embeddingLabel(model: string): string {
    return this.embeddingModelDef.options?.find((o) => o.value === model)?.label ?? model;
  }

  async reset(preset: ChatPreset) {
    this.runningPresetId.set(preset.id);
    await this.ingestionService.reset(preset.id);
    await this.presetService.loadChatPresets();
    this.runningPresetId.set(null);
    this.notification.success('Preset reset');
  }
}
