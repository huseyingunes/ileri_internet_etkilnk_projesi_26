import { type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Validates request input at the boundary. A ZodError propagates to the global
 * exception filter, which answers 422 with field errors.
 */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    return this.schema.parse(value);
  }
}
