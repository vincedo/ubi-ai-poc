import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MediaService } from '../../services/media.service';
import { IngestionService } from '../../services/ingestion.service';

@Component({
  selector: 'app-ingestion',
  templateUrl: './ingestion.component.html',
  styleUrl: './ingestion.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IngestionComponent {
  readonly mediaService = inject(MediaService);
  readonly ingestionService = inject(IngestionService);

  iconFor = (type: string) =>
    ({ video: 'movie', audio: 'audio_file', pdf: 'picture_as_pdf' })[type] ?? 'article';
}
