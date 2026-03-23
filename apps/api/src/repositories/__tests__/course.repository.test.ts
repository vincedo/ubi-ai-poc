import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb, type TestDatabase } from './test-db.js';
import { SqliteCourseRepository } from '../sqlite-course.repository.js';
import { SqliteMediaRepository } from '../sqlite-media.repository.js';

let db: TestDatabase;
let courseRepo: SqliteCourseRepository;
let mediaRepo: SqliteMediaRepository;

beforeEach(async () => {
  db = createTestDb();
  courseRepo = new SqliteCourseRepository(db);
  mediaRepo = new SqliteMediaRepository(db);

  await mediaRepo.save({
    id: 'm1',
    title: 'Video 1',
    type: 'video',
    teacher: 'Alice',
    transcriptionStatus: 'none',
    ingestionStatus: 'none',
  });
  await mediaRepo.save({
    id: 'm2',
    title: 'Video 2',
    type: 'video',
    teacher: 'Bob',
    transcriptionStatus: 'none',
    ingestionStatus: 'none',
  });
  await mediaRepo.save({
    id: 'm3',
    title: 'PDF 1',
    type: 'pdf',
    teacher: 'Alice',
    transcriptionStatus: 'none',
    ingestionStatus: 'none',
  });
});

describe('SqliteCourseRepository', () => {
  it('create and findById', async () => {
    const created = await courseRepo.create({ id: 'c1', title: 'Course 1' });
    expect(created.title).toBe('Course 1');

    const found = await courseRepo.findById('c1');
    expect(found!.title).toBe('Course 1');
  });

  it('update course metadata', async () => {
    await courseRepo.create({ id: 'c1', title: 'Old Title' });
    const updated = await courseRepo.update('c1', { title: 'New Title' });
    expect(updated.title).toBe('New Title');
  });

  it('delete course removes course, course_media, and orphaned media', async () => {
    await courseRepo.create({ id: 'c1', title: 'Course 1' });
    await courseRepo.addMedia('c1', 'm1');
    const deletedMediaIds = await courseRepo.delete('c1');

    expect(await courseRepo.findById('c1')).toBeNull();
    expect(deletedMediaIds).toEqual(['m1']);
    expect(await mediaRepo.findById('m1')).toBeNull();
  });

  it('delete course preserves media shared with another course', async () => {
    await courseRepo.create({ id: 'c1', title: 'Course 1' });
    await courseRepo.create({ id: 'c2', title: 'Course 2' });
    await courseRepo.addMedia('c1', 'm1');
    await courseRepo.addMedia('c2', 'm1'); // m1 shared between c1 and c2
    await courseRepo.addMedia('c1', 'm2'); // m2 only in c1

    const deletedMediaIds = await courseRepo.delete('c1');

    expect(await courseRepo.findById('c1')).toBeNull();
    expect(deletedMediaIds).toEqual(['m2']);
    // m1 survives because it's still in c2
    expect(await mediaRepo.findById('m1')).not.toBeNull();
    // m2 was orphaned and deleted
    expect(await mediaRepo.findById('m2')).toBeNull();
  });

  it('addMedia assigns incrementing order', async () => {
    await courseRepo.create({ id: 'c1', title: 'Course 1' });
    await courseRepo.addMedia('c1', 'm1');
    await courseRepo.addMedia('c1', 'm2');

    const mediaList = await courseRepo.getMedia('c1');
    expect(mediaList).toHaveLength(2);
    expect(mediaList[0].id).toBe('m1');
    expect(mediaList[1].id).toBe('m2');
  });

  it('addMedia first item gets order 1', async () => {
    await courseRepo.create({ id: 'c1', title: 'Course 1' });
    await courseRepo.addMedia('c1', 'm1');
    const mediaList = await courseRepo.getMedia('c1');
    expect(mediaList).toHaveLength(1);
  });

  it('removeMedia', async () => {
    await courseRepo.create({ id: 'c1', title: 'Course 1' });
    await courseRepo.addMedia('c1', 'm1');
    await courseRepo.addMedia('c1', 'm2');
    await courseRepo.removeMedia('c1', 'm1');

    const mediaList = await courseRepo.getMedia('c1');
    expect(mediaList).toHaveLength(1);
    expect(mediaList[0].id).toBe('m2');
  });

  it('updateMediaOrder reorders items', async () => {
    await courseRepo.create({ id: 'c1', title: 'Course 1' });
    await courseRepo.addMedia('c1', 'm1');
    await courseRepo.addMedia('c1', 'm2');
    await courseRepo.addMedia('c1', 'm3');

    await courseRepo.updateMediaOrder('c1', ['m3', 'm1', 'm2']);
    const mediaList = await courseRepo.getMedia('c1');
    expect(mediaList.map((m) => m.id)).toEqual(['m3', 'm1', 'm2']);
  });

  it('findById returns null for nonexistent course', async () => {
    const found = await courseRepo.findById('nonexistent-course');
    expect(found).toBeNull();
  });

  it('addMedia twice with same media id throws', async () => {
    await courseRepo.create({ id: 'c1', title: 'Course 1' });
    await courseRepo.addMedia('c1', 'm1');

    await expect(courseRepo.addMedia('c1', 'm1')).rejects.toThrow();
  });

  it('listAll returns all courses', async () => {
    await courseRepo.create({ id: 'c1', title: 'Course 1' });
    await courseRepo.create({ id: 'c2', title: 'Course 2' });

    const all = await courseRepo.findAll();
    expect(all).toHaveLength(2);
    expect(all.map((c) => c.id)).toEqual(expect.arrayContaining(['c1', 'c2']));
  });

  it('delete nonexistent course does not throw', async () => {
    await expect(courseRepo.delete('nonexistent-course')).resolves.not.toThrow();
  });

  it('findAllWithMedia returns courses with nested media', async () => {
    await courseRepo.create({ id: 'c1', title: 'Course 1' });
    await courseRepo.create({ id: 'c2', title: 'Course 2' });
    await courseRepo.addMedia('c1', 'm1');
    await courseRepo.addMedia('c1', 'm2');
    await courseRepo.addMedia('c2', 'm3');

    const tree = await courseRepo.findAllWithMedia();
    expect(tree).toHaveLength(2);

    const c1 = tree.find((c) => c.id === 'c1')!;
    expect(c1.media).toHaveLength(2);
    expect(c1.media.map((m) => m.id)).toEqual(['m1', 'm2']);

    const c2 = tree.find((c) => c.id === 'c2')!;
    expect(c2.media).toHaveLength(1);
    expect(c2.media[0].id).toBe('m3');
  });

  it('findAllWithMedia returns empty media array for course with no media', async () => {
    await courseRepo.create({ id: 'c1', title: 'Empty Course' });

    const tree = await courseRepo.findAllWithMedia();
    expect(tree).toHaveLength(1);
    expect(tree[0].media).toEqual([]);
  });

  it('countCoursesForMedia returns correct count', async () => {
    await courseRepo.create({ id: 'c1', title: 'Course 1' });
    await courseRepo.create({ id: 'c2', title: 'Course 2' });
    await courseRepo.addMedia('c1', 'm1');
    await courseRepo.addMedia('c2', 'm1');
    await courseRepo.addMedia('c1', 'm2');

    expect(await courseRepo.countCoursesForMedia('m1')).toBe(2);
    expect(await courseRepo.countCoursesForMedia('m2')).toBe(1);
    expect(await courseRepo.countCoursesForMedia('m3')).toBe(0);
  });
});
