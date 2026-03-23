import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MessageThreadComponent } from './message-thread/message-thread.component';
import { ChatInputComponent } from './chat-input/chat-input.component';
import { MediaTreeComponent } from '../../shared/media-tree/media-tree.component';
import { ChatService } from '../../services/chat.service';
import { CourseService } from '../../services/course.service';

@Component({
  selector: 'app-chat',
  imports: [MediaTreeComponent, MessageThreadComponent, ChatInputComponent],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent {
  readonly chatService = inject(ChatService);
  readonly courseService = inject(CourseService);

  constructor() {
    this.courseService.loadTree();
  }
}
