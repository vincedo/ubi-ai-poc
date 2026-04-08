import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ChatService } from '../../../services/chat.service';
import { FormatCostPipe } from '../../../shared/pipes/format-cost.pipe';

@Component({
  selector: 'app-stats-bar',
  imports: [DecimalPipe, FormatCostPipe],
  templateUrl: './stats-bar.component.html',
  styleUrl: './stats-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsBarComponent {
  readonly chatService = inject(ChatService);
}
