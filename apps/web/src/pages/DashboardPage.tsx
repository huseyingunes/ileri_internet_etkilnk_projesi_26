import { useQuery } from '@tanstack/react-query';
import { CATEGORIES, CATEGORY_LABELS, type Category } from '@etkinlik/shared';
import { type ReactNode, useState } from 'react';
import { getAnalyticsOverview } from '../api/analytics';
import { listSeasons } from '../api/scoring';
import { Card, PageTitle, SelectField, StatusMessage } from '../ui';
import { CategoryChart, SingleBarChart } from './DashboardCharts';

const percent = (rate: number | null) =>
  rate === null ? '—' : `%${String(Math.round(rate * 100))}`;
const decimal = (value: number | null) =>
  value === null ? '—' : value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}.00`;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card>
      <section aria-labelledby={id} className="flex flex-col gap-md">
        <h2 id={id} className="text-xl font-semibold">
          {title}
        </h2>
        {children}
      </section>
    </Card>
  );
}

function DataTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be keyboard reachable (axe scrollable-region-focusable).
    <div role="region" aria-label={caption} tabIndex={0} className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border">
            {headers.map((h, i) => (
              <th key={h} scope="col" className={`p-sm ${i === 0 ? '' : 'text-right'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row[0])} className="border-b border-border">
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="p-sm font-normal">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className="p-sm text-right tabular-nums">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Admin and advisor dashboard; loaded lazily together with the chart library. */
export function DashboardPage() {
  const [season, setSeason] = useState<string | undefined>();
  const [category, setCategory] = useState<Category | undefined>();
  const seasons = useQuery({ queryKey: ['seasons'], queryFn: listSeasons });
  const overview = useQuery({
    queryKey: ['analytics', season, category],
    queryFn: () => getAnalyticsOverview(season, category),
  });
  const data = overview.data;

  return (
    <>
      <PageTitle description="Göstergeler her 15 dakikada yenilenir. Danışmanlar yalnızca danışmanı oldukları etkinlikleri görür.">
        Yönetici paneli
      </PageTitle>
      <div className="mb-lg flex flex-wrap gap-md">
        <div className="w-full sm:w-56">
          <SelectField
            label="Sezon"
            value={season ?? ''}
            onChange={(e) => {
              setSeason(e.target.value === '' ? undefined : e.target.value);
            }}
          >
            <option value="">Güncel sezon</option>
            {seasons.data?.items.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="w-full sm:w-56">
          <SelectField
            label="Kategori"
            value={category ?? ''}
            onChange={(e) => {
              const value = CATEGORIES.find((c) => c === e.target.value);
              setCategory(value);
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
      {overview.status === 'pending' && <StatusMessage>Göstergeler yükleniyor…</StatusMessage>}
      {overview.status === 'error' && (
        <StatusMessage tone="error">Göstergeler yüklenemedi.</StatusMessage>
      )}
      {data !== undefined && (
        <div className="flex flex-col gap-lg">
          <dl className="grid grid-cols-2 gap-md lg:grid-cols-4">
            {[
              { label: 'Kayıtlı öğrenci', value: String(data.registeredStudents) },
              { label: 'Gerçekleşen etkinlik', value: String(data.completedEvents) },
              { label: 'Oy verenlerin katılım oranı', value: percent(data.voterAttendanceRate) },
              { label: 'Ortalama etkinlik puanı', value: decimal(data.averageRating) },
            ].map((tile) => (
              <div
                key={tile.label}
                className="flex flex-col-reverse gap-xs rounded-xl border border-border bg-card p-lg"
              >
                <dt className="text-sm text-muted-foreground">{tile.label}</dt>
                <dd className="text-3xl font-bold tabular-nums">{tile.value}</dd>
              </div>
            ))}
          </dl>

          <Section id="by-category" title="Kategori bazında oy ve katılım">
            <CategoryChart
              data={data.byCategory.map((c) => ({
                label: CATEGORY_LABELS[c.category],
                votes: c.votes,
                attendees: c.attendees,
              }))}
            />
            <DataTable
              caption="Kategori bazında oy ve katılımcı sayıları"
              headers={['Kategori', 'Oy', 'Katılımcı']}
              rows={data.byCategory.map((c) => [CATEGORY_LABELS[c.category], c.votes, c.attendees])}
            />
          </Section>

          <Section id="reasons" title="Katılmama nedenleri">
            {data.nonAttendanceReasons.length === 0 ? (
              <StatusMessage>Bu dönemde yanıtlanmış "neden katılmadınız" sorusu yok.</StatusMessage>
            ) : (
              <>
                <SingleBarChart
                  horizontal
                  name="Yanıt"
                  data={data.nonAttendanceReasons.map((r) => ({ label: r.label, value: r.count }))}
                />
                <DataTable
                  caption="Katılmama nedenlerinin dağılımı"
                  headers={['Neden', 'Yanıt']}
                  rows={data.nonAttendanceReasons.map((r) => [r.label, r.count])}
                />
                <p className="text-sm text-muted-foreground">
                  Yanıtlar şimdilik anahtar kelimelerle sınıflandırılır; ileride yapay zekâ
                  sınıflandırması aynı arayüzün arkasına eklenecek.
                </p>
              </>
            )}
          </Section>

          <Section id="hours" title="Saatlere göre katılım">
            {data.attendanceByHour.length === 0 ? (
              <StatusMessage>Bu dönemde katılım verisi yok.</StatusMessage>
            ) : (
              <>
                <SingleBarChart
                  name="Katılımcı"
                  data={data.attendanceByHour.map((h) => ({
                    label: hourLabel(h.hour),
                    value: h.attendees,
                  }))}
                />
                <DataTable
                  caption="Etkinlik başlangıç saatine göre katılımcı sayısı (İstanbul saati)"
                  headers={['Başlangıç saati', 'Katılımcı']}
                  rows={data.attendanceByHour.map((h) => [hourLabel(h.hour), h.attendees])}
                />
              </>
            )}
          </Section>

          <Section id="communities" title="Toplulukların başarısı">
            {data.communities.length === 0 ? (
              <StatusMessage>Bu dönemde topluluk etkinliği gerçekleşmedi.</StatusMessage>
            ) : (
              <DataTable
                caption="Toplulukların gerçekleşen etkinlik, kazanılan oylama ve ortalama puanları"
                headers={['Topluluk', 'Gerçekleşen etkinlik', 'Kazanılan oylama', 'Ortalama puan']}
                rows={data.communities.map((c) => [
                  c.community.name,
                  c.completedEvents,
                  c.wins,
                  decimal(c.averageRating),
                ])}
              />
            )}
          </Section>
        </div>
      )}
    </>
  );
}
