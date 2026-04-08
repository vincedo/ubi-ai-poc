import { eq, asc, sql, inArray } from 'drizzle-orm';
import { course, courseMedia } from '../db/schema/course.js';
import { media, mediaTranscript } from '../db/schema/media.js';
import { enrichmentResult, enrichmentJob } from '../db/schema/enrichment.js';
import { transcriptionJob } from '../db/schema/ingestion.js';
import type { Course, NewCourse } from '../db/schema/course.js';
import type { Media } from '../db/schema/media.js';
import type { AppDatabase } from '../plugins/db.js';
import type { CourseRepository } from './course.repository.js';

export class SqliteCourseRepository implements CourseRepository {
  constructor(private db: AppDatabase) {}

  async findAll(): Promise<Course[]> {
    return this.db.select().from(course);
  }

  async findById(id: string): Promise<Course | null> {
    const rows = await this.db.select().from(course).where(eq(course.id, id));
    return rows[0] ?? null;
  }

  async create(data: NewCourse): Promise<Course> {
    const rows = await this.db.insert(course).values(data).returning();
    return rows[0];
  }

  async update(id: string, data: Partial<NewCourse>): Promise<Course> {
    const rows = await this.db.update(course).set(data).where(eq(course.id, id)).returning();
    return rows[0];
  }

  async delete(id: string): Promise<string[]> {
    // Find media that would become orphans (only linked to this course)
    const rows = await this.db
      .select({ mediaId: courseMedia.mediaId })
      .from(courseMedia)
      .where(eq(courseMedia.courseId, id));

    const orphanedMediaIds: string[] = [];
    for (const row of rows) {
      const count = await this.countCoursesForMedia(row.mediaId);
      if (count <= 1) {
        orphanedMediaIds.push(row.mediaId);
      }
    }

    // Remove all course_media associations for this course
    await this.db.delete(courseMedia).where(eq(courseMedia.courseId, id));

    // Cascade-delete orphaned media and all their dependent data
    if (orphanedMediaIds.length > 0) {
      await this.db.delete(enrichmentJob).where(inArray(enrichmentJob.mediaId, orphanedMediaIds));
      await this.db
        .delete(enrichmentResult)
        .where(inArray(enrichmentResult.mediaId, orphanedMediaIds));
      await this.db
        .delete(transcriptionJob)
        .where(inArray(transcriptionJob.mediaId, orphanedMediaIds));
      await this.db
        .delete(mediaTranscript)
        .where(inArray(mediaTranscript.mediaId, orphanedMediaIds));
      await this.db.delete(media).where(inArray(media.id, orphanedMediaIds));
    }

    // Delete the course itself
    await this.db.delete(course).where(eq(course.id, id));

    return orphanedMediaIds;
  }

  async addMedia(courseId: string, mediaId: string): Promise<void> {
    const nextOrder = sql<number>`COALESCE((SELECT MAX(${courseMedia.order}) FROM ${courseMedia} WHERE ${courseMedia.courseId} = ${courseId}), 0) + 1`;
    await this.db.insert(courseMedia).values({ courseId, mediaId, order: nextOrder });
  }

  async removeMedia(courseId: string, mediaId: string): Promise<void> {
    await this.db
      .delete(courseMedia)
      .where(sql`${courseMedia.courseId} = ${courseId} AND ${courseMedia.mediaId} = ${mediaId}`);
  }

  async updateMediaOrder(courseId: string, orderedMediaIds: string[]): Promise<void> {
    for (let i = 0; i < orderedMediaIds.length; i++) {
      await this.db
        .update(courseMedia)
        .set({ order: i + 1 })
        .where(
          sql`${courseMedia.courseId} = ${courseId} AND ${courseMedia.mediaId} = ${orderedMediaIds[i]}`,
        );
    }
  }

  async findAllWithMedia(): Promise<Array<Course & { media: Media[] }>> {
    const courses = await this.db.select().from(course);
    const rows = await this.db
      .select({ courseId: courseMedia.courseId, media })
      .from(courseMedia)
      .innerJoin(media, eq(courseMedia.mediaId, media.id))
      .orderBy(asc(courseMedia.courseId), asc(courseMedia.order));

    const mediaByCourseId = new Map<string, Media[]>();
    for (const row of rows) {
      const list = mediaByCourseId.get(row.courseId) ?? [];
      list.push(row.media);
      mediaByCourseId.set(row.courseId, list);
    }

    return courses.map((c) => ({
      ...c,
      media: mediaByCourseId.get(c.id) ?? [],
    }));
  }

  async countCoursesForMedia(mediaId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(courseMedia)
      .where(eq(courseMedia.mediaId, mediaId));
    return Number(rows[0].count);
  }

  async getMedia(courseId: string): Promise<Media[]> {
    const rows = await this.db
      .select({ media })
      .from(courseMedia)
      .innerJoin(media, eq(courseMedia.mediaId, media.id))
      .where(eq(courseMedia.courseId, courseId))
      .orderBy(asc(courseMedia.order));
    return rows.map((r) => r.media);
  }
}
