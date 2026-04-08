import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  effect,
  viewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ChatService } from '../../../services/chat.service';
import { MarkdownPipe } from '../../../pipes/markdown.pipe';
import {
  LlmInspectDialogComponent,
  type LlmInspectDialogData,
} from '../../../shared/llm-inspect-dialog/llm-inspect-dialog.component';

@Component({
  selector: 'app-message-thread',
  imports: [MarkdownPipe],
  templateUrl: './message-thread.component.html',
  styleUrl: './message-thread.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageThreadComponent {
  readonly chatService = inject(ChatService);
  private dialog = inject(MatDialog);
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

  openInspect(llmCallId: string) {
    this.dialog.open(LlmInspectDialogComponent, {
      data: { llmCallId } satisfies LlmInspectDialogData,
      autoFocus: 'dialog',
      panelClass: 'inspect-dialog-panel',
      height: '90vh',
    });
  }
}
