import { describe, expect, it } from 'vitest';
import { type FetchMetadataInput, isAllowedByFetchMetadata } from './fetch-metadata.js';

const base: FetchMetadataInput = {
  method: 'POST',
  path: '/api/v1/votes',
  site: 'same-origin',
  mode: 'cors',
  dest: 'empty',
  origin: 'https://haber10da.net',
  appOrigin: 'https://haber10da.net',
};

describe('isAllowedByFetchMetadata', () => {
  it('allows same-origin requests from our pages', () => {
    expect(isAllowedByFetchMetadata(base)).toBe(true);
  });

  it('blocks cross-site state-changing requests (CSRF)', () => {
    expect(
      isAllowedByFetchMetadata({ ...base, site: 'cross-site', origin: 'https://evil.example' }),
    ).toBe(false);
    expect(isAllowedByFetchMetadata({ ...base, site: 'same-site' })).toBe(false);
  });

  it('blocks cross-site subresource reads but allows top-level navigations', () => {
    const read = { ...base, method: 'GET', site: 'cross-site', mode: 'no-cors', dest: 'image' };
    expect(isAllowedByFetchMetadata(read)).toBe(false);
    expect(isAllowedByFetchMetadata({ ...read, mode: 'navigate', dest: 'document' })).toBe(true);
    expect(isAllowedByFetchMetadata({ ...read, mode: 'navigate', dest: 'object' })).toBe(false);
  });

  it('falls back to the Origin header without Sec-Fetch-* headers', () => {
    const legacy = { ...base, site: undefined, mode: undefined, dest: undefined };
    expect(isAllowedByFetchMetadata(legacy)).toBe(true);
    expect(isAllowedByFetchMetadata({ ...legacy, origin: 'https://evil.example' })).toBe(false);
    expect(isAllowedByFetchMetadata({ ...legacy, origin: undefined })).toBe(true);
  });

  it('rejects a mismatching Origin even when Sec-Fetch-Site claims same-origin', () => {
    expect(isAllowedByFetchMetadata({ ...base, origin: 'https://evil.example' })).toBe(false);
  });

  it('exempts webhooks and security reports', () => {
    expect(
      isAllowedByFetchMetadata({ ...base, path: '/api/v1/webhooks/whatsapp', site: 'cross-site' }),
    ).toBe(true);
  });
});
