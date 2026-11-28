import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { applyToEvent, cancelApplication, type EventDetail } from '../api/events';
import { Button, Card, StatusMessage } from '../ui';

/** Apply / cancel for students on calendar events, with capacity and waiting-list state. */
export function ApplyPanel({ event }: { event: EventDetail }) {
  const client = useQueryClient();
  const [message, setMessage] = useState<{ tone: 'neutral' | 'error'; text: string } | undefined>();
  const refresh = () => client.invalidateQueries({ queryKey: ['event', event.id] });
  const apply = useMutation({
    mutationFn: () => applyToEvent(event.id),
    onSuccess: async (application) => {
      setMessage({
        tone: 'neutral',
        text:
          application.status === 'confirmed'
            ? 'Başvurunuz onaylandı.'
            : `Kontenjan dolu; bekleme listesinde ${String(application.waitlistPosition ?? '')}. sıradasınız.`,
      });
      await refresh();
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Başvuru yapılamadı.',
      });
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelApplication(id),
    onSuccess: async () => {
      setMessage({ tone: 'neutral', text: 'Başvurunuz iptal edildi.' });
      await refresh();
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'İptal edilemedi.',
      });
    },
  });

  const application = event.viewer.application;
  const active = application !== undefined && application.status !== 'cancelled';
  const seatsLeft = Math.max(0, event.capacity - event.confirmedCount);

  return (
    <Card className="flex flex-col gap-md">
      <h2 className="text-xl font-semibold">Başvuru</h2>
      <p>
        Kontenjan {event.capacity};{' '}
        {seatsLeft > 0 ? `${String(seatsLeft)} yer boş` : 'kontenjan dolu'}
        {event.waitlistCount > 0 ? `, bekleme listesinde ${String(event.waitlistCount)} kişi` : ''}.
      </p>
      {active && application.status === 'confirmed' && (
        <p className="font-semibold">Başvurunuz onaylı.</p>
      )}
      {active && application.status === 'waitlisted' && (
        <p className="font-semibold">
          Bekleme listesinde {application.waitlistPosition}. sıradasınız.
        </p>
      )}
      <div className="flex flex-wrap gap-sm">
        {!active && (
          <Button
            disabled={apply.isPending}
            onClick={() => {
              apply.mutate();
            }}
          >
            {seatsLeft > 0 ? 'Başvur' : 'Bekleme listesine katıl'}
          </Button>
        )}
        {active && (
          <Button
            variant="secondary"
            disabled={cancel.isPending}
            onClick={() => {
              cancel.mutate(application.id);
            }}
          >
            Başvurumu iptal et
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Oy vermek ile başvurmak birbirinden bağımsızdır.
      </p>
      {message !== undefined && <StatusMessage tone={message.tone}>{message.text}</StatusMessage>}
    </Card>
  );
}
