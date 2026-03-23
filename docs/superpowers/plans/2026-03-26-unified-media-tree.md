# Unified Media Tree Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the enrichment media list and chat corpus selector into a single shared tree component with two selection modes, move the model selector into the chat input, and enforce no-orphan-media at the backend.

**Architecture:** New `GET /courses/tree` endpoint returns courses with nested media. Shared `MediaTreeComponent` renders a collapsible course→media tree with `checkboxes` or `radio` selection mode. Chat route simplified to use only `individualMediaIds`.

**Parallelism:** Tasks 7–8 and Task 9 are independent of each other (both depend on Task 6 but not on each other). They can be executed in parallel. Task 10 depends on both.

**Tech Stack:** Angular 21 (signals, standalone components, OnPush), Fastify 5, drizzle-orm, SQLite, Vitest

---

### Task 1: Add `CourseWithMedia` shared type

**Files:**
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Add the interface**

In `packages/shared/src/index.ts`, after the `MediaItem` interface (line 22), add:

```typescript
export interface CourseWithMedia {
  id: string;
  title: string;
  description: string | null;
  media: MediaItem[];
}
```

Note: Reuses the existing `MediaItem` interface rather than redefining inline fields.

- [ ] **Step 2: Verify build**

Run: `cd /Users/vincedo/dev/ubicast/ubi-ai-poc_learning && npx tsc --noEmit -p packages/shared/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/index.ts
git commit -m "feat: add CourseWithMedia shared type"
```

---

### Task 2: Add `findAllWithMedia` and `countCoursesForMedia` repository methods

**Files:**
- Modify: `apps/api/src/repositories/course.repository.ts`
- Modify: `apps/api/src/repositories/sqlite-course.repository.ts`
- Modify: `apps/api/src/repositories/__tests__/course.repository.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `apps/api/src/repositories/__tests__/course.repository.test.ts`, inside the `describe` block:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npm test -- course.repository`
Expected: FAIL — `findAllWithMedia` and `countCoursesForMedia` not defined

- [ ] **Step 3: Add methods to interface**

In `apps/api/src/repositories/course.repository.ts`, add to the `CourseRepository` interface:

```typescript
findAllWithMedia(): Promise<Array<Course & { media: Media[] }>>;
countCoursesForMedia(mediaId: string): Promise<number>;
```

Note: The return type uses DB types (`Course & { media: Media[] }`). The `Media` DB type is a superset of the frontend `MediaItem` interface (it includes all `MediaItem` fields plus extra DB columns like `transcriptionStatus`). The HTTP JSON response naturally serializes `Media` to a superset of `MediaItem` — extra fields are ignored by TypeScript structural typing on the frontend. The DB's nullable `teacher`/`module` fields are always populated by the seed data.

- [ ] **Step 4: Implement in SQLite repository**

In `apps/api/src/repositories/sqlite-course.repository.ts`, add these methods to `SqliteCourseRepository`:

```typescript
async findAllWithMedia(): Promise<Array<Course & { media: Media[] }>> {
  const courses = await this.db.select().from(course);
  const rows = await this.db
    .select({ courseId: courseMedia.courseId, media })
    .from(courseMedia)
    .innerJoin(media, eq(courseMedia.mediaId, media.id))
    .orderBy(asc(courseMedia.courseId), asc(courseMedia.order));

  const mediaByCourserId = new Map<string, Media[]>();
  for (const row of rows) {
    const list = mediaByCourserId.get(row.courseId) ?? [];
    list.push(row.media);
    mediaByCourserId.set(row.courseId, list);
  }

  return courses.map((c) => ({
    ...c,
    media: mediaByCourserId.get(c.id) ?? [],
  }));
}

async countCoursesForMedia(mediaId: string): Promise<number> {
  const rows = await this.db
    .select({ count: sql<number>`COUNT(*)` })
    .from(courseMedia)
    .where(eq(courseMedia.mediaId, mediaId));
  return Number(rows[0].count);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npm test -- course.repository`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/repositories/course.repository.ts apps/api/src/repositories/sqlite-course.repository.ts apps/api/src/repositories/__tests__/course.repository.test.ts
git commit -m "feat: add findAllWithMedia and countCoursesForMedia repository methods"
```

---

### Task 3: Add `GET /courses/tree` endpoint and orphan media enforcement

**Files:**
- Modify: `apps/api/src/routes/courses.ts`

- [ ] **Step 1: Add the tree endpoint**

In `apps/api/src/routes/courses.ts`, add before the `GET /courses/:id` route (to avoid `:id` matching "tree"):

```typescript
// Get all courses with nested media (tree view)
fastify.get('/courses/tree', async () => {
  return fastify.repos.course.findAllWithMedia();
});
```

- [ ] **Step 2: Add orphan enforcement to removeMedia**

Replace the existing `DELETE /courses/:id/media/:mediaId` handler (lines 59-65) with:

```typescript
// Remove media from course (prevents orphaning)
fastify.delete<{ Params: { id: string; mediaId: string } }>(
  '/courses/:id/media/:mediaId',
  async (req, reply) => {
    // Note: SQLite serializes writes, so the count-then-delete is safe against
    // concurrent orphaning in this single-writer environment.
    const count = await fastify.repos.course.countCoursesForMedia(req.params.mediaId);
    if (count <= 1) {
      return reply.code(400).send({ error: 'Cannot remove media from its last course' });
    }
    await fastify.repos.course.removeMedia(req.params.id, req.params.mediaId);
    return { ok: true };
  },
);
```

- [ ] **Step 3: Add integration test for GET /courses/tree**

Add to `apps/api/src/routes/__tests__/chat.integration.test.ts` (or create a new `courses.integration.test.ts` alongside it):

```typescript
describe('GET /courses/tree', () => {
  it('returns courses with nested media', async () => {
    const res = await fetch('http://localhost:3000/courses/tree');
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
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/routes/courses.ts apps/api/src/routes/__tests__/courses.integration.test.ts
git commit -m "feat: add GET /courses/tree endpoint, orphan media enforcement, and integration test"
```

---

### Task 4: Simplify backend chat route (remove `scopeCourseIds`)

**Files:**
- Modify: `apps/api/src/routes/chat.ts`

Note: The DB column `scopeCourseIds` is kept but always written as `'[]'`. Existing sessions with non-empty `scopeCourseIds` are harmless since `GET /chat/sessions` no longer reads that field. A follow-up task can drop the column via a schema migration if desired.

- [ ] **Step 1: Update ChatBody interface**

Remove `scopeCourseIds` from `ChatBody` (line 9). The interface becomes:

```typescript
interface ChatBody {
  messages: Array<{ role: ChatRole; content: string }>;
  individualMediaIds?: string[];
  model?: LanguageModel;
}
```

- [ ] **Step 2: Simplify the POST /chat handler**

Replace lines 24-46 (destructuring + course resolution logic) with:

```typescript
    const { messages, individualMediaIds = [], model: rawModel } = req.body;
    const model = (rawModel ?? 'mistral-large-latest') as LanguageModel;
    if (!LANGUAGE_MODELS.includes(model)) {
      return reply.code(400).send({ error: `Unknown model. Valid: ${LANGUAGE_MODELS.join(', ')}` });
    }

    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMessage) {
      return reply.code(400).send({ error: 'no user message' });
    }

    const allMediaIds = [...new Set(individualMediaIds)];
```

- [ ] **Step 3: Update session creation**

Replace the `createSession` call (lines 51-56) to store `'[]'` for `scopeCourseIds`:

```typescript
      await fastify.repos.chat.createSession({
        id: sessionId,
        model,
        scopeCourseIds: '[]',
        individualMediaIds: JSON.stringify(individualMediaIds),
      });
```

- [ ] **Step 4: Update session listing to derive scope from media**

Replace the `GET /chat/sessions` handler (lines 145-166) with:

```typescript
  fastify.get('/chat/sessions', async () => {
    const sessions = await fastify.repos.chat.listSessions();
    return Promise.all(
      sessions.map(async (s) => {
        const mediaIds = safeJsonParse<string[]>(s.individualMediaIds, []);
        return {
          id: s.id,
          model: s.model,
          createdAt: s.createdAt,
          totalCost: s.totalCost,
          totalTokens: s.totalTokens,
          scopeSummary: { mediaCount: mediaIds.length },
        };
      }),
    );
  });
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/chat.ts
git commit -m "refactor: simplify chat route to use only individualMediaIds"
```

---

### Task 5: Add `getTree()` and shared `tree` signal to frontend `CourseService`

**Files:**
- Modify: `apps/frontend/src/app/services/course.service.ts`

- [ ] **Step 1: Add imports, method, and shared signal**

Add the imports at the top of the file:

```typescript
import { signal } from '@angular/core';
import type { CourseWithMedia } from '@ubi-ai/shared';
```

Add to `CourseService`:

```typescript
/** Shared tree signal — loaded once, consumed by multiple components. */
readonly tree = signal<CourseWithMedia[]>([]);

getTree(): Observable<CourseWithMedia[]> {
  return this.http.get<CourseWithMedia[]>(`${this.API}/courses/tree`);
}

/** Call once at app startup or when tree data is needed. */
loadTree(): void {
  this.getTree().subscribe({
    next: (tree) => this.tree.set(tree),
    error: (err) => console.error('Failed to load course tree:', err),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/app/services/course.service.ts
git commit -m "feat: add getTree method and shared tree signal to CourseService"
```

---

### Task 6: Remove `scopeCourseIds` from `ChatService`

**Files:**
- Modify: `apps/frontend/src/app/services/chat.service.ts`

- [ ] **Step 1: Remove `scopeCourseIds` signal**

Delete line 46: `scopeCourseIds = signal<string[]>([]);`

- [ ] **Step 2: Remove `scopeCourseIds` from POST body**

In the `sendMessage` method (line 76-77), remove `scopeCourseIds` from the JSON body. The body becomes:

```typescript
        body: JSON.stringify({
          messages: [...history, { role: 'user', content: text }],
          individualMediaIds: this.individualMediaIds(),
          model: this.selectedModel(),
        }),
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/app/services/chat.service.ts
git commit -m "refactor: remove scopeCourseIds from ChatService"
```

---

### Task 7: Create shared `MediaTreeComponent`

**Files:**
- Create: `apps/frontend/src/app/shared/media-tree/media-tree.component.ts`
- Create: `apps/frontend/src/app/shared/media-tree/media-tree.component.html`
- Create: `apps/frontend/src/app/shared/media-tree/media-tree.component.scss`

- [ ] **Step 1: Create the component TypeScript file**

Create `apps/frontend/src/app/shared/media-tree/media-tree.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, computed, effect, input, model, output, signal } from '@angular/core';
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

  selectedCount = computed(() => this.selectedMediaIds().length);

  constructor() {
    /** Auto-expand all courses when the tree first loads. */
    effect(() => {
      const tree = this.courseTree();
      if (tree.length > 0 && this.expandedCourseIds().size === 0) {
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
    return ({ video: 'movie', audio: 'audio_file', pdf: 'picture_as_pdf' } as Record<string, string>)[type] ?? 'article';
  }

  labelFor(type: string): string {
    return type.toUpperCase();
  }
}
```

- [ ] **Step 2: Create the template**

Create `apps/frontend/src/app/shared/media-tree/media-tree.component.html`:

```html
<section class="tree-panel">
  <div class="panel-header">
    <h3 class="panel-title" id="tree-label">{{ title() }}</h3>
    @if (selectionMode() === 'checkboxes' && selectedCount() > 0) {
      <span class="count-badge">{{ selectedCount() }} selected</span>
    }
  </div>

  <ul class="tree-list" role="tree" aria-labelledby="tree-label">
    @for (course of courseTree(); track course.id) {
      <!-- Course header -->
      <li class="course-node" role="treeitem" [attr.aria-expanded]="isExpanded(course.id)">
        <button
          type="button"
          class="course-header"
          (click)="toggleExpand(course.id)"
        >
          <span
            class="material-symbols-outlined chevron"
            [class.expanded]="isExpanded(course.id)"
            aria-hidden="true"
            >chevron_right</span
          >
          @if (selectionMode() === 'checkboxes') {
            <input
              type="checkbox"
              class="course-checkbox"
              [checked]="isCourseFullySelected(course)"
              [indeterminate]="isCoursePartiallySelected(course)"
              (click)="$event.stopPropagation()"
              (change)="toggleCourse(course)"
              [attr.aria-label]="'Select all media in ' + course.title"
            />
          }
          <span class="course-title">{{ course.title }}</span>
        </button>

        <!-- Media children -->
        @if (isExpanded(course.id)) {
          <ul class="media-group" role="group">
            @for (media of course.media; track media.id) {
              <li role="treeitem">
                @if (selectionMode() === 'checkboxes') {
                  <label
                    class="media-node checkbox-mode"
                    [class.checked]="isMediaSelected(media.id)"
                  >
                    <input
                      type="checkbox"
                      [checked]="isMediaSelected(media.id)"
                      (change)="toggleMedia(media.id)"
                    />
                    <div class="media-icon" aria-hidden="true">
                      <span class="material-symbols-outlined">{{ iconFor(media.type) }}</span>
                    </div>
                    <div class="media-info">
                      <p class="media-title">{{ media.title }}</p>
                      <div class="badges">
                        <span class="type-badge">{{ labelFor(media.type) }}</span>
                        @if (media.class) {
                          <span class="meta-text">{{ media.class }}</span>
                        }
                      </div>
                    </div>
                  </label>
                } @else {
                  <button
                    type="button"
                    class="media-node radio-mode"
                    [class.selected]="media.id === selectedMediaId()"
                    [attr.aria-pressed]="media.id === selectedMediaId()"
                    (click)="selectMedia(media)"
                  >
                    <div class="media-icon" [class.icon-selected]="media.id === selectedMediaId()" aria-hidden="true">
                      <span class="material-symbols-outlined">{{ iconFor(media.type) }}</span>
                    </div>
                    <div class="media-info">
                      <p class="media-title">{{ media.title }}</p>
                      <p class="media-teacher">{{ media.teacher }}</p>
                      <div class="badges">
                        <span class="type-badge">{{ labelFor(media.type) }}</span>
                        @if (media.class) {
                          <span class="meta-text">{{ media.class }}</span>
                        }
                      </div>
                    </div>
                  </button>
                }
              </li>
            }
          </ul>
        }
      </li>
    }
  </ul>
</section>
```

- [ ] **Step 3: Create the styles**

Create `apps/frontend/src/app/shared/media-tree/media-tree.component.scss`:

```scss
:host {
  display: block;
  height: 100%;
  overflow: hidden;
}

.tree-panel {
  height: 100%;
  background: var(--color-surface-container-low);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;

  .panel-title {
    font-family: 'Manrope', sans-serif;
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--color-on-surface);
    margin: 0;
  }
}

.count-badge {
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
  color: var(--color-primary);
  padding: 0.125rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.tree-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.media-group {
  list-style: none;
  margin: 0;
  padding: 0;
}

// Course header
.course-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.25rem;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: 0.5rem;
  transition: background 0.15s;

  &:hover {
    background: var(--color-surface-container-high);
  }
}

.chevron {
  font-size: 1.125rem;
  color: var(--color-on-surface-variant);
  transition: transform 0.2s;

  &.expanded {
    transform: rotate(90deg);
  }
}

.course-checkbox {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  accent-color: var(--color-primary);
}

.course-title {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--color-on-surface);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

// Media nodes
.media-node {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-left: 1.5rem;
  padding: 0.625rem 0.75rem;
  border-radius: 0.75rem;
  cursor: pointer;
  border: 1px solid transparent;
  background: var(--color-surface-container-lowest);
  transition: all 0.15s;

  &:hover {
    border-color: color-mix(in srgb, var(--color-primary) 15%, transparent);
  }

  // Checkboxes mode
  &.checkbox-mode {
    &.checked {
      border-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
    }

    input[type='checkbox'] {
      width: 1rem;
      height: 1rem;
      flex-shrink: 0;
      accent-color: var(--color-primary);
      margin-top: 0.25rem;
    }
  }

  // Radio mode
  &.radio-mode {
    width: calc(100% - 1.5rem);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);

    &:hover {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }

    &.selected {
      border-color: color-mix(in srgb, var(--color-primary) 20%, transparent);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
  }
}

.media-icon {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.375rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-container-high);
  color: var(--color-on-surface-variant);

  .material-symbols-outlined {
    font-size: 1.125rem;
  }

  &.icon-selected {
    background: var(--color-primary-fixed);
    color: var(--color-primary);
  }
}

.media-info {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.media-title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-on-surface);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.media-teacher {
  font-size: 0.6875rem;
  color: var(--color-on-surface-variant);
  margin: 0.125rem 0 0;
}

.badges {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.type-badge {
  padding: 0.0625rem 0.3125rem;
  background: var(--color-surface-container-highest);
  color: var(--color-on-surface-variant);
  font-size: 0.5625rem;
  font-weight: 700;
  border-radius: 0.25rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.meta-text {
  font-size: 0.5625rem;
  color: var(--color-on-surface-variant);
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/shared/media-tree/
git commit -m "feat: create shared MediaTreeComponent"
```

---

### Task 8: Integrate `MediaTreeComponent` into Enrichment page

**Files:**
- Modify: `apps/frontend/src/app/features/enrichment/enrichment.component.ts`
- Modify: `apps/frontend/src/app/features/enrichment/enrichment.component.html`
- Delete: `apps/frontend/src/app/features/enrichment/media-list/` (entire directory — replaced by `MediaTreeComponent`)

- [ ] **Step 1: Update component imports and add tree data**

In `enrichment.component.ts`:

- Replace `MediaListComponent` import with `MediaTreeComponent`:

```typescript
import { MediaTreeComponent } from '../../shared/media-tree/media-tree.component';
```

- Update `imports` array in `@Component`: replace `MediaListComponent` with `MediaTreeComponent`.

- Remove the `MediaService` import and injection (`readonly mediaService = inject(MediaService);`).

Note: `MediaService` is still used in 5 other places (`app.ts`, `ingestion.service.ts`, `course-detail.component.ts`, `settings.component.ts`, `ingestion.component.ts`), so the service itself must NOT be deleted.

- Add `CourseService` injection and use its shared tree signal:

```typescript
import { CourseService } from '../../services/course.service';
```

Add to the class:

```typescript
private readonly courseService = inject(CourseService);
```

- **Update `selectedItem` computed**: It currently uses `mediaService.catalogue()` to find the selected media. Change it to flatten the course tree instead:

```typescript
readonly selectedItem = computed(() => {
  const id = this.mediaIdFromRoute();
  if (!id) return null;
  for (const course of this.courseService.tree()) {
    const found = course.media.find((m) => m.id === id);
    if (found) return found;
  }
  return null;
});
```

- Add tree loading in the constructor (alongside existing route param subscription and effect):

```typescript
this.courseService.loadTree();
```

- [ ] **Step 2: Update template**

Replace the `<app-media-list>` tag in `enrichment.component.html` with:

```html
<app-media-tree
  [courseTree]="courseService.tree()"
  selectionMode="radio"
  title="Media Library"
  [selectedMediaId]="selectedItem()?.id ?? null"
  (mediaSelected)="selectMedia($event)"
/>
```

Note: Expose `courseService` as `readonly` in the component class so the template can access `courseService.tree()`.

Update `selectMedia` method signature — it now receives a `string` (media ID) instead of `MediaItem`:

```typescript
selectMedia(mediaId: string) {
  this.router.navigate(['/enrich', mediaId]);
}
```

- [ ] **Step 3: Delete old media-list component**

```bash
rm -rf apps/frontend/src/app/features/enrichment/media-list
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/features/enrichment/
git commit -m "feat: integrate MediaTreeComponent into enrichment page, delete old media-list"
```

---

### Task 9: Move model selector into `ChatInputComponent`

**Files:**
- Modify: `apps/frontend/src/app/features/chat/chat-input/chat-input.component.ts`
- Modify: `apps/frontend/src/app/features/chat/chat-input/chat-input.component.html`
- Modify: `apps/frontend/src/app/features/chat/chat-input/chat-input.component.scss`

- [ ] **Step 1: Update component TypeScript**

In `chat-input.component.ts`, add imports for Material and shared types:

```typescript
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { LANGUAGE_MODELS } from '@ubi-ai/shared';
```

Add to `@Component` decorator `imports` array: `MatFormFieldModule, MatSelectModule`.

Add to the class:

```typescript
readonly models = LANGUAGE_MODELS;
```

- [ ] **Step 2: Update template**

Replace the `chat-input.component.html` content. Add a model selector row below the textarea wrapper:

```html
<div class="input-area">
  <div class="input-wrapper">
    <label for="chat-input" class="sr-only">Ask a question about your media</label>
    <textarea
      #textarea
      id="chat-input"
      class="chat-textarea"
      placeholder="Ask a question about your media…"
      rows="1"
      (keydown)="onKeydown($event, textarea)"
    ></textarea>
    <div class="input-actions">
      @if (chatService.isStreaming()) {
        <button class="stop-btn" title="Stop generating" (click)="chatService.stop()">
          <span class="material-symbols-outlined">stop_circle</span>
        </button>
      }
      <button class="send-btn" [disabled]="chatService.isStreaming()" (click)="send(textarea)">
        <span class="material-symbols-outlined">send</span>
      </button>
    </div>
  </div>
  <div class="input-footer">
    <p class="input-hint">Powered by UbiCast AI Engine · Mistral + Qdrant</p>
    <div class="model-picker">
      <mat-form-field appearance="outline" class="model-field">
        <mat-select
          [value]="chatService.selectedModel()"
          (selectionChange)="chatService.selectedModel.set($event.value)"
          aria-label="Select language model"
        >
          @for (m of models; track m) {
            <mat-option [value]="m">{{ m }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Update styles**

Add these styles to `chat-input.component.scss`:

```scss
.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.375rem;
  max-width: 56rem;
  margin-left: auto;
  margin-right: auto;
}

.input-hint {
  text-align: center;
  font-size: 0.625rem;
  color: var(--color-on-surface-variant);
  margin: 0;
}

.model-picker {
  flex-shrink: 0;
}

.model-field {
  width: auto;

  // Note: ::ng-deep is deprecated but remains the only reliable way to pierce
  // Angular Material's encapsulated DOM. Track Angular's replacement API and
  // migrate when available. See: https://github.com/angular/angular/issues/54482
  ::ng-deep .mat-mdc-form-field-infix {
    min-height: 28px;
    padding-top: 4px;
    padding-bottom: 4px;
  }

  ::ng-deep .mat-mdc-text-field-wrapper {
    padding-left: 8px;
    padding-right: 8px;
  }

  ::ng-deep .mat-mdc-form-field-subscript-wrapper {
    display: none;
  }

  ::ng-deep .mdc-text-field--outlined .mdc-notched-outline .mdc-notched-outline__leading,
  ::ng-deep .mdc-text-field--outlined .mdc-notched-outline .mdc-notched-outline__trailing,
  ::ng-deep .mdc-text-field--outlined .mdc-notched-outline .mdc-notched-outline__notch {
    border-color: color-mix(in srgb, var(--color-on-surface-variant) 30%, transparent);
  }

  ::ng-deep .mat-mdc-select-value-text {
    font-size: 0.6875rem;
    color: var(--color-on-surface-variant);
  }
}
```

Remove the old `.input-hint` rule (it was standalone with `margin: 0.5rem 0 0`) since it's now inside `.input-footer`.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/app/features/chat/chat-input/
git commit -m "feat: move model selector into chat input component"
```

---

### Task 10: Integrate `MediaTreeComponent` into Chat page and delete old corpus-selector

**Files:**
- Modify: `apps/frontend/src/app/features/chat/chat.component.ts`
- Modify: `apps/frontend/src/app/features/chat/chat.component.html`
- Modify: `apps/frontend/src/app/features/chat/chat.component.scss`
- Delete: `apps/frontend/src/app/features/chat/corpus-selector/` (entire directory)

- [ ] **Step 1: Update ChatComponent**

Replace `chat.component.ts`:

```typescript
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MessageThreadComponent } from './message-thread/message-thread.component';
import { ChatInputComponent } from './chat-input/chat-input.component';
import { MediaTreeComponent } from '../../shared/media-tree/media-tree.component';
import { ChatService } from '../../services/chat.service';
import { CourseService } from '../../services/course.service';

@Component({
  selector: 'app-chat',
  imports: [MediaTreeComponent, MessageThreadComponent, ChatInputComponent],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent {
  readonly chatService = inject(ChatService);
  readonly courseService = inject(CourseService);

  constructor() {
    this.courseService.loadTree();
  }
}
```

- [ ] **Step 2: Update chat template**

Replace `chat.component.html`:

```html
<div class="chat-layout">
  <app-media-tree
    class="scope-panel"
    [courseTree]="courseService.tree()"
    selectionMode="checkboxes"
    title="Scope"
    [(selectedMediaIds)]="chatService.individualMediaIds"
  />
  <section class="chat-center">
    <app-message-thread class="message-thread" />
    <app-chat-input class="chat-input" />
  </section>
</div>
```

- [ ] **Step 3: Update chat styles**

In `chat.component.scss`, rename `.corpus-panel` to `.scope-panel`:

```scss
.scope-panel {
  width: 320px;
  background: var(--color-surface-container-low);
  overflow-y: auto;
  flex-shrink: 0;
}
```

- [ ] **Step 4: Delete old corpus-selector**

```bash
rm -rf apps/frontend/src/app/features/chat/corpus-selector
```

- [ ] **Step 5: Verify the app builds**

Run: `cd apps/frontend && npx ng build`
Expected: Build succeeds with no errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: integrate MediaTreeComponent into chat page, delete old corpus-selector"
```

---

### Task 11: Run all tests and verify

- [ ] **Step 1: Run backend tests**

Run: `cd apps/api && npm test`
Expected: All tests pass

- [ ] **Step 2: Run frontend build**

Run: `cd apps/frontend && npx ng build`
Expected: Build succeeds

- [ ] **Step 3: Fix any issues found**

Address compilation errors, missing imports, or test failures.

- [ ] **Step 4: Final commit if fixes needed**

```bash
git add -A
git commit -m "fix: address build and test issues"
```
