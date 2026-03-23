import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { ShellComponent } from './layout/shell.component';
import { MediaService } from './services/media.service';

@Component({
  selector: 'app-root',
  imports: [ShellComponent],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  private mediaService = inject(MediaService);

  ngOnInit() {
    this.mediaService.loadCatalogue();
  }
}
