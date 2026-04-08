import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '../shared/confirm-dialog/confirm-dialog.component';
import { ResetService } from '../services/reset.service';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShellComponent {
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private resetService = inject(ResetService);
  private notification = inject(NotificationService);

  readonly isResetting = this.resetService.isResetting;

  async confirmReset(): Promise<void> {
    const data: ConfirmDialogData = {
      title: 'Reset everything?',
      message:
        'This will permanently delete all media, courses, chat sessions, presets, and vector embeddings. This cannot be undone.',
      confirmLabel: 'Reset everything',
      cancelLabel: 'Cancel',
      confirmColor: 'danger',
    };

    const confirmed = await firstValueFrom(
      this.dialog.open(ConfirmDialogComponent, { data, autoFocus: 'dialog' }).afterClosed(),
    );

    if (!confirmed) return;

    try {
      await this.resetService.resetAll();
      this.notification.success('All data has been reset');
      await this.router.navigate(['/enrich']);
    } catch {
      console.error('Reset failed');
    }
  }
}
