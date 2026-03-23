import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

type Severity = 'success' | 'error' | 'warning' | 'info';

const DURATION: Record<Severity, number> = {
  success: 3000,
  error: 5000,
  warning: 5000,
  info: 3000,
};

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error');
  }

  warning(message: string): void {
    this.show(message, 'warning');
  }

  info(message: string): void {
    this.show(message, 'info');
  }

  private show(message: string, severity: Severity): void {
    this.snackBar.open(message, 'Close', {
      duration: DURATION[severity],
      panelClass: `snackbar-${severity}`,
    });
  }
}
