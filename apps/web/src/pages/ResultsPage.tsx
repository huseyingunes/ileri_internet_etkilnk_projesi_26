import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CATEGORY_LABELS, istanbulDateOf, nowInstant, type Role } from '@etkinlik/shared';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { decideTie, getResults, type VotingResult } from '../api/voting';
import { navigate, useLocation } from '../router';
import { Button, Card, PageTitle, StatusMessage, TextField } from '../ui';

const STATUS_TEXT: Record<VotingResult['status'], string> = {
  winner: 'Kazanan belirlendi ve takvime eklendi.',
  tie_pending: 'Eşitlik var; kazananı yönetici belirleyecek.',
  below_threshold: 'Asgari oy eşiğine ulaşılmadı; kazanan yok.',
  no_votes: 'Oy kullanılmadı.',
};

export function ResultsPage({ role }: { role: Role }) {
  const client = useQueryClient();
  const { search } = useLocation();
  const yesterday = istanbulDateOf(nowInstant()).subtract({ days: 1 }).toString();
  const date = search.get('tarih') ?? yesterday;
  const results = useQuery({ queryKey: ['results', date], queryFn: () => getResults(date) });
  const [notice, setNotice] = useState<string | undefined>();
  const tie = useMutation({
    mutationFn: ({ resultId, eventId }: { resultId: string; eventId: string }) =>
      decideTie(resultId, eventId),
    onSuccess: async () => {
      setNotice('Eşitlik kararı kaydedildi.');
      await client.invalidateQueries({ queryKey: ['results', date] });
    },
    onError: (error) => {
      setNotice(error instanceof ApiError ? error.message : 'Karar kaydedilemedi.');
    },
  });

  return (
    <>
      <PageTitle description="Her kategoride en çok oyu alan etkinlik kendi tarihinde takvime eklenir.">
        Oylama sonuçları
      </PageTitle>
      <div className="mb-lg max-w-xs">
        <TextField
          label="Oylama günü"
          type="date"
          value={date}
          max={yesterday}
          onChange={(e) => {
            navigate(`/sonuclar?tarih=${e.target.value}`, { replace: true });
          }}
        />
      </div>
      {notice !== undefined && <StatusMessage>{notice}</StatusMessage>}
      {results.status === 'pending' && <StatusMessage>Yükleniyor…</StatusMessage>}
      {results.status === 'error' && (
        <StatusMessage tone="error">Sonuçlar yüklenemedi.</StatusMessage>
      )}
      {results.status === 'success' && results.data.items.length === 0 && (
        <StatusMessage>Bu gün için sonuç yok.</StatusMessage>
      )}
      <div className="grid gap-lg">
        {results.data?.items.map((result) => (
          <Card key={result.id}>
            <h2 className="text-xl font-semibold">{CATEGORY_LABELS[result.category]}</h2>
            <p className="mt-xs text-muted-foreground">
              {STATUS_TEXT[result.status]} Toplam {result.totalVotes} oy.
            </p>
            <table className="mt-md w-full text-left">
              <caption className="sr-only">{CATEGORY_LABELS[result.category]} oy dağılımı</caption>
              <thead>
                <tr>
                  <th scope="col" className="py-xs">
                    Etkinlik
                  </th>
                  <th scope="col" className="py-xs text-right">
                    Oy
                  </th>
                  {role === 'admin' && result.status === 'tie_pending' && (
                    <th scope="col" className="py-xs">
                      <span className="sr-only">İşlem</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {result.entries.map((entry) => (
                  <tr key={entry.event.id} className="border-t border-border">
                    <td className="py-sm">
                      {entry.event.title}
                      {result.winner?.id === entry.event.id && <strong> (kazanan)</strong>}
                    </td>
                    <td className="py-sm text-right">{entry.voteCount}</td>
                    {role === 'admin' && result.status === 'tie_pending' && (
                      <td className="py-sm text-right">
                        {result.tiedEventIds.includes(entry.event.id) && (
                          <Button
                            variant="secondary"
                            disabled={tie.isPending}
                            onClick={() => {
                              tie.mutate({ resultId: result.id, eventId: entry.event.id });
                            }}
                          >
                            Kazanan yap<span className="sr-only">: {entry.event.title}</span>
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    </>
  );
}
