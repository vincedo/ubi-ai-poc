import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';

@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(value: string): string {
    try {
      return marked.parse(value) as string;
    } catch (err) {
      console.error('Markdown parsing failed:', err);
      return value;
    }
  }
}
