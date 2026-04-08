import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { MessageThreadComponent } from './message-thread/message-thread.component';
import { ChatInputComponent } from './chat-input/chat-input.component';
import { SessionPanelComponent } from './session-panel/session-panel.component';
import { StatsBarComponent } from './stats-bar/stats-bar.component';
import { ChatService } from '../../services/chat.service';
import { PresetService } from '../../services/preset.service';

@Component({
  selector: 'app-chat',
  imports: [SessionPanelComponent, StatsBarComponent, MessageThreadComponent, ChatInputComponent],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent {
  readonly chatService = inject(ChatService);
  readonly presetService = inject(PresetService);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const sessionId = params.get('sessionId');
      if (sessionId) {
        this.chatService.loadSession(sessionId);
      } else {
        this.chatService.newChat();
      }
    });
    this.chatService.loadSessions();
    this.presetService.loadChatPresets();
  }
}
