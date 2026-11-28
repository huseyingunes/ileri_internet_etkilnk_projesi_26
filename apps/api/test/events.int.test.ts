import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, startTestApp, type TestApp } from './support/app.js';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp({ worker: true });
}, 300_000);

afterAll(async () => {
  await t.stop();
});

const eventBody = (overrides: Record<string, unknown> = {}) => ({
  title: 'Robot yarışması',
  description: 'Kampüs içi robot yarışması.',
  category: 'science',
  startsAt: '2027-03-10T10:00:00+03:00',
  endsAt: '2027-03-10T13:00:00+03:00',
  location: { name: 'Mühendislik Fakültesi', latitude: 41.0, longitude: 29.0 },
  capacity: 40,
  attendanceRadiusM: 150,
  qrRefreshSeconds: 25,
  tags: ['Robotik', 'yarışma'],
  ...overrides,
});

async function advisorPublicId(): Promise<string> {
  const advisor = await t.loginAs('advisor');
  return String((await call(t, advisor, 'GET', '/me')).body['id']);
}

describe('event proposals and approval', () => {
  it('sends a student proposal to the chosen advisor and lets them approve it into the pool', async () => {
    const student = await t.loginAs('student');
    const created = await call(
      t,
      student,
      'POST',
      '/events',
      eventBody({ advisorId: await advisorPublicId() }),
    );
    expect(created.status).toBe(201);
    expect(created.body['status']).toBe('pending_approval');
    expect(created.body['tags']).toEqual(['robotik', 'yarışma']);
    const id = String(created.body['id']);
    expect(created.headers.get('location')).toBe(`/api/v1/events/${id}`);

    // Unrelated students cannot see an unapproved proposal (404, existence not revealed).
    const other = await t.loginAs('student', 1);
    expect((await call(t, other, 'GET', `/events/${id}`)).status).toBe(404);

    const advisor = await t.loginAs('advisor');
    const pending = await call(t, advisor, 'GET', `/events/${id}`);
    expect((pending.body['viewer'] as { canReview: boolean }).canReview).toBe(true);

    const approved = await call(t, advisor, 'PUT', `/events/${id}/review`, { decision: 'approve' });
    expect(approved.status).toBe(200);
    expect(approved.body['status']).toBe('pool');
    expect((await call(t, other, 'GET', `/events/${id}`)).status).toBe(200);

    // A second review conflicts.
    expect(
      (await call(t, advisor, 'PUT', `/events/${id}/review`, { decision: 'approve' })).status,
    ).toBe(409);
  });

  it('requires an advisor for student proposals and a reason for rejection', async () => {
    const student = await t.loginAs('student', 2);
    const missing = await call(t, student, 'POST', '/events', eventBody());
    expect(missing.status).toBe(422);
    expect(JSON.stringify(missing.body['fieldErrors'])).toContain('advisorId');

    const created = await call(
      t,
      student,
      'POST',
      '/events',
      eventBody({ advisorId: await advisorPublicId() }),
    );
    const advisor = await t.loginAs('advisor');
    const id = String(created.body['id']);
    expect(
      (await call(t, advisor, 'PUT', `/events/${id}/review`, { decision: 'reject' })).status,
    ).toBe(422);
    const rejected = await call(t, advisor, 'PUT', `/events/${id}/review`, {
      decision: 'reject',
      reason: 'Tarih sınav haftasına denk geliyor.',
    });
    expect(rejected.body['status']).toBe('rejected');

    // Editing a rejected proposal resubmits it.
    const edited = await call(t, student, 'PATCH', `/events/${id}`, {
      startsAt: '2027-03-20T10:00:00+03:00',
      endsAt: '2027-03-20T12:00:00+03:00',
    });
    expect(edited.body['status']).toBe('pending_approval');
  });

  it('puts advisor and admin events straight into the pool', async () => {
    const advisor = await t.loginAs('advisor', 1);
    const created = await call(t, advisor, 'POST', '/events', eventBody({ category: 'culture' }));
    expect(created.body['status']).toBe('pool');
    expect((created.body['advisor'] as { id: string } | undefined)?.id).toBeDefined();
  });

  it('only lets the assigned advisor review and blocks students from reviewing', async () => {
    const student = await t.loginAs('student', 3);
    const created = await call(
      t,
      student,
      'POST',
      '/events',
      eventBody({ advisorId: await advisorPublicId() }),
    );
    const id = String(created.body['id']);
    expect(
      (await call(t, student, 'PUT', `/events/${id}/review`, { decision: 'approve' })).status,
    ).toBe(403);
    const otherAdvisor = await t.loginAs('advisor', 2);
    expect(
      (await call(t, otherAdvisor, 'PUT', `/events/${id}/review`, { decision: 'approve' })).status,
    ).toBe(404);
  });

  it('validates input at the boundary', async () => {
    const admin = await t.loginAs('admin');
    const bad = await call(
      t,
      admin,
      'POST',
      '/events',
      eventBody({ capacity: 0, qrRefreshSeconds: 5, endsAt: '2027-03-10T09:00:00+03:00' }),
    );
    expect(bad.status).toBe(422);
    const fields = (bad.body['fieldErrors'] as { field: string }[]).map((f) => f.field);
    expect(fields).toEqual(expect.arrayContaining(['capacity', 'qrRefreshSeconds', 'endsAt']));
  });

  it('cancels with an audit entry and freezes the event', async () => {
    const admin = await t.loginAs('admin');
    const created = await call(t, admin, 'POST', '/events', eventBody({ category: 'sports' }));
    const id = String(created.body['id']);
    const cancelled = await call(t, admin, 'PUT', `/events/${id}/cancellation`, {
      reason: 'Hava durumu.',
    });
    expect(cancelled.body['status']).toBe('cancelled');
    expect((await call(t, admin, 'PATCH', `/events/${id}`, { title: 'Yeni başlık' })).status).toBe(
      409,
    );
    const audit = await call(t, admin, 'GET', '/audit-log?action=event.cancelled');
    expect((audit.body['items'] as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('listing and caching', () => {
  it('filters, pages with a cursor and honours If-None-Match', async () => {
    const admin = await t.loginAs('admin');
    for (let i = 0; i < 3; i += 1) {
      await call(
        t,
        admin,
        'POST',
        '/events',
        eventBody({ title: `Kültür gecesi ${i.toString()}`, category: 'culture' }),
      );
    }
    const first = await call(t, admin, 'GET', '/events?category=culture&status=pool&limit=2');
    expect(first.status).toBe(200);
    expect((first.body['items'] as unknown[]).length).toBe(2);
    const cursor = (first.body['page'] as { nextCursor: string | null }).nextCursor;
    expect(cursor).not.toBeNull();
    const second = await call(
      t,
      admin,
      'GET',
      `/events?category=culture&status=pool&limit=2&cursor=${cursor ?? ''}`,
    );
    const firstIds = (first.body['items'] as { id: string }[]).map((e) => e.id);
    for (const item of second.body['items'] as { id: string }[])
      expect(firstIds).not.toContain(item.id);

    const etag = first.headers.get('etag') ?? '';
    expect(etag).toMatch(/^W\/"/);
    const cached = await admin.request(
      `${t.base}/api/v1/events?category=culture&status=pool&limit=2`,
      {
        headers: { 'If-None-Match': etag },
      },
    );
    expect(cached.status).toBe(304);
  });

  it('rejects page sizes above 100', async () => {
    const student = await t.loginAs('student');
    expect((await call(t, student, 'GET', '/events?limit=101')).status).toBe(422);
  });
});

describe('cover images', () => {
  it('validates the real file type, derives AVIF/WebP variants and attaches the cover', async () => {
    const advisor = await t.loginAs('advisor', 1);
    const created = await call(t, advisor, 'POST', '/events', eventBody({ category: 'culture' }));
    const eventId = String(created.body['id']);

    const png = await sharp({
      create: { width: 900, height: 600, channels: 3, background: '#1E3A5F' },
    })
      .png()
      .withExif({ IFD0: { Copyright: 'test' } })
      .toBuffer();
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'kapak.png');
    form.set('alt', 'Sahnede tiyatro ekibi');
    const cookie = `__Host-session=${advisor.cookie(new URL(t.base).host, '__Host-session') ?? ''}`;
    const upload = await fetch(`${t.base}/api/v1/media`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    });
    expect(upload.status).toBe(202);
    const media = (await upload.json()) as { id: string; status: string };
    expect(media.status).toBe('pending');

    let ready: Record<string, unknown> = {};
    for (let i = 0; i < 50; i += 1) {
      ready = (await call(t, advisor, 'GET', `/media/${media.id}`)).body;
      if (ready['status'] === 'ready') break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    expect(ready['status']).toBe('ready');
    expect(ready['width']).toBe(900);
    const variants = ready['variants'] as { url: string; format: string; width: number }[];
    expect(variants.map((v) => `${v.width.toString()}.${v.format}`).sort()).toEqual([
      '320.avif',
      '320.webp',
      '640.avif',
      '640.webp',
    ]);

    const avif = await advisor.request(
      `${t.base}${variants.find((v) => v.format === 'avif')?.url ?? ''}`,
    );
    expect(avif.headers.get('content-type')).toBe('image/avif');
    const meta = await sharp(Buffer.from(await avif.arrayBuffer())).metadata();
    expect(meta.exif).toBeUndefined();

    const withCover = await call(t, advisor, 'PUT', `/events/${eventId}/cover`, {
      mediaId: media.id,
    });
    expect((withCover.body['cover'] as { id: string }).id).toBe(media.id);

    // Someone else's upload cannot be attached.
    const otherAdvisor = await t.loginAs('advisor', 2);
    const own = await call(t, otherAdvisor, 'POST', '/events', eventBody({ category: 'culture' }));
    expect(
      (
        await call(t, otherAdvisor, 'PUT', `/events/${String(own.body['id'])}/cover`, {
          mediaId: media.id,
        })
      ).status,
    ).toBe(403);
  });

  it('rejects files that are not images regardless of the declared type', async () => {
    const student = await t.loginAs('student');
    const form = new FormData();
    form.set('file', new Blob(['<svg onload=alert(1)>'], { type: 'image/png' }), 'x.png');
    const cookie = `__Host-session=${student.cookie(new URL(t.base).host, '__Host-session') ?? ''}`;
    const upload = await fetch(`${t.base}/api/v1/media`, {
      method: 'POST',
      headers: { Cookie: cookie },
      body: form,
    });
    expect(upload.status).toBe(422);
  });
});
