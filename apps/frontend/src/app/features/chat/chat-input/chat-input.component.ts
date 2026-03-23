import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ChatService } from '../../../services/chat.service';
import { LANGUAGE_MODELS } from '@ubi-ai/shared';

@Component({
  selector: 'app-chat-input',
  templateUrl: './chat-input.component.html',
  styleUrl: './chat-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatSelectModule],
})
export class ChatInputComponent {
  readonly chatService = inject(ChatService);
  readonly models = LANGUAGE_MODELS;

  onKeydown(event: KeyboardEvent, textarea: HTMLTextAreaElement) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send(textarea);
    }
  }

  send(textarea: HTMLTextAreaElement) {
    const text = textarea.value.trim();
    if (!text || this.chatService.isStreaming()) return;
    textarea.value = '';
    this.chatService.sendMessage(text).catch(() => {
      // Error already handled inside sendMessage (markLastError)
    });
  }
}
