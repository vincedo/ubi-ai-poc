import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const API = 'http://localhost:3000';

async function createCourse(title: string, description?: string) {
  const res = await fetch(`${API}/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description }),
  });
  expect(res.status).toBe(200);
  return res.json() as Promise<{ id: string; title: string; description: string | null }>;
}

async function deleteCourse(id: string) {
  await fetch(`${API}/courses/${id}`, { method: 'DELETE' });
}

describe('GET /courses/tree', () => {
  it('returns courses with nested media', async () => {
    const res = await fetch(`${API}/courses/tree`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('id');
      expect(body[0]).toHaveProperty('title');
      expect(body[0]).toHaveProperty('media');
      expect(Array.isArray(body[0].media)).toBe(true);
    }
  });
});

describe('GET /courses', () => {
  it('returns an array of courses', async () => {
    const res = await fetch(`${API}/courses`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('POST /courses', () => {
  let createdId: string;

  afterEach(async () => {
    if (createdId) await deleteCourse(createdId);
  });

  it('creates a course and returns it', async () => {
    const course = await createCourse('Test Course', 'A test description');
    createdId = course.id;
    expect(course.id).toBeDefined();
    expect(course.title).toBe('Test Course');
    expect(course.description).toBe('A test description');
  });

  it('creates a course without description', async () => {
    const course = await createCourse('No Desc Course');
    createdId = course.id;
    expect(course.id).toBeDefined();
    expect(course.title).toBe('No Desc Course');
  });
});

describe('GET /courses/:id', () => {
  let courseId: string;

  beforeEach(async () => {
    const course = await createCourse('Detail Test Course');
    courseId = course.id;
  });

  afterEach(async () => {
    await deleteCourse(courseId);
  });

  it('returns the course with its media', async () => {
    const res = await fetch(`${API}/courses/${courseId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(courseId);
    expect(body.title).toBe('Detail Test Course');
    expect(Array.isArray(body.media)).toBe(true);
  });

  it('returns 404 for a nonexistent course', async () => {
    const res = await fetch(`${API}/courses/nonexistent-id`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('course not found');
  });
});

describe('PUT /courses/:id', () => {
  let courseId: string;

  beforeEach(async () => {
    const course = await createCourse('Original Title');
    courseId = course.id;
  });

  afterEach(async () => {
    await deleteCourse(courseId);
  });

  it('updates the course title', async () => {
    const res = await fetch(`${API}/courses/${courseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Title' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('Updated Title');
  });

  it('returns 404 for a nonexistent course', async () => {
    const res = await fetch(`${API}/courses/nonexistent-id`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /courses/:id', () => {
  it('deletes a course and returns ok', async () => {
    const course = await createCourse('To Be Deleted');
    const res = await fetch(`${API}/courses/${course.id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.deletedMediaIds)).toBe(true);
  });

  it('returns 404 for a nonexistent course', async () => {
    const res = await fetch(`${API}/courses/nonexistent-id`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /courses/:id/media/:mediaId — orphan-prevention guard', () => {
  let courseAId: string;
  let courseBId: string;

  beforeEach(async () => {
    const [a, b] = await Promise.all([createCourse('Course A'), createCourse('Course B')]);
    courseAId = a.id;
    courseBId = b.id;
  });

  afterEach(async () => {
    await Promise.all([deleteCourse(courseAId), deleteCourse(courseBId)]);
  });

  it('blocks removal when media belongs to only one course', async () => {
    // Get a real media item to use
    const mediaRes = await fetch(`${API}/media`);
    const mediaItems = await mediaRes.json();
    if (mediaItems.length === 0) return; // skip if no seeded media

    const mediaId = mediaItems[0].id;

    // Add media to courseA first
    await fetch(`${API}/courses/${courseAId}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaId }),
    });

    // Remove from any other pre-existing courses so media is exclusively in courseA.
    // The orphan guard won't block these removals since media is also in courseA.
    const treeRes = await fetch(`${API}/courses/tree`);
    const tree = await treeRes.json();
    for (const c of tree) {
      if (c.id !== courseAId && c.media.some((m: { id: string }) => m.id === mediaId)) {
        await fetch(`${API}/courses/${c.id}/media/${mediaId}`, { method: 'DELETE' });
      }
    }

    // Now media is exclusively in courseA — removal should be blocked
    const res = await fetch(`${API}/courses/${courseAId}/media/${mediaId}`, { method: 'DELETE' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('last course');
  });

  it('allows removal when media belongs to multiple courses', async () => {
    const mediaRes = await fetch(`${API}/media`);
    const mediaItems = await mediaRes.json();
    if (mediaItems.length === 0) return;

    const mediaId = mediaItems[0].id;

    // Add media to both courses
    await Promise.all([
      fetch(`${API}/courses/${courseAId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId }),
      }),
      fetch(`${API}/courses/${courseBId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId }),
      }),
    ]);

    // Remove from courseA — should succeed since it still belongs to courseB
    const res = await fetch(`${API}/courses/${courseAId}/media/${mediaId}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe('PATCH /courses/:id/media/order', () => {
  let courseId: string;

  beforeEach(async () => {
    const course = await createCourse('Order Test Course');
    courseId = course.id;
  });

  afterEach(async () => {
    await deleteCourse(courseId);
  });

  it('reorders media in a course', async () => {
    const mediaRes = await fetch(`${API}/media`);
    const mediaItems = await mediaRes.json();
    if (mediaItems.length < 2) return;

    const [m1, m2] = mediaItems.slice(0, 2);

    // Add both media items
    await Promise.all([
      fetch(`${API}/courses/${courseId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: m1.id }),
      }),
      fetch(`${API}/courses/${courseId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: m2.id }),
      }),
    ]);

    const res = await fetch(`${API}/courses/${courseId}/media/order`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedMediaIds: [m2.id, m1.id] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Verify order was applied
    const detail = await fetch(`${API}/courses/${courseId}`);
    const detailBody = await detail.json();
    expect(detailBody.media[0].id).toBe(m2.id);
    expect(detailBody.media[1].id).toBe(m1.id);
  });
});
