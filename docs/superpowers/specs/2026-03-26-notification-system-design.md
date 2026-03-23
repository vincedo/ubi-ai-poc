# Notification System Design

## Problem

Errors in the app are logged via `console.error()` but not surfaced to the user. There is no centralized notification mechanism — errors are handled inconsistently across features (console-only, inline text, chat bubbles, log panels).

## Scope

- HTTP/API errors (4xx, 5xx)
- Streaming errors (chat fetch failures)
- Network errors (offline/connectivity)
- Success confirmations (save, delete operations)
- Warning and info notifications

**Out of scope:** Form validation errors (remain inline).

## Approach

Thin wrapper service around Angular Material's `MatSnackBar`, combined with an HTTP interceptor for automatic error capture.

## NotificationService

A singleton service (`providedIn: 'root'`) with four convenience methods:

```typescript
success(message: string): void  // green, auto-dismiss 3s
error(message: string): void    // red, auto-dismiss 5s
warning(message: string): void  // orange, auto-dismiss 5s
info(message: string): void     // blue, auto-dismiss 3s
```

All toasts:
- Auto-dismiss after their configured duration
- Show a "Close" action button for manual dismissal
- Render at bottom-center (MatSnackBar default)
- Latest replaces previous (MatSnackBar default stacking)
- Use `aria-live="polite"` (MatSnackBar default)

Each method calls `MatSnackBar.open()` with a severity-specific `panelClass`.

**File:** `apps/frontend/src/app/services/notification.service.ts`

## HTTP Error Interceptor

The existing `errorLoggingInterceptor` stub in `app.config.ts` is fleshed out to:

1. Intercept all `HttpClient` errors via `catchError` in the RxJS pipeline
2. Extract a user-friendly message from `err.error?.error` (the API's `{ error: 'message' }` format)
3. Fall back to generic messages based on status code:
   - Status 0: "Network error — check your connection"
   - 400: "Bad request"
   - 404: "Not found"
   - 5xx: "Server error — please try again"
4. Call `notificationService.error()` with the extracted message
5. Re-throw the error so individual subscribers can still handle component-specific cleanup (reset loading state, etc.)

The existing `console.error()` calls in services remain for dev debugging. The interceptor layers on top — it does not replace them.

**File:** `apps/frontend/src/app/app.config.ts` (modify existing stub)

## Styling

Four global CSS classes applied via MatSnackBar's `panelClass` option. Defined in global `styles.scss` since MatSnackBar renders in the CDK overlay, outside component scope.

| Class | Background | Text Color | Source |
|-------|-----------|------------|--------|
| `snackbar-success` | `#1b5e20` | `#e8f5e9` | Standard Material green |
| `snackbar-error` | `var(--color-error)` (#ba1a1a) | `var(--color-error-container)` (#ffdad6) | Design tokens |
| `snackbar-warning` | `#e65100` | `#fff3e0` | Standard Material orange |
| `snackbar-info` | `var(--color-primary)` (#00478d) | `var(--color-primary-fixed)` (#d6e3ff) | Design tokens |

**File:** `apps/frontend/src/styles.scss`

## Manual Integration Points

These files need explicit `NotificationService` calls added alongside existing logic:

| File | Call | Trigger |
|------|------|---------|
| `chat.service.ts` | `error('Connection lost — try again')` | Streaming fetch failure |
| `settings.component.ts` | `success('Settings saved')` | Successful save |
| `ingestion.component.ts` | `success('Ingestion complete')` | Job completion |
| `enrichment.component.ts` | `success('Enrichment complete')` | Generation done |

Future delete operations should call `success('Item deleted')`.

## Files Summary

| Action | File |
|--------|------|
| Create | `apps/frontend/src/app/services/notification.service.ts` |
| Modify | `apps/frontend/src/app/app.config.ts` |
| Modify | `apps/frontend/src/styles.scss` |
| Modify | `apps/frontend/src/app/features/chat/chat.service.ts` |
| Modify | `apps/frontend/src/app/features/settings/settings.component.ts` |
| Modify | `apps/frontend/src/app/features/ingestion/ingestion.component.ts` |
| Modify | `apps/frontend/src/app/features/enrichment/enrichment.component.ts` |

## Testing

- Unit test for `NotificationService` — verify each method calls `MatSnackBar.open()` with correct panelClass and duration
- Unit test for the interceptor — verify it extracts messages from API error responses and calls `notificationService.error()`
- Manual verification of toast appearance and auto-dismiss behavior
