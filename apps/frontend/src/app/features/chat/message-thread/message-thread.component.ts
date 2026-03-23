import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  effect,
  viewChild,
} from '@angular/core';
import { ChatService } from '../../../services/chat.service';
import { MarkdownPipe } from '../../../pipes/markdown.pipe';

@Component({
  selector: 'app-message-thread',
  imports: [MarkdownPipe],
  templateUrl: './message-thread.component.html',
  styleUrl: './message-thread.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageThreadComponent {
  readonly chatService = inject(ChatService);
  private scrollContainer = viewChild<ElementRef>('scrollContainer');

  constructor() {
    effect(() => {
      this.chatService.messages(); // track signal
      const el = this.scrollContainer()?.nativeElement;
      if (el) setTimeout(() => (el.scrollTop = el.scrollHeight), 0);
    });
  }

  sourceIcon = (type: string) => (type === 'pdf' ? 'description' : 'play_circle');
  sourceLabel = (type: string) => (type === 'pdf' ? 'description' : 'play_circle');
}
