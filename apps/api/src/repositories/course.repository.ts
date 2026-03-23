import type { Course, NewCourse } from '../db/schema/course.js';
import type { Media } from '../db/schema/media.js';

export interface CourseRepository {
  findAll(): Promise<Course[]>;
  findById(id: string): Promise<Course | null>;
  create(data: NewCourse): Promise<Course>;
  update(id: string, data: Partial<NewCourse>): Promise<Course>;
  /** Deletes the course and any media that would become orphans. Returns orphaned media IDs. */
  delete(id: string): Promise<string[]>;
  addMedia(courseId: string, mediaId: string): Promise<void>;
  removeMedia(courseId: string, mediaId: string): Promise<void>;
  updateMediaOrder(courseId: string, orderedMediaIds: string[]): Promise<void>;
  getMedia(courseId: string): Promise<Media[]>;
  findAllWithMedia(): Promise<Array<Course & { media: Media[] }>>;
  countCoursesForMedia(mediaId: string): Promise<number>;
}
