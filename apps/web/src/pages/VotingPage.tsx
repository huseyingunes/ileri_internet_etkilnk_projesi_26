import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  formatIstanbul,
  type Role,
} from '@etkinlik/shared';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { castVote, getBallot } from '../api/voting';
import { Link } from '../router';
import { Button, Card, PageTitle, StatusMessage } from '../ui';

/** Today's ballot: one native radio group per category, one vote per category. */
export function VotingPage({ role }: { role: Role }) {
  const client = useQueryClient();
  const ballot = useQuery({
    queryKey: ['ballot'],
    queryFn: () => getBallot(),
    refetchInterval: 30_000,
  });
  const [choice, setChoice] = useState<Partial<Record<Category, string>>>({});
  const [messages, setMessages] = useState<
    Partial<Record<Category, { tone: 'neutral' | 'error'; text: string }>>
  >({});
  const vote = useMutation({
    mutationFn: ({ entryId }: { category: Category; entryId: string }) => castVote(entryId),
    onSuccess: async (_data, { category }) => {
      setMessages((m) => ({ ...m, [category]: { tone: 'neutral', text: 'Oyunuz kaydedildi.' } }));
      await client.invalidateQueries({ queryKey: ['ballot'] });
    },
    onError: (error, { category }) => {
      setMessages((m) => ({
        ...m,
        [category]: {
          tone: 'error',
          text: error instanceof ApiError ? error.message : 'Oy kaydedilemedi.',
        },
      }));
    },
  });

  if (ballot.status === 'pending') return <StatusMessage>Oylama yükleniyor…</StatusMessage>;
  if (ballot.status === 'error') {
    const notFound = ballot.error instanceof ApiError && ballot.error.status === 404;
    return (
      <>
        <PageTitle>Günün oylaması</PageTitle>
        <StatusMessage tone={notFound ? 'neutral' : 'error'}>
          {notFound ? 'Bugün için oylama yok.' : 'Oylama yüklenemedi.'}
        </StatusMessage>
      </>
    );
  }
  const data = ballot.data;

  return (
    <>
      <PageTitle
        description={`Oylama ${formatIstanbul(data.closesAt, { dateStyle: 'long', timeStyle: 'short' })} saatinde kapanır. Her kategoride en fazla bir etkinliğe oy verebilirsiniz; üç kategoride de oy vermek zorunda değilsiniz.`}
      >
        Günün oylaması
      </PageTitle>
      <div className="grid gap-lg">
        {CATEGORIES.map((category) => {
          const entries = data.categories[category];
          if (entries.length === 0) return null;
          const voted = data.myVotes?.[category] ?? null;
          const message = messages[category];
          return (
            <Card key={category}>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const entryId = choice[category];
                  if (entryId !== undefined) vote.mutate({ category, entryId });
                }}
              >
                <fieldset
                  className="flex flex-col gap-sm"
                  disabled={role !== 'student' || voted !== null}
                >
                  <legend className="mb-sm text-xl font-semibold">
                    {CATEGORY_LABELS[category]}
                  </legend>
                  {entries.map((entry) => (
                    <label
                      key={entry.id}
                      className="flex min-h-11 cursor-pointer items-center gap-md rounded-lg border border-input-border p-md has-[:checked]:border-primary"
                    >
                      <input
                        type="radio"
                        name={`vote-${category}`}
                        value={entry.id}
                        required
                        checked={(voted ?? choice[category]) === entry.id}
                        onChange={() => {
                          setChoice((c) => ({ ...c, [category]: entry.id }));
                        }}
                        className="size-5 accent-primary"
                      />
                      <span className="flex-1">
                        <span className="block font-semibold">{entry.event.title}</span>
                        <span className="block text-sm text-muted-foreground">
                          {formatIstanbul(entry.event.startsAt)} · {entry.event.location.name}
                        </span>
                      </span>
                      {entry.voteCount !== null && (
                        <span className="text-sm">{entry.voteCount} oy</span>
                      )}
                    </label>
                  ))}
                  {role === 'student' && voted === null && (
                    <div>
                      <Button type="submit" disabled={vote.isPending}>
                        {CATEGORY_LABELS[category]} için oy ver
                      </Button>
                    </div>
                  )}
                  {voted !== null && (
                    <p className="text-sm text-muted-foreground">Bu kategoride oy verdiniz.</p>
                  )}
                </fieldset>
                {message !== undefined && (
                  <div className="mt-sm">
                    <StatusMessage tone={message.tone}>{message.text}</StatusMessage>
                  </div>
                )}
              </form>
            </Card>
          );
        })}
      </div>
      <p className="mt-lg">
        <Link href="/sonuclar" className="font-semibold underline underline-offset-4">
          Önceki günün sonuçları
        </Link>
      </p>
    </>
  );
}
