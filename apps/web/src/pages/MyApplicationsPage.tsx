import { useQuery } from '@tanstack/react-query';
import { formatIstanbul } from '@etkinlik/shared';
import { myApplications } from '../api/events';
import { Link } from '../router';
import { Card, PageTitle, StatusMessage } from '../ui';

const STATUS = {
  confirmed: 'Onaylı',
  waitlisted: 'Bekleme listesinde',
  cancelled: 'İptal edildi',
} as const;

export function MyApplicationsPage() {
  const list = useQuery({ queryKey: ['my-applications'], queryFn: myApplications });
  return (
    <>
      <PageTitle>Başvurularım</PageTitle>
      {list.status === 'pending' && <StatusMessage>Yükleniyor…</StatusMessage>}
      {list.status === 'error' && (
        <StatusMessage tone="error">Başvurular yüklenemedi.</StatusMessage>
      )}
      {list.status === 'success' && list.data.items.length === 0 && (
        <StatusMessage>Henüz başvurunuz yok.</StatusMessage>
      )}
      <ul className="grid gap-md">
        {list.data?.items.map((item) => (
          <li key={item.id}>
            <Card>
              <h2 className="text-lg font-semibold">
                <Link
                  href={`/etkinlikler/${item.event.id}`}
                  className="underline-offset-4 hover:underline"
                >
                  {item.event.title}
                </Link>
              </h2>
              <p className="mt-xs text-sm text-muted-foreground">
                <time dateTime={item.event.startsAt}>{formatIstanbul(item.event.startsAt)}</time> ·{' '}
                {item.event.location.name}
              </p>
              <p className="mt-sm font-semibold">
                {STATUS[item.status]}
                {item.status === 'waitlisted' && item.waitlistPosition !== undefined
                  ? ` (${String(item.waitlistPosition)}. sıra)`
                  : ''}
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
