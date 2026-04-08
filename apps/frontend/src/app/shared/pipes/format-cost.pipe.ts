import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'formatCost' })
export class FormatCostPipe implements PipeTransform {
  transform(cost: number): string {
    return `€${cost.toFixed(3)}`;
  }
}
