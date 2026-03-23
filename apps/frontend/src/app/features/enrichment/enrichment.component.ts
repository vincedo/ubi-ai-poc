import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { EnrichmentResult, LanguageModel, MCQ } from '@ubi-ai/shared';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EnrichmentService } from '../../services/enrichment.service';
import { CourseService } from '../../services/course.service';
import { NotificationService } from '../../services/notification.service';
import { EnrichmentEditorComponent } from './enrichment-editor/enrichment-editor.component';
import { MediaTreeComponent } from '../../shared/media-tree/media-tree.component';

@Component({
  selector: 'app-enrichment',
  imports: [MediaTreeComponent, EnrichmentEditorComponent],
  templateUrl: './enrichment.component.html',
  styleUrl: './enrichment.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EnrichmentComponent {
  readonly courseService = inject(CourseService);
  readonly enrichmentService = inject(EnrichmentService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notification = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly mediaIdFromRoute = signal<string | null>(null);

  readonly selectedItem = computed(() => {
    const id = this.mediaIdFromRoute();
    if (!id) return null;
    for (const course of this.courseService.tree()) {
      const found = course.media.find((m) => m.id === id);
      if (found) return found;
    }
    return null;
  });

  readonly currentResult = signal<EnrichmentResult | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);

  constructor() {
    this.courseService.loadTree();

    // Sync route param → signal
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.mediaIdFromRoute.set(params.get('mediaId'));
    });

    // When selected item changes, fetch existing enrichment
    effect(() => {
      const item = this.selectedItem();
      if (!item) {
        this.currentResult.set(null);
        return;
      }
      this.enrichmentService
        .getResult(item.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (result) => this.currentResult.set(result),
          error: (err) => {
            console.error('Failed to load enrichment result:', err);
            this.currentResult.set(null);
          },
        });
    });
  }

  selectMedia(mediaId: string) {
    this.router.navigate(['/enrich', mediaId]);
  }

  onEnrich(event: { mediaId: string; model: LanguageModel }) {
    this.loading.set(true);
    this.enrichmentService
      .generate(event.mediaId, event.model)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.currentResult.set(result);
          this.loading.set(false);
          this.notification.success('Enrichment complete');
        },
        error: (err) => {
          console.error('Enrichment generation failed:', err);
          this.loading.set(false);
        },
      });
  }

  onSave(event: {
    mediaId: string;
    data: { title: string; summary: string; keywords: string[]; mcqs: MCQ[] };
  }) {
    this.saving.set(true);
    this.enrichmentService
      .saveResult(event.mediaId, event.data)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.notification.success('Enrichment saved');
        },
        error: (err) => {
          console.error('Failed to save enrichment:', err);
          this.saving.set(false);
        },
      });
  }
}
