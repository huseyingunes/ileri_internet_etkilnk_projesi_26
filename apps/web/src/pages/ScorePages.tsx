import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatIstanbul, type Role, SCORE_RULE_CODES, type ScoreRuleCode } from '@etkinlik/shared';
import { type SyntheticEvent, useState } from 'react';
import { ApiError } from '../api/client';
import {
  getLeaderboard,
  getMyScore,
  getMyScoreEntries,
  listScoreRules,
  listSeasons,
  RULE_LABELS,
  type ScoreSummary,
  updateScoreRule,
} from '../api/scoring';
import { Link } from '../router';
import { Button, Card, PageTitle, SelectField, StatusMessage, TextField } from '../ui';

const signed = (points: number) => (points > 0 ? `+${String(points)}` : String(points));
const percent = (rate: number | null) =>
  rate === null ? '—' : `%${String(Math.round(rate * 100))}`;

function SummaryCards({ summary }: { summary: ScoreSummary }) {
  const items = [
    { label: 'Puan', value: String(summary.points) },
    { label: 'Sıra', value: summary.rank === null ? '—' : `${String(summary.rank)}.` },
    { label: 'Katıldığı etkinlik', value: String(summary.attendedCount) },
    { label: 'Kullandığı oy', value: String(summary.votedCount) },
    { label: 'Oy verdiği kazananlara katılım', value: percent(summary.attendanceRateAfterVoting) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-md sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col-reverse gap-xs rounded-xl border border-border bg-card p-lg text-card-foreground"
        >
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="text-2xl font-bold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SeasonSelect({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (season: string | undefined) => void;
}) {
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: listSeasons });
  if (seasons.data === undefined || seasons.data.items.length < 2) return null;
  return (
    <div className="max-w-xs">
      <SelectField
        label="Sezon (akademik yıl)"
        value={value ?? ''}
        onChange={(e) => {
          onChange(e.target.value === '' ? undefined : e.target.value);
        }}
      >
        <option value="">Güncel sezon</option>
        {seasons.data.items.map((s) => (
          <option key={s.name} value={s.name}>
            {s.name}
            {s.status === 'closed' ? ' (arşiv)' : ''}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

/** Student: points, rank, statistics and the ledger history of a season. */
export function MyScorePage() {
  const [season, setSeason] = useState<string | undefined>();
  const summary = useQuery({ queryKey: ['my-score', season], queryFn: () => getMyScore(season) });
  const entries = useQuery({
    queryKey: ['my-score-entries', season],
    queryFn: () => getMyScoreEntries(season),
  });
  return (
    <>
      <PageTitle description="Her akademik yıl 1500 puanla başlar. Puanlar oy verdiğiniz ve katıldığınız etkinliklere göre değişir.">
        Puanım
      </PageTitle>
      <div className="flex flex-col gap-lg">
        <SeasonSelect value={season} onChange={setSeason} />
        {summary.status === 'error' && (
          <StatusMessage tone="error">Puan bilgisi yüklenemedi.</StatusMessage>
        )}
        {summary.data !== undefined && <SummaryCards summary={summary.data} />}
        <section aria-labelledby="history-title">
          <h2 id="history-title" className="mb-sm text-xl font-semibold">
            Puan geçmişi
          </h2>
          {entries.data?.items.length === 0 && (
            <StatusMessage>Bu sezonda henüz puan hareketi yok.</StatusMessage>
          )}
          {entries.data !== undefined && entries.data.items.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Etkinliklere göre puan hareketleri</caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="p-sm">
                      Etkinlik
                    </th>
                    <th scope="col" className="p-sm">
                      Durum
                    </th>
                    <th scope="col" className="p-sm text-right">
                      Puan
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.data.items.map((entry) => (
                    <tr
                      key={`${entry.event.id}-${entry.ruleCode}`}
                      className="border-b border-border"
                    >
                      <td className="p-sm">
                        <Link
                          href={`/etkinlikler/${entry.event.id}`}
                          className="underline underline-offset-4"
                        >
                          {entry.event.title}
                        </Link>
                        <span className="block text-sm text-muted-foreground">
                          <time dateTime={entry.createdAt}>{formatIstanbul(entry.createdAt)}</time>
                        </span>
                      </td>
                      <td className="p-sm">{RULE_LABELS[entry.ruleCode]}</td>
                      <td className="p-sm text-right font-semibold tabular-nums">
                        {signed(entry.points)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <p>
          <Link href="/puan-tablosu" className="underline underline-offset-4">
            Puan tablosunu görün
          </Link>
        </p>
      </div>
    </>
  );
}

/** Everyone: top 10 of a season; students also see their own standing. */
export function LeaderboardPage() {
  const [season, setSeason] = useState<string | undefined>();
  const board = useQuery({
    queryKey: ['leaderboard', season],
    queryFn: () => getLeaderboard(season),
  });
  return (
    <>
      <PageTitle description="Akademik yılın en yüksek puanlı 10 öğrencisi. Geçmiş yılların sıralamaları arşivde saklanır.">
        Liderlik tablosu
      </PageTitle>
      <div className="flex flex-col gap-lg">
        <SeasonSelect value={season} onChange={setSeason} />
        {board.status === 'error' && (
          <StatusMessage tone="error">Liderlik tablosu yüklenemedi.</StatusMessage>
        )}
        {board.data !== undefined && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <caption className="mb-sm text-left text-muted-foreground">
                  {board.data.season.name} sezonu
                  {board.data.season.status === 'closed' ? ' (arşiv)' : ''}
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="p-sm">
                      Sıra
                    </th>
                    <th scope="col" className="p-sm">
                      Öğrenci
                    </th>
                    <th scope="col" className="p-sm text-right">
                      Puan
                    </th>
                    <th scope="col" className="p-sm text-right">
                      Katıldığı etkinlik
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {board.data.entries.map((entry) => (
                    <tr key={entry.student.id} className="border-b border-border">
                      <td className="p-sm font-semibold tabular-nums">{entry.rank}.</td>
                      <td className="p-sm">{entry.student.displayName}</td>
                      <td className="p-sm text-right tabular-nums">{entry.points}</td>
                      <td className="p-sm text-right tabular-nums">{entry.attendedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {board.data.me !== undefined && (
              <section aria-labelledby="me-title" className="flex flex-col gap-sm">
                <h2 id="me-title" className="text-xl font-semibold">
                  Sizin durumunuz
                </h2>
                <SummaryCards summary={board.data.me} />
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function RuleRow({
  code,
  points,
  editable,
}: {
  code: ScoreRuleCode;
  points: number;
  editable: boolean;
}) {
  const client = useQueryClient();
  const [message, setMessage] = useState<{ tone: 'neutral' | 'error'; text: string }>();
  const save = useMutation({
    mutationFn: (value: number) => updateScoreRule(code, value),
    onSuccess: async () => {
      setMessage({ tone: 'neutral', text: 'Kaydedildi. Bundan sonraki etkinliklere uygulanır.' });
      await client.invalidateQueries({ queryKey: ['score-rules'] });
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Kaydedilemedi.',
      });
    },
  });
  if (!editable) {
    return (
      <tr className="border-b border-border">
        <th scope="row" className="p-sm text-left font-normal">
          {RULE_LABELS[code]}
        </th>
        <td className="p-sm text-right font-semibold tabular-nums">{signed(points)}</td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-border">
      <th scope="row" className="p-sm text-left font-normal">
        {RULE_LABELS[code]}
      </th>
      <td className="p-sm">
        <form
          className="flex flex-wrap items-end justify-end gap-sm"
          onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
            event.preventDefault();
            save.mutate(Number(new FormData(event.currentTarget).get('points')));
          }}
        >
          <div className="w-32">
            <TextField
              label="Puan"
              name="points"
              type="number"
              min={-1000}
              max={1000}
              step={1}
              required
              defaultValue={points}
            />
          </div>
          <Button type="submit" variant="secondary" disabled={save.isPending}>
            Kaydet
          </Button>
        </form>
        {message !== undefined && <StatusMessage tone={message.tone}>{message.text}</StatusMessage>}
      </td>
    </tr>
  );
}

/** The point table; admins can change values (each change is a new, audited version). */
export function ScoreRulesPage({ role }: { role: Role }) {
  const rules = useQuery({ queryKey: ['score-rules'], queryFn: listScoreRules });
  return (
    <>
      <PageTitle description="Puanlar her akademik yıl 1500'den başlar. Mazereti onaylanan ya da kontenjan dolduğu için katılamayan öğrenci puan kaybetmez; iptal edilen etkinlik puanları etkilemez.">
        Puan tablosu
      </PageTitle>
      {rules.status === 'error' && (
        <StatusMessage tone="error">Puan tablosu yüklenemedi.</StatusMessage>
      )}
      {rules.data !== undefined && (
        <Card>
          <table className="w-full border-collapse">
            <caption className="sr-only">Durumlara göre puan değerleri</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="p-sm text-left">
                  Durum (kategori bazında)
                </th>
                <th scope="col" className="p-sm text-right">
                  Puan
                </th>
              </tr>
            </thead>
            <tbody>
              {SCORE_RULE_CODES.map((code) => {
                const rule = rules.data.items.find((r) => r.code === code);
                return rule === undefined ? null : (
                  <RuleRow
                    key={code}
                    code={code}
                    points={rule.points}
                    editable={role === 'admin'}
                  />
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
