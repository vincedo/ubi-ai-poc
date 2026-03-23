import type { SettingsValues } from '@ubi-ai/shared';

export interface SettingsRepository {
  get(): Promise<SettingsValues>;
  update(values: SettingsValues): Promise<SettingsValues>;
}
