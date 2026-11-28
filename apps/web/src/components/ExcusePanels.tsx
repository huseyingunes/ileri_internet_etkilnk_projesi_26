import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatIstanbul } from '@etkinlik/shared';
import { type SyntheticEvent, useState } from 'react';
import { ApiError } from '../api/client';
import { listExcuses, reviewExcuse, submitExcuse } from '../api/scoring';
import { Button, Card, StatusMessage, TextArea } from '../ui';

const STATUS = { pending: 'Bekliyor', approved: 'Onaylandı', rejected: 'Reddedildi' } as const;

/** Student with a confirmed seat: tell the advisor why they cannot attend. */
export function ExcuseForm({ eventId }: { eventId: string }) {
  const [message, setMessage] = useState<{ tone: 'neutral' | 'error'; text: string }>();
  const [done, setDone] = useState(false);
  const submit = useMutation({
    mutationFn: (reason: string) => submitExcuse(eventId, reason),
    onSuccess: () => {
      setDone(true);
      setMessage({
        tone: 'neutral',
        text: 'Mazeretiniz danışmana iletildi. Onaylanırsa bu etkinlik için puan kaybetmezsiniz.',
      });
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Mazeret gönderilemedi.',
      });
    },
  });
  return (
    <Card>
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold">
          Katılamayacak mısınız? Mazeret bildirin
        </summary>
        {!done && (
          <form
            className="mt-md flex flex-col gap-md"
            onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
              event.preventDefault();
              const reason = new FormData(event.currentTarget).get('reason');
              submit.mutate(typeof reason === 'string' ? reason : '');
            }}
          >
            <TextArea
              label="Mazeretiniz"
              name="reason"
              required
              minLength={1}
              maxLength={2000}
              hint="Danışman mazeretinizi değerlendirir. Sağlık bilgisi gibi ayrıntıları yazmanız gerekmez."
            />
            <div>
              <Button type="submit" disabled={submit.isPending}>
                Mazereti gönder
              </Button>
            </div>
          </form>
        )}
        {message !== undefined && (
          <div className="mt-sm">
            <StatusMessage tone={message.tone}>{message.text}</StatusMessage>
          </div>
        )}
      </details>
    </Card>
  );
}

/** Advisor of the event or an admin: approve or reject submitted excuses. */
export function ExcuseReviewList({ eventId }: { eventId: string }) {
  const client = useQueryClient();
  const excuses = useQuery({ queryKey: ['excuses', eventId], queryFn: () => listExcuses(eventId) });
  const [error, setError] = useState<string>();
  const review = useMutation({
    mutationFn: (input: { id: string; decision: 'approve' | 'reject' }) =>
      reviewExcuse(input.id, input.decision),
    onSuccess: async () => {
      setError(undefined);
      await client.invalidateQueries({ queryKey: ['excuses', eventId] });
    },
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'İşlem tamamlanamadı.');
    },
  });
  if (excuses.data === undefined || excuses.data.items.length === 0) return null;
  return (
    <section aria-labelledby="excuses-title" className="flex flex-col gap-sm">
      <h2 id="excuses-title" className="text-xl font-semibold">
        Mazeretler
      </h2>
      {error !== undefined && <StatusMessage tone="error">{error}</StatusMessage>}
      <ul className="grid gap-sm">
        {excuses.data.items.map((excuse) => (
          <li key={excuse.id}>
            <Card className="flex flex-col gap-sm">
              <p className="font-semibold">
                {excuse.student.displayName}{' '}
                <span className="font-normal text-muted-foreground">
                  · <time dateTime={excuse.createdAt}>{formatIstanbul(excuse.createdAt)}</time> ·{' '}
                  {STATUS[excuse.status]}
                </span>
              </p>
              <p className="whitespace-pre-line">{excuse.reason}</p>
              {excuse.status === 'pending' && (
                <div className="flex flex-wrap gap-sm">
                  <Button
                    disabled={review.isPending}
                    onClick={() => {
                      review.mutate({ id: excuse.id, decision: 'approve' });
                    }}
                  >
                    Onayla
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={review.isPending}
                    onClick={() => {
                      review.mutate({ id: excuse.id, decision: 'reject' });
                    }}
                  >
                    Reddet
                  </Button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
