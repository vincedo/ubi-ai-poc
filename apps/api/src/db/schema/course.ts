import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { media } from './media.js';

export const course = sqliteTable('course', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const courseMedia = sqliteTable(
  'course_media',
  {
    courseId: text('course_id')
      .notNull()
      .references(() => course.id),
    mediaId: text('media_id')
      .notNull()
      .references(() => media.id),
    order: integer('order').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.courseId, table.mediaId] })],
);

export type Course = typeof course.$inferSelect;
export type NewCourse = typeof course.$inferInsert;

export type CourseMedia = typeof courseMedia.$inferSelect;
export type NewCourseMedia = typeof courseMedia.$inferInsert;
