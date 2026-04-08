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
  if (err.status === 401) return 'Unauthorized — please log in';
  if (err.status === 403) return 'Forbidden — you do not have permission';
  if (err.status === 404) return 'Not found';
  if (err.status >= 400 && err.status < 500) return 'Bad request';
  if (err.status === 503) return 'Service unavailable — please try again later';
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
