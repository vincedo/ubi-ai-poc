import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
  DestroyRef,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CourseService, type CourseDetail } from '../../services/course.service';
import { MediaService } from '../../services/media.service';
import type { MediaItem } from '@ubi-ai/shared';

@Component({
  selector: 'app-course-detail',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './course-detail.component.html',
  styleUrl: './course-detail.component.scss',
})
export class CourseDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private courseService = inject(CourseService);
  private mediaService = inject(MediaService);
  private destroyRef = inject(DestroyRef);

  course = signal<CourseDetail | null>(null);
  loading = signal(true);
  editing = signal(false);
  editTitle = signal('');
  editDescription = signal('');
  showAddMedia = signal(false);
  availableMedia = signal<MediaItem[]>([]);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.loadCourse(id);
  }

  private loadCourse(id: string) {
    this.loading.set(true);
    this.courseService
      .getById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (c) => {
          this.course.set(c);
          this.loading.set(false);
          this.refreshAvailableMedia(c);
        },
        error: (err) => {
          console.error('Failed to load course:', err);
          this.course.set(null);
          this.loading.set(false);
        },
      });
  }

  private refreshAvailableMedia(c: CourseDetail) {
    const courseMediaIds = new Set(c.media.map((m) => m.id));
    this.availableMedia.set(this.mediaService.catalogue().filter((m) => !courseMediaIds.has(m.id)));
  }

  startEdit() {
    const c = this.course()!;
    this.editTitle.set(c.title);
    this.editDescription.set(c.description ?? '');
    this.editing.set(true);
  }

  saveEdit() {
    const c = this.course()!;
    this.courseService
      .update(c.id, {
        title: this.editTitle(),
        description: this.editDescription() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.editing.set(false);
          this.loadCourse(c.id);
        },
        error: (err) => console.error('Failed to save course:', err),
      });
  }

  addMedia(mediaId: string) {
    const c = this.course()!;
    this.courseService
      .addMedia(c.id, mediaId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadCourse(c.id),
        error: (err) => console.error('Failed to add media:', err),
      });
  }

  removeMedia(mediaId: string) {
    const c = this.course()!;
    this.courseService
      .removeMedia(c.id, mediaId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadCourse(c.id),
        error: (err) => console.error('Failed to remove media:', err),
      });
  }

  moveMedia(fromIndex: number, toIndex: number) {
    const c = this.course()!;
    const ids = c.media.map((m) => m.id);
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, moved);
    this.courseService
      .updateMediaOrder(c.id, ids)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.loadCourse(c.id),
        error: (err) => console.error('Failed to reorder media:', err),
      });
  }

  onInputTitle(event: Event): void {
    this.editTitle.set((event.target as HTMLInputElement).value);
  }

  onInputDescription(event: Event): void {
    this.editDescription.set((event.target as HTMLInputElement).value);
  }
}
