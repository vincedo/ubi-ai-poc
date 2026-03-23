
You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## Documentation Lookups (MANDATORY)

Before writing any code that uses the libraries listed below, you MUST use the context7 MCP tool to fetch current documentation. Do NOT rely on training knowledge — these libraries evolve fast and training data is stale.

Steps:
1. Call `mcp__plugin_context7_context7__resolve-library-id` with the library name
2. Call `mcp__plugin_context7_context7__query-docs` for the relevant feature/topic
3. Only then write code, using exclusively syntax confirmed by the docs

Libraries requiring context7 lookup:
- `ai` / Vercel AI SDK (current: v6) — API surface changes frequently
- `@ai-sdk/*` providers (current: v3) — provider-specific options change between versions
- `angular` / `@angular/*` (current: v21) — signals, control flow, standalone APIs
- `fastify` (current: v5) — plugin and lifecycle APIs changed from v4
- `zod` (current: v4) — breaking changes from v3
- `drizzle-orm` (current: v0.45) — query builder API evolves frequently
- `drizzle-kit` (current: v0.31) — CLI flags and config format change between versions
- `better-sqlite3` (current: v12) — verify sync API and TypeScript usage

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain
- TypeScript 6 requires explicit `rootDir` in tsconfig when using `outDir` with `declaration: true`. Always set `rootDir` to match the `include` path (e.g. `"rootDir": "./src"`).

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v19+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.
- Do NOT use `@angular/animations` (`provideAnimations`, `provideAnimationsAsync`, `BrowserAnimationsModule`) — the entire package is deprecated since Angular v20.2. Use native CSS animations/transitions with `animate.enter` and `animate.leave` directives instead.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Always use external template (`.html`) and style (`.scss`) files — no inline `template:` or `styles:`
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Sass Best Practices

- Always use `@use` and `@forward` instead of `@import` — `@import` is deprecated in Dart Sass and will be removed in v3.0.0
- This applies to both local partials and third-party packages (e.g. `@use 'material-symbols/outlined'`)

## Testing

- Unit tests use the `*.test.ts` suffix (e.g. `chunk.test.ts`)
- Integration tests use the `*.integration.test.ts` suffix (e.g. `chat.integration.test.ts`)
- Test scripts in `apps/api` target tests by filename substring, not by directory:
  - `npm test` — runs unit tests (`vitest run src/lib src/repositories`)
  - `npm run test:integration` — runs integration tests (`vitest run "integration"`)
- When adding new tests, use the correct suffix so the right script picks them up

## Error Handling

- A global HTTP interceptor (`errorNotificationInterceptor` in `app.config.ts`) catches all `HttpErrorResponse` errors and surfaces them to the user via `NotificationService` (snackbar). Components and services do NOT need to duplicate this — `console.error()` in subscribe error callbacks is intentional supplementary logging, not a silent failure.
- Only flag missing error handling for non-HttpClient calls (e.g. raw `fetch()`, non-HTTP operations, bootstrap failures).

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection
