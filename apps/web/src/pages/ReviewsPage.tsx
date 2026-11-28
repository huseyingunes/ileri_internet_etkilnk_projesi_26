import { useQuery } from '@tanstack/react-query';
import { listEvents } from '../api/events';
import { PageTitle, StatusMessage } from '../ui';
import { EventCard } from './EventsPage';

/** Proposals waiting for this advisor's (or any, for admins) approval. */
export function ReviewsPage() {
  const query = new URLSearchParams({ status: 'pending_approval', limit: '50' });
  const pending = useQuery({
    queryKey: ['events', query.toString()],
    queryFn: ({ signal }) => listEvents(query, signal),
  });
  return (
    <>
      <PageTitle description="Öğrencilerin onayınızı bekleyen etkinlik önerileri.">
        Onay bekleyenler
      </PageTitle>
      {pending.status === 'pending' && <StatusMessage>Yükleniyor…</StatusMessage>}
      {pending.status === 'error' && (
        <StatusMessage tone="error">Öneriler yüklenemedi.</StatusMessage>
      )}
      {pending.status === 'success' && pending.data.items.length === 0 && (
        <StatusMessage>Onay bekleyen öneri yok.</StatusMessage>
      )}
      {pending.status === 'success' && pending.data.items.length > 0 && (
        <ul className="grid gap-lg md:grid-cols-2">
          {pending.data.items.map((event) => (
            <li key={event.id}>
              <EventCard event={event} eager={false} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
