import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  formatIstanbul,
  istanbulDateOf,
  nowInstant,
  type Settings,
} from '@etkinlik/shared';
import { type SyntheticEvent, useState } from 'react';
import { ApiError } from '../api/client';
import { listEvents } from '../api/events';
import { getSettings, setBallot, updateSettings } from '../api/voting';
import { Button, Card, PageTitle, StatusMessage, TextField } from '../ui';

/** Admin: choose three pool events per category for a future voting day. */
export function DailySelectionPage() {
  const tomorrow = istanbulDateOf(nowInstant()).add({ days: 1 }).toString();
  const [date, setDate] = useState(tomorrow);
  const [picked, setPicked] = useState<Record<Category, string[]>>({
    science: [],
    culture: [],
    sports: [],
  });
  const [result, setResult] = useState<{ tone: 'neutral' | 'error'; text: string } | undefined>();
  const pool = useQuery({
    queryKey: ['events', 'pool-for-selection'],
    queryFn: () => listEvents(new URLSearchParams({ status: 'pool', limit: '100' })),
  });
  const save = useMutation({
    mutationFn: () => setBallot(date, picked),
    onSuccess: () => {
      setResult({ tone: 'neutral', text: `${date} oylaması kaydedildi.` });
    },
    onError: (error) => {
      const detail =
        error instanceof ApiError
          ? [error.message, ...error.fieldErrors.map((f) => f.message)].join(' ')
          : 'Kaydedilemedi.';
      setResult({ tone: 'error', text: detail });
    },
  });
  const toggle = (category: Category, id: string) => {
    setPicked((current) => {
      const list = current[category];
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(0, 3);
      return { ...current, [category]: next };
    });
  };

  return (
    <>
      <PageTitle description="Onaylı havuzdan her kategori için üç etkinlik seçin (toplam dokuz).">
        Günlük oylama seçimi
      </PageTitle>
      <form
        className="grid gap-lg"
        onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <div className="max-w-xs">
          <TextField
            label="Oylama günü"
            type="date"
            required
            min={tomorrow}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
            }}
          />
        </div>
        {pool.status === 'pending' && <StatusMessage>Havuz yükleniyor…</StatusMessage>}
        {CATEGORIES.map((category) => {
          const options = pool.data?.items.filter((e) => e.category === category) ?? [];
          return (
            <Card key={category}>
              <fieldset className="flex flex-col gap-sm">
                <legend className="text-xl font-semibold">
                  {CATEGORY_LABELS[category]} ({picked[category].length}/3)
                </legend>
                {options.length === 0 && (
                  <p className="text-muted-foreground">Bu kategoride havuzda etkinlik yok.</p>
                )}
                {options.map((event) => (
                  <label
                    key={event.id}
                    className="flex min-h-11 cursor-pointer items-center gap-md"
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={picked[category].includes(event.id)}
                      disabled={
                        !picked[category].includes(event.id) && picked[category].length >= 3
                      }
                      onChange={() => {
                        toggle(category, event.id);
                      }}
                    />
                    <span>
                      {event.title} — {formatIstanbul(event.startsAt)}
                    </span>
                  </label>
                ))}
              </fieldset>
            </Card>
          );
        })}
        {result !== undefined && <StatusMessage tone={result.tone}>{result.text}</StatusMessage>}
        <div>
          <Button
            type="submit"
            disabled={save.isPending || CATEGORIES.some((c) => picked[c].length !== 3)}
          >
            Oylamayı kaydet
          </Button>
        </div>
      </form>
    </>
  );
}

/** Admin: validated system settings (zero or negative values are refused). */
export function SettingsPage() {
  const settings = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const [message, setMessage] = useState<{ tone: 'neutral' | 'error'; text: string } | undefined>();
  const save = useMutation({
    mutationFn: (body: Partial<Settings>) => updateSettings(body),
    onSuccess: () => {
      setMessage({ tone: 'neutral', text: 'Ayarlar kaydedildi.' });
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Kaydedilemedi.',
      });
    },
  });
  if (settings.status !== 'success') return <StatusMessage>Ayarlar yükleniyor…</StatusMessage>;
  const data = settings.data;
  return (
    <>
      <PageTitle>Sistem ayarları</PageTitle>
      <Card>
        <form
          className="grid gap-lg md:grid-cols-2"
          onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const num = (name: string) => Number(form.get(name));
            save.mutate({
              minimumVotesToWin: num('minimumVotesToWin'),
              defaultAttendanceRadiusM: num('defaultAttendanceRadiusM'),
              defaultQrRefreshSeconds: num('defaultQrRefreshSeconds'),
              showLiveVoteCounts: form.get('showLiveVoteCounts') === 'on',
            });
          }}
        >
          <TextField
            label="Asgari oy eşiği"
            name="minimumVotesToWin"
            type="number"
            min={1}
            required
            defaultValue={data.minimumVotesToWin}
          />
          <TextField
            label="Varsayılan katılım yarıçapı (metre)"
            name="defaultAttendanceRadiusM"
            type="number"
            min={1}
            max={5000}
            required
            defaultValue={data.defaultAttendanceRadiusM}
          />
          <TextField
            label="Varsayılan QR yenileme süresi (saniye)"
            name="defaultQrRefreshSeconds"
            type="number"
            min={20}
            max={30}
            required
            defaultValue={data.defaultQrRefreshSeconds}
          />
          <label className="flex min-h-11 items-center gap-md self-end">
            <input
              type="checkbox"
              name="showLiveVoteCounts"
              defaultChecked={data.showLiveVoteCounts}
              className="size-5 accent-primary"
            />
            <span>Oylama sürerken oy sayılarını göster</span>
          </label>
          {message !== undefined && (
            <div className="md:col-span-2">
              <StatusMessage tone={message.tone}>{message.text}</StatusMessage>
            </div>
          )}
          <div className="md:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              Kaydet
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
