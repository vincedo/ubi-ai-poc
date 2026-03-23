# Notification System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface errors and success messages to the user via toasts, replacing console-only error handling.

**Architecture:** A `NotificationService` wraps Angular Material's `MatSnackBar` with four severity methods (success/error/warning/info). An HTTP interceptor auto-catches `HttpClient` errors. Manual calls handle streaming errors and success confirmations.

**Tech Stack:** Angular 21, Angular Material 21 (`MatSnackBar`), RxJS, TypeScript 5.9

**Spec:** `docs/superpowers/specs/2026-03-26-notification-system-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `apps/frontend/src/app/services/notification.service.ts` | Wraps MatSnackBar with severity-typed methods |
| Modify | `apps/frontend/src/styles/_design-tokens.scss` | Add success/warning design tokens |
| Modify | `apps/frontend/src/styles.scss` | Global snackbar panel classes per severity |
| Modify | `apps/frontend/src/app/app.config.ts` | Flesh out HTTP error interceptor |
| Modify | `apps/frontend/src/app/services/chat.service.ts` | Add error toast for streaming failures |
| Modify | `apps/frontend/src/app/features/settings/settings.component.ts` | Add success toast for seed |
| Modify | `apps/frontend/src/app/features/ingestion/ingestion.component.ts` | Add success/error toasts for ingestion |
| Modify | `apps/frontend/src/app/services/ingestion.service.ts` | Add notification calls in subscribe handlers |
| Modify | `apps/frontend/src/app/features/enrichment/enrichment.component.ts` | Add success toast for save, success for generate |

---

### Task 1: Create NotificationService

**Files:**
- Create: `apps/frontend/src/app/services/notification.service.ts`

- [ ] **Step 1: Look up MatSnackBar docs**

Use context7 MCP to fetch current Angular Material MatSnackBar documentation. Verify the API for `open()`, `panelClass`, `duration`, and `verticalPosition` options.

- [ ] **Step 2: Create the service**

```typescript
// apps/frontend/src/app/services/notification.service.ts
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
```

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/frontend && npx ng build --configuration development 2>&1 | tail -5`
Expected: Build succeeds (service is tree-shakeable, no errors if unused)

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/services/notification.service.ts
git commit -m "feat: add NotificationService wrapping MatSnackBar"
```

---

### Task 2: Add Global Snackbar Styles

**Files:**
- Modify: `apps/frontend/src/styles/_design-tokens.scss` (add success/warning tokens)
- Modify: `apps/frontend/src/styles.scss` (append after line 75)

- [ ] **Step 1: Add design tokens and severity panel classes**

First, add new design tokens for success and warning severities to `apps/frontend/src/styles/_design-tokens.scss`:

```scss
// Add inside :root, after existing tokens
--color-success: #1b5e20;
--color-success-container: #e8f5e9;
--color-warning: #e65100;
--color-warning-container: #fff3e0;
```

Then append to `apps/frontend/src/styles.scss`:

```scss
// Snackbar severity styles (global because MatSnackBar renders in CDK overlay)
.snackbar-success .mdc-snackbar__surface {
  background: var(--color-success) !important;
  color: var(--color-success-container) !important;
}

.snackbar-error .mdc-snackbar__surface {
  background: var(--color-error) !important;
  color: var(--color-error-container) !important;
}

.snackbar-warning .mdc-snackbar__surface {
  background: var(--color-warning) !important;
  color: var(--color-warning-container) !important;
}

.snackbar-info .mdc-snackbar__surface {
  background: var(--color-primary) !important;
  color: var(--color-primary-fixed) !important;
}

// Style the action button text for all severity snackbars
.snackbar-success,
.snackbar-error,
.snackbar-warning,
.snackbar-info {
  .mat-mdc-snack-bar-action {
    color: inherit !important;
  }
}
```

Note: `!important` is needed because Material's snackbar styles have high specificity from the CDK overlay. This is a standard pattern for theming MatSnackBar.

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/frontend && npx ng build --configuration development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/styles/_design-tokens.scss apps/frontend/src/styles.scss
git commit -m "feat: add snackbar severity styles and design tokens for notification toasts"
```

---

### Task 3: Implement HTTP Error Interceptor

**Files:**
- Modify: `apps/frontend/src/app/app.config.ts:1-19`

- [ ] **Step 1: Flesh out the interceptor**

Replace the entire `app.config.ts` with:

```typescript
import {
  ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import {
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
  type HttpInterceptorFn,
} from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { routes } from './app.routes';
import { NotificationService } from './services/notification.service';

function extractErrorMessage(err: HttpErrorResponse): string {
  // API returns { error: 'message' }
  if (err.error?.error && typeof err.error.error === 'string') {
    return err.error.error;
  }
  if (err.status === 0) return 'Network error — check your connection';
  if (err.status === 404) return 'Not found';
  if (err.status >= 400 && err.status < 500) return 'Bad request';
  if (err.status >= 500) return 'Server error — please try again';
  return 'An unexpected error occurred';
}

const errorNotificationInterceptor: HttpInterceptorFn = (req, next) => {
  const notification = inject(NotificationService);
  return next(req).pipe(
    catchError((err: HttpErrorResponse) => {
      notification.error(extractErrorMessage(err));
      return throwError(() => err);
    }),
  );
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideHttpClient(withInterceptors([errorNotificationInterceptor])),
    provideRouter(routes),
  ],
};
```

Key points:
- Extracts message from API's `{ error: 'message' }` response format
- Falls back to generic messages by status code
- Re-throws the error so component subscribers can still handle cleanup
- Renamed from `errorLoggingInterceptor` to `errorNotificationInterceptor`

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/frontend && npx ng build --configuration development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/app.config.ts
git commit -m "feat: implement HTTP error interceptor with user-facing notifications"
```

---

### Task 4: Add Notification to Chat Streaming Errors

**Files:**
- Modify: `apps/frontend/src/app/services/chat.service.ts` (in `sendMessage()` method, lines 45-83)

- [ ] **Step 1: Inject NotificationService and add error calls**

Add import and inject the service:

```typescript
// Add to imports at top
import { NotificationService } from './notification.service';

// Add inside the class, after existing injects
private notification = inject(NotificationService);
```

Add notification calls to the two error paths in `sendMessage()`:

At line 72, after `this.markLastError('Request failed');`:
```typescript
this.notification.error('Request failed');
```

At line 78, after `this.markLastError('Connection error — try again');`:
```typescript
this.notification.error('Connection error — try again');
```

The existing `markLastError` calls stay — they update the chat bubble inline. The toast is an additional notification channel.

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/frontend && npx ng build --configuration development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/services/chat.service.ts
git commit -m "feat: add toast notifications for chat streaming errors"
```

---

### Task 5: Add Notifications to Ingestion Flow

**Files:**
- Modify: `apps/frontend/src/app/services/ingestion.service.ts` (in `runAll()` method, lines 41-71)

- [ ] **Step 1: Inject NotificationService**

Add import and inject:

```typescript
// Add to imports at top
import { NotificationService } from './notification.service';

// Add inside the class, after existing injects
private notification = inject(NotificationService);
```

- [ ] **Step 2: Add success notification in `runAll()` success handler**

In `runAll()`, inside the `next:` handler, add after the `this.logs.update(...)` block (after line 60):

```typescript
if (result.failed.length === 0) {
  this.notification.success('Ingestion complete');
} else {
  this.notification.warning(
    `Ingestion complete — ${result.failed.length} item(s) failed`,
  );
}
```

Note: The HTTP error path (line 62-68) is now handled by the interceptor automatically. The existing `error:` handler stays for component-specific cleanup (resetting states, updating logs).

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/frontend && npx ng build --configuration development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/services/ingestion.service.ts
git commit -m "feat: add toast notifications for ingestion completion"
```

---

### Task 6: Add Notifications to Enrichment Flow

**Files:**
- Modify: `apps/frontend/src/app/features/enrichment/enrichment.component.ts` (in `onEnrich()` and `onSave()` methods)

- [ ] **Step 1: Inject NotificationService**

Add import and inject:

```typescript
// Add to imports at top
import { NotificationService } from '../../services/notification.service';

// Add inside the class, after existing injects
private notification = inject(NotificationService);
```

- [ ] **Step 2: Add success toasts**

In `onEnrich()`, inside the `next:` handler (after `this.loading.set(false);` on line 46), add:

```typescript
this.notification.success('Enrichment complete');
```

In `onSave()`, inside the `next:` handler (after `this.saving.set(false);` on line 61), add:

```typescript
this.notification.success('Enrichment saved');
```

Note: The `error:` handlers in `onEnrich()` and `onSave()` don't need manual notification calls — the interceptor handles all `HttpClient` errors automatically. The existing `console.error()` calls and state cleanup stay.

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/frontend && npx ng build --configuration development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/features/enrichment/enrichment.component.ts
git commit -m "feat: add toast notifications for enrichment generate and save"
```

---

### Task 7: Add Notification to Settings Seed

**Files:**
- Modify: `apps/frontend/src/app/features/settings/settings.component.ts` (in `confirmSeed()` method)

- [ ] **Step 1: Inject NotificationService**

Add import and inject:

```typescript
// Add to imports at top
import { NotificationService } from '../../services/notification.service';

// Add inside the class, after existing injects
private notification = inject(NotificationService);
```

- [ ] **Step 2: Add success toast**

In `confirmSeed()`, inside the `next:` handler (after `this.mediaService.loadCatalogue();` on line 28), add:

```typescript
this.notification.success(`Catalogue seeded (${res.seeded} items)`);
```

Note: The `error:` handler is covered by the interceptor. The existing `this.error.set(...)` stays for inline display.

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/frontend && npx ng build --configuration development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/features/settings/settings.component.ts
git commit -m "feat: add toast notification for catalogue seed success"
```

---

### Task 8: Manual Smoke Test

- [ ] **Step 1: Start the app**

Run: `pnpm --filter frontend start`

- [ ] **Step 2: Test error toast**

Trigger an HTTP error (e.g. stop the API server and try an action). Verify:
- Red toast appears at bottom-center with the error message
- Toast auto-dismisses after 5 seconds
- "Close" button dismisses it immediately

- [ ] **Step 3: Test success toast**

Run an enrichment save or settings seed. Verify:
- Green toast appears with success message
- Toast auto-dismisses after 3 seconds

- [ ] **Step 4: Test streaming error**

Start a chat, then kill the API mid-stream. Verify:
- Red toast appears alongside the inline chat error message
- Both error channels work independently

- [ ] **Step 5: Test accessibility**

Open browser DevTools, inspect the snackbar element. Verify:
- `aria-live="polite"` is present on the snackbar container
- "Close" button is keyboard-focusable
- Color contrast meets WCAG AA (dark backgrounds with light text)
