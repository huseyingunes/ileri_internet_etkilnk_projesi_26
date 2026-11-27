import { describe, expect, it } from 'vitest';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX, errorBodySchema, pageSizeSchema } from './api.js';

describe('pageSizeSchema', () => {
  it('defaults to 20 and caps at 100', () => {
    expect(pageSizeSchema.parse(undefined)).toBe(PAGE_SIZE_DEFAULT);
    expect(pageSizeSchema.parse('100')).toBe(PAGE_SIZE_MAX);
    expect(pageSizeSchema.safeParse('101').success).toBe(false);
  });

  it('rejects zero, negative and fractional sizes', () => {
    for (const value of ['0', '-1', '2.5', 'abc']) {
      expect(pageSizeSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe('errorBodySchema', () => {
  it('requires a request id', () => {
    expect(
      errorBodySchema.safeParse({ code: 'x', message: 'y', fieldErrors: [], requestId: '' }).success,
    ).toBe(false);
  });
});
