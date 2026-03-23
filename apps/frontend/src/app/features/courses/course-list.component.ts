import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  OnInit,
  DestroyRef,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CourseService, type Course } from '../../services/course.service';

@Component({
  selector: 'app-course-list',
  imports: [DatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './course-list.component.html',
  styleUrl: './course-list.component.scss',
})
export class CourseListComponent implements OnInit {
  private courseService = inject(CourseService);
  private destroyRef = inject(DestroyRef);

  courses = signal<Course[]>([]);
  showCreate = signal(false);
  newTitle = signal('');
  newDescription = signal('');

  ngOnInit() {
    this.loadCourses();
  }

  private loadCourses() {
    this.courseService
      .getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (c) => this.courses.set(c),
        error: (err) => console.error('Failed to load courses:', err),
      });
  }

  createCourse() {
    const title = this.newTitle().trim();
    if (!title) return;
    this.courseService
      .create({ title, description: this.newDescription().trim() || undefined })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.cancelCreate();
          this.loadCourses();
        },
        error: (err) => console.error('Failed to create course:', err),
      });
  }

  cancelCreate() {
    this.showCreate.set(false);
    this.newTitle.set('');
    this.newDescription.set('');
  }

  onInputTitle(event: Event): void {
    this.newTitle.set((event.target as HTMLInputElement).value);
  }

  onInputDescription(event: Event): void {
    this.newDescription.set((event.target as HTMLInputElement).value);
  }
}
