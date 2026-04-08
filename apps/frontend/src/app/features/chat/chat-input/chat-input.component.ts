import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ChatService } from '../../../services/chat.service';
import { CourseService } from '../../../services/course.service';
import { PresetService } from '../../../services/preset.service';
import { MediaTreeComponent } from '../../../shared/media-tree/media-tree.component';

@Component({
  selector: 'app-chat-input',
  templateUrl: './chat-input.component.html',
  styleUrl: './chat-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTooltipModule, MediaTreeComponent],
})
export class ChatInputComponent {
  readonly chatService = inject(ChatService);
  readonly courseService = inject(CourseService);
  readonly presetService = inject(PresetService);

  popoverOpen = signal(false);

  /** Attachment and preset selection are locked once a session has been created. */
  attachmentLocked = computed(() => this.chatService.currentSessionId() !== null);

  /** Attach is only available when a preset is selected and the session hasn't started. */
  canAttach = computed(
    () => !this.attachmentLocked() && !!this.chatService.selectedChatPresetId(),
  );

  readonly donePresets = computed(() =>
    this.presetService.chatPresets().filter((p) => p.ingestionStatus === 'done'),
  );

  /** Resolve media IDs to titles for chip display. */
  selectedMedia = computed(() => {
    const ids = this.chatService.individualMediaIds();
    const tree = this.courseService.tree();
    return ids.map((id) => {
      for (const course of tree) {
        const media = course.media.find((m) => m.id === id);
        if (media) return { id: media.id, title: media.title, type: media.type };
      }
      return { id, title: 'Unknown media', type: 'unknown' };
    });
  });

  constructor() {
    this.courseService.loadTree();
  }

  togglePopover(): void {
    if (this.canAttach()) {
      this.popoverOpen.update((v) => !v);
    }
  }

  closePopover(): void {
    this.popoverOpen.set(false);
  }

  onPresetChange(event: Event): void {
    this.chatService.selectedChatPresetId.set((event.target as HTMLSelectElement).value);
  }

  removeMedia(mediaId: string): void {
    this.chatService.individualMediaIds.update((ids) => ids.filter((id) => id !== mediaId));
  }

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
    void this.chatService.sendMessage(text);
  }
}
