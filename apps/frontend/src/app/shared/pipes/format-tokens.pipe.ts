import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'formatTokens' })
export class FormatTokensPipe implements PipeTransform {
  transform(tokens: number): string {
    return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
  }
}
