import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { SettingOption } from '@ubi-ai/shared';

@Component({
  selector: 'app-setting-radio-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './setting-radio-group.component.html',
  styleUrl: './setting-radio-group.component.scss',
})
export class SettingRadioGroupComponent {
  label = input.required<string>();
  description = input<string>();
  options = input.required<SettingOption<unknown>[]>();
  value = input.required<unknown>();
  disabledValues = input<unknown[]>([]);
  disabledTooltip = input<string>('');
  name = input.required<string>();

  valueChange = output<unknown>();

  onSelect(optionValue: unknown) {
    this.valueChange.emit(optionValue);
  }
}
