# Unified Media Tree Component

## Overview

Unify the media list (Enrichment page) and corpus selector (Chat page) into a single shared `MediaTreeComponent` that displays courses as collapsible parents with media as children. Supports two selection modes: checkboxes (Chat) and radio (Enrichment). Also moves the model selector into the chat input area and enforces the "no orphan media" rule at the backend.

## Backend Changes

### New endpoint: `GET /courses/tree`

Returns all courses with nested media items.

Response shape:
```json
[
  {
    "id": "course-1",
    "title": "Introduction to AI",
    "description": "...",
    "media": [
      { "id": "media-1", "title": "Lecture 1", "type": "video", "teacher": "Dr. Smith", "class": "AI-101", "module": "Module 1" },
      { "id": "media-2", "title": "Reading Material", "type": "pdf", "teacher": "Dr. Smith", "class": "AI-101", "module": "Module 1" }
    ]
  }
]
```

Implementation:
- New repository method: `findAllWithMedia()` — joins courses with their media via `courseMedia` junction table.
- New route in `courses.ts`: `GET /courses/tree` calling `findAllWithMedia()`.

### Orphan media enforcement

- New repository method in `CourseRepository`: `countCoursesForMedia(mediaId: string): Promise<number>` — counts rows in `courseMedia` where `mediaId` matches.
- Update `DELETE /courses/:id/media/:mediaId` route: Before calling `removeMedia`, call `countCoursesForMedia`. If count is 1 (last assignment), return `400 { error: "Cannot remove media from its last course" }`.

### Backend chat route changes

The current chat route (`POST /chat`) accepts both `scopeCourseIds` and `individualMediaIds`. After this change:

- **Remove `scopeCourseIds`** from `ChatBody` interface and the route logic that resolves courses → media IDs.
- The route only uses `individualMediaIds` (the frontend now sends selected media directly).
- **DB schema**: Keep `scopeCourseIds` column in `chat_session` table but always store `'[]'` for new sessions (avoids a migration). The `individualMediaIds` column stores the actual selected media.
- **Session listing** (`GET /chat/sessions`): Update `scopeSummary` to derive course titles from `individualMediaIds` by looking up which courses each media belongs to (reverse lookup), instead of reading `scopeCourseIds`.

## Shared Type

New interface in `packages/shared/src/index.ts`:

```typescript
export interface CourseWithMedia {
  id: string;
  title: string;
  description: string | null;
  media: Array<{ id: string; title: string; type: MediaType; teacher: string; class?: string; module: string }>;
}
```

## Shared Component: `MediaTreeComponent`

Location: `apps/frontend/src/app/shared/media-tree/`

### Inputs/Outputs

```typescript
// Data
courseTree = input.required<CourseWithMedia[]>();

// Mode
selectionMode = input.required<'checkboxes' | 'radio'>();

// Title
title = input.required<string>();

// State
selectedMediaIds = model<string[]>([]);       // checkboxes mode
selectedMediaId = model<string | null>(null);  // radio mode

// Output
mediaSelected = output<string>();  // emits media ID on radio-mode click
```

### Behavior: "checkboxes" mode (Chat page)

- Courses show a checkbox. Checking a course selects all its media children. Unchecking deselects all.
- Individual media items have checkboxes.
- Course checkbox shows indeterminate state when some (not all) children are selected.
- `selectedMediaIds` is the source of truth.
- Header shows badge with selected media count.

### Behavior: "radio" mode (Enrichment page)

- No visible checkboxes or radio buttons — clickable media rows.
- Clicking a media item highlights it and emits `mediaSelected`.
- Courses are not selectable — only collapsible group headers.
- `selectedMediaId` tracks the single selected item.

### Expand/collapse

- Internal `expandedCourseIds` signal tracking a `Set<string>`.
- All courses expanded by default.
- Chevron icon on course header, rotates on toggle.
- Built with plain `@for` + `@if` control flow (no `mat-tree`).

### Panel header

- Title from `title` input ("Media Library" or "Scope").
- No sort icon.
- In checkboxes mode: badge showing selected media count.

## Page Integration

### Enrichment page

- Replace `<app-media-list>` with `<app-media-tree selectionMode="radio">`.
- Data source: `CourseService.getTree()`.
- On `mediaSelected` → `router.navigate(['/enrich', mediaId])`.
- `selectedMediaId` bound to route-param-based selected item.

### Chat page

- Replace `<app-corpus-selector>` with `<app-media-tree selectionMode="checkboxes">`.
- Data source: `CourseService.getTree()`.
- `selectedMediaIds` two-way bound to `chatService.individualMediaIds`.
- Chat now sends only `individualMediaIds` (media-level selection). `scopeCourseIds` is removed from the frontend entirely.

### Model selector move

- Remove model dropdown from corpus selector.
- Add compact model dropdown inside `ChatInputComponent`, bottom-right of textarea (Claude.ai pattern).
- Bound to `chatService.selectedModel`.

## CourseService Addition

```typescript
getTree(): Observable<CourseWithMedia[]>  // calls GET /courses/tree
```

## Cleanup

### Delete

- `apps/frontend/src/app/features/enrichment/media-list/` — replaced by `media-tree`
- `apps/frontend/src/app/features/chat/corpus-selector/` — replaced by `media-tree` + model selector in chat input

### ChatService

- Remove `scopeCourseIds` signal.
- Keep `individualMediaIds` signal as primary selection mechanism.
