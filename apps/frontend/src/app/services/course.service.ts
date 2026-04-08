import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../api-base-url.token';
import type { CourseWithMedia } from '@ubi-ai/shared';

export interface Course {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
}

export interface CourseDetail extends Course {
  media: Array<{
    id: string;
    title: string;
    type: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class CourseService {
  private http = inject(HttpClient);
  private readonly API = inject(API_BASE_URL);

  /** Shared tree signal — loaded once, consumed by multiple components. */
  readonly tree = signal<CourseWithMedia[]>([]);
  readonly treeLoading = signal(false);

  getTree(): Observable<CourseWithMedia[]> {
    return this.http.get<CourseWithMedia[]>(`${this.API}/courses/tree`);
  }

  /** Call once at app startup or when tree data is needed. */
  loadTree(): void {
    this.treeLoading.set(true);
    this.getTree().subscribe({
      next: (tree) => {
        this.tree.set(tree);
        this.treeLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load course tree:', err);
        this.treeLoading.set(false);
      },
    });
  }

  getAll(): Observable<Course[]> {
    return this.http.get<Course[]>(`${this.API}/courses`);
  }

  getById(id: string): Observable<CourseDetail> {
    return this.http.get<CourseDetail>(`${this.API}/courses/${id}`);
  }

  create(data: { title: string; description?: string }): Observable<Course> {
    return this.http.post<Course>(`${this.API}/courses`, data);
  }

  update(id: string, data: { title?: string; description?: string }): Observable<Course> {
    return this.http.put<Course>(`${this.API}/courses/${id}`, data);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/courses/${id}`);
  }

  addMedia(courseId: string, mediaId: string): Observable<void> {
    return this.http.post<void>(`${this.API}/courses/${courseId}/media`, { mediaId });
  }

  removeMedia(courseId: string, mediaId: string): Observable<void> {
    return this.http.delete<void>(`${this.API}/courses/${courseId}/media/${mediaId}`);
  }

  updateMediaOrder(courseId: string, orderedMediaIds: string[]): Observable<void> {
    return this.http.patch<void>(`${this.API}/courses/${courseId}/media/order`, {
      orderedMediaIds,
    });
  }
}
