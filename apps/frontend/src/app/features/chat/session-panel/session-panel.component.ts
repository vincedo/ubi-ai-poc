import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChatService, type ChatSessionSummary } from '../../../services/chat.service';
import { FormatTokensPipe } from '../../../shared/pipes/format-tokens.pipe';
import { FormatCostPipe } from '../../../shared/pipes/format-cost.pipe';

@Component({
  selector: 'app-session-panel',
  imports: [DatePipe, FormsModule, FormatTokensPipe, FormatCostPipe],
  templateUrl: './session-panel.component.html',
  styleUrl: './session-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionPanelComponent {
  readonly chatService = inject(ChatService);
  private readonly router = inject(Router);

  confirmingDeleteId = signal<string | null>(null);
  editingSessionId = signal<string | null>(null);
  editingTitle = signal('');

  constructor() {
    this.chatService.loadSessions();
  }

  selectSession(session: ChatSessionSummary): void {
    this.router.navigate(['/chat', session.id]);
  }

  startRename(event: Event, session: ChatSessionSummary): void {
    event.stopPropagation();
    this.editingSessionId.set(session.id);
    this.editingTitle.set(session.title || 'Untitled conversation');
  }

  commitRename(sessionId: string): void {
    const title = this.editingTitle().trim();
    if (title) {
      this.chatService.renameSession(sessionId, title);
    }
    this.editingSessionId.set(null);
  }

  cancelRename(): void {
    this.editingSessionId.set(null);
  }

  onRenameKeydown(event: KeyboardEvent, sessionId: string): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitRename(sessionId);
    } else if (event.key === 'Escape') {
      this.cancelRename();
    }
  }

  startDelete(event: Event, id: string): void {
    event.stopPropagation();
    this.confirmingDeleteId.set(id);
  }

  confirmDelete(event: Event, id: string): void {
    event.stopPropagation();
    this.chatService.deleteSession(id);
    this.confirmingDeleteId.set(null);
  }

  cancelDelete(event: Event): void {
    event.stopPropagation();
    this.confirmingDeleteId.set(null);
  }

  onDeleteKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.confirmingDeleteId.set(null);
    }
  }
}
