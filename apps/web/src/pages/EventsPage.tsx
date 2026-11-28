import { useQuery } from '@tanstack/react-query';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  EVENT_STATUS_LABELS,
  formatIstanbul,
  nowInstant,
} from '@etkinlik/shared';
import { type EventSummary, listEvents } from '../api/events';
import { Link, navigate, useLocation } from '../router';
import { Badge, Card, PageTitle, Picture, SelectField, StatusMessage } from '../ui';

const VIEWS = {
  havuz: { label: 'Havuz', status: 'pool', mine: false },
  takvim: { label: 'Takvim', status: 'scheduled', mine: false },
  arsiv: { label: 'Arşiv', status: 'completed', mine: false },
  onerilerim: { label: 'Önerilerim', status: undefined, mine: true },
} as const;
type ViewKey = keyof typeof VIEWS;
const VIEW_KEYS: readonly ViewKey[] = ['havuz', 'takvim', 'arsiv', 'onerilerim'];
const isView = (value: string | null): value is ViewKey => VIEW_KEYS.some((key) => key === value);

export function EventCard({ event, eager }: { event: EventSummary; eager: boolean }) {
  const cover = event.cover;
  return (
    <Card className="flex flex-col gap-md">
      {cover?.status === 'ready' && cover.width !== undefined && cover.height !== undefined && (
        <Picture
          variants={cover.variants}
          alt={cover.alt}
          width={cover.width}
          height={cover.height}
          sizes="(min-width: 768px) 50vw, 100vw"
          eager={eager}
          className="aspect-video"
        />
      )}
      <div className="flex flex-wrap gap-sm">
        <Badge>{CATEGORY_LABELS[event.category]}</Badge>
        <Badge>{EVENT_STATUS_LABELS[event.status]}</Badge>
      </div>
      <h2 className="text-xl font-semibold">
        <Link href={`/etkinlikler/${event.id}`} className="underline-offset-4 hover:underline">
          {event.title}
        </Link>
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-md gap-y-xs text-sm">
        <dt className="text-muted-foreground">Tarih</dt>
        <dd>
          <time dateTime={event.startsAt}>{formatIstanbul(event.startsAt)}</time>
        </dd>
        <dt className="text-muted-foreground">Yer</dt>
        <dd>{event.location.name}</dd>
        <dt className="text-muted-foreground">Düzenleyen</dt>
        <dd>{event.organizer.name}</dd>
      </dl>
    </Card>
  );
}

export function EventsPage() {
  const { search } = useLocation();
  const requested = search.get('gorunum');
  const view: ViewKey = isView(requested) ? requested : 'havuz';
  const category = search.get('kategori') ?? '';
  const config = VIEWS[view];

  const query = new URLSearchParams({ limit: '30' });
  if (config.status !== undefined) query.set('status', config.status);
  // The calendar shows upcoming events only.
  if (view === 'takvim') query.set('from', nowInstant().toString());
  if (config.mine) query.set('mine', 'true');
  if (category !== '') query.set('category', category);

  const events = useQuery({
    queryKey: ['events', query.toString()],
    queryFn: ({ signal }) => listEvents(query, signal),
  });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(search);
    if (value === '') next.delete(key);
    else next.set(key, value);
    navigate(`/etkinlikler?${next.toString()}`, { replace: true });
  };

  return (
    <>
      <PageTitle description="Bilim, kültür ve spor etkinliklerini inceleyin.">
        Etkinlikler
      </PageTitle>
      <div className="mb-lg flex flex-col gap-md md:flex-row md:items-end md:justify-between">
        <nav aria-label="Etkinlik görünümleri">
          <ul className="flex flex-wrap gap-sm">
            {VIEW_KEYS.map((key) => (
              <li key={key}>
                <Link
                  href={`/etkinlikler?gorunum=${key}${category === '' ? '' : `&kategori=${category}`}`}
                  aria-current={key === view ? 'page' : undefined}
                  className="inline-flex min-h-11 items-center rounded-lg border border-input-border px-md font-semibold aria-[current=page]:bg-primary aria-[current=page]:text-on-primary"
                >
                  {VIEWS[key].label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="md:w-64">
          <SelectField
            label="Kategori"
            value={category}
            onChange={(e) => {
              setParam('kategori', e.target.value);
            }}
          >
            <option value="">Tümü</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      {events.status === 'pending' && <StatusMessage>Etkinlikler yükleniyor…</StatusMessage>}
      {events.status === 'error' && (
        <StatusMessage tone="error">Etkinlikler yüklenemedi.</StatusMessage>
      )}
      {events.status === 'success' && events.data.items.length === 0 && (
        <StatusMessage>Bu görünümde etkinlik yok.</StatusMessage>
      )}
      {events.status === 'success' && events.data.items.length > 0 && (
        <ul className="grid gap-lg md:grid-cols-2">
          {events.data.items.map((event, index) => (
            <li key={event.id}>
              <EventCard event={event} eager={index < 2} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
