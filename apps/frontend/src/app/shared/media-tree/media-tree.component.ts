import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import type { CourseWithMedia, MediaItem } from '@ubi-ai/shared';

@Component({
  selector: 'app-media-tree',
  templateUrl: './media-tree.component.html',
  styleUrl: './media-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaTreeComponent {
  courseTree = input.required<CourseWithMedia[]>();
  selectionMode = input.required<'checkboxes' | 'radio'>();
  title = input.required<string>();

  selectedMediaIds = model<string[]>([]);
  selectedMediaId = model<string | null>(null);

  mediaSelected = output<string>();

  expandedCourseIds = signal<Set<string>>(new Set());
  private initialized = false;

  selectedCount = computed(() => this.selectedMediaIds().length);

  constructor() {
    /** Auto-expand all courses when the tree first loads. */
    effect(() => {
      const tree = this.courseTree();
      if (tree.length > 0 && !this.initialized) {
        this.initialized = true;
        this.expandedCourseIds.set(new Set(tree.map((c) => c.id)));
      }
    });
  }

  isExpanded(courseId: string): boolean {
    return this.expandedCourseIds().has(courseId);
  }

  toggleExpand(courseId: string): void {
    this.expandedCourseIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  }

  // --- Checkboxes mode ---

  isMediaSelected(mediaId: string): boolean {
    return this.selectedMediaIds().includes(mediaId);
  }

  isCourseFullySelected(course: CourseWithMedia): boolean {
    if (course.media.length === 0) return false;
    return course.media.every((m) => this.selectedMediaIds().includes(m.id));
  }

  isCoursePartiallySelected(course: CourseWithMedia): boolean {
    const ids = this.selectedMediaIds();
    const selectedCount = course.media.filter((m) => ids.includes(m.id)).length;
    return selectedCount > 0 && selectedCount < course.media.length;
  }

  toggleMedia(mediaId: string): void {
    this.selectedMediaIds.update((ids) =>
      ids.includes(mediaId) ? ids.filter((id) => id !== mediaId) : [...ids, mediaId],
    );
  }

  toggleCourse(course: CourseWithMedia): void {
    const allSelected = this.isCourseFullySelected(course);
    const courseMediaIds = course.media.map((m) => m.id);
    this.selectedMediaIds.update((ids) => {
      if (allSelected) {
        return ids.filter((id) => !courseMediaIds.includes(id));
      } else {
        return [...new Set([...ids, ...courseMediaIds])];
      }
    });
  }

  // --- Radio mode ---

  selectMedia(media: MediaItem): void {
    this.selectedMediaId.set(media.id);
    this.mediaSelected.emit(media.id);
  }

  // --- Shared helpers ---

  iconFor(type: string): string {
    return (
      ({ video: 'movie', audio: 'audio_file', pdf: 'picture_as_pdf' } as Record<string, string>)[
        type
      ] ?? 'article'
    );
  }
}
