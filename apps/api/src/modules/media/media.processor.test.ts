import fc from 'fast-check';
import { MEDIA_VARIANT_WIDTHS } from '@etkinlik/shared';
import { describe, expect, it } from 'vitest';
import { variantWidths } from './media.processor.js';

describe('variantWidths', () => {
  it('never upscales and always yields at least one width', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 20_000 }), (width) => {
        const widths = variantWidths(width);
        expect(widths.length).toBeGreaterThan(0);
        for (const w of widths) expect(w).toBeLessThanOrEqual(width);
      }),
    );
  });

  it('uses every configured width for large images', () => {
    expect(variantWidths(4000)).toEqual([...MEDIA_VARIANT_WIDTHS]);
  });
});
