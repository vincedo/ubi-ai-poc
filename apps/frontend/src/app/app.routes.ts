import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'enrich',
    loadComponent: () =>
      import('./features/enrichment/enrichment.component').then((m) => m.EnrichmentComponent),
  },
  {
    path: 'enrich/:mediaId',
    loadComponent: () =>
      import('./features/enrichment/enrichment.component').then((m) => m.EnrichmentComponent),
  },
  {
    path: 'chat',
    loadComponent: () => import('./features/chat/chat.component').then((m) => m.ChatComponent),
  },
  {
    path: 'ingest',
    loadComponent: () =>
      import('./features/ingestion/ingestion.component').then((m) => m.IngestionComponent),
  },
  {
    path: 'courses',
    loadComponent: () =>
      import('./features/courses/course-list.component').then((m) => m.CourseListComponent),
  },
  {
    path: 'courses/:id',
    loadComponent: () =>
      import('./features/courses/course-detail.component').then((m) => m.CourseDetailComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then((m) => m.SettingsComponent),
  },
  { path: '', redirectTo: 'enrich', pathMatch: 'full' },
];
