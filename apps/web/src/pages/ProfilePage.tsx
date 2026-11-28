import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPES,
  OUTBOUND_CHANNELS,
  type Role,
} from '@etkinlik/shared';
import { type SyntheticEvent, useState } from 'react';
import { ApiError } from '../api/client';
import {
  type ConsentKind,
  getInterests,
  getPreferences,
  getProfile,
  listConsents,
  type Preference,
  saveInterests,
  savePreferences,
  setConsent,
  updatePhone,
} from '../api/notifications';
import { MyDataCard } from '../components/MyDataCard';
import { Badge, Button, Card, PageTitle, StatusMessage, TextField } from '../ui';

type Message = { tone: 'neutral' | 'error'; text: string } | undefined;
const errorText = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;

const CONSENTS: { kind: ConsentKind; title: string; text: string }[] = [
  {
    kind: 'location',
    title: 'Konum',
    text: 'Katılım doğrulamasında konumum bir kez okunur; koordinatlarım saklanmaz, yalnızca uzaklık ve zaman kaydedilir.',
  },
  {
    kind: 'whatsapp',
    title: 'WhatsApp',
    text: 'Telefon numaram yalnızca seçtiğim bildirimlerin onaylı WhatsApp şablonlarıyla gönderilmesi için kullanılır.',
  },
  {
    kind: 'photo',
    title: 'Fotoğraf',
    text: 'Etkinliklerde çekilen ve beni gösteren fotoğraflar etkinlik galerisinde yayımlanabilir.',
  },
];

function ConsentsCard() {
  const client = useQueryClient();
  const consents = useQuery({ queryKey: ['consents'], queryFn: listConsents });
  const [message, setMessage] = useState<Message>();
  const toggle = useMutation({
    mutationFn: (input: { kind: ConsentKind; granted: boolean }) =>
      setConsent(input.kind, input.granted),
    onSuccess: async () => {
      setMessage({ tone: 'neutral', text: 'İzin tercihiniz kaydedildi.' });
      await client.invalidateQueries({ queryKey: ['consents'] });
      await client.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (error) => {
      setMessage({ tone: 'error', text: errorText(error, 'İzin güncellenemedi.') });
    },
  });
  return (
    <Card className="flex flex-col gap-md">
      <h2 className="text-xl font-semibold">Açık rızalar</h2>
      <p className="text-sm text-muted-foreground">
        Her izni ayrı ayrı verip istediğiniz zaman geri alabilirsiniz. WhatsApp iznini geri alınca
        telefon numaranız silinir.
      </p>
      {CONSENTS.map((c) => {
        const granted = consents.data?.items.some((i) => i.kind === c.kind && i.granted) === true;
        return (
          <div key={c.kind} className="flex flex-col gap-xs">
            <label className="flex min-h-11 items-center gap-md font-semibold">
              <input
                type="checkbox"
                checked={granted}
                aria-describedby={`consent-${c.kind}`}
                disabled={consents.data === undefined || toggle.isPending}
                onChange={(e) => {
                  toggle.mutate({ kind: c.kind, granted: e.target.checked });
                }}
                className="size-5 accent-primary"
              />
              {c.title}
            </label>
            <p id={`consent-${c.kind}`} className="text-sm">
              {c.text}
            </p>
          </div>
        );
      })}
      {message !== undefined && <StatusMessage tone={message.tone}>{message.text}</StatusMessage>}
    </Card>
  );
}

function PhoneCard() {
  const client = useQueryClient();
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile });
  const consents = useQuery({ queryKey: ['consents'], queryFn: listConsents });
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: (phone: string | null) => updatePhone(phone),
    onSuccess: async () => {
      setError(undefined);
      setSaved(true);
      await client.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (e) => {
      setSaved(false);
      setError(e instanceof ApiError ? (e.fieldError('phone') ?? e.message) : 'Kaydedilemedi.');
    },
  });
  const whatsapp = consents.data?.items.some((i) => i.kind === 'whatsapp' && i.granted) === true;
  if (!whatsapp || profile.data === undefined) return null;
  return (
    <Card>
      <form
        className="flex flex-col gap-md"
        onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get('phone');
          const phone = typeof value === 'string' ? value.replace(/\s/g, '') : '';
          save.mutate(phone === '' ? null : phone);
        }}
      >
        <h2 className="text-xl font-semibold">WhatsApp numarası</h2>
        <TextField
          label="Telefon numarası"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="+905551112233"
          hint="Ülke koduyla, örneğin +90 ile başlayarak yazın."
          defaultValue={profile.data.phone ?? ''}
          error={error}
        />
        <div>
          <Button type="submit" disabled={save.isPending}>
            Numarayı kaydet
          </Button>
        </div>
        {saved && <StatusMessage>Telefon numaranız kaydedildi.</StatusMessage>}
      </form>
    </Card>
  );
}

function PreferencesCard() {
  const client = useQueryClient();
  const prefs = useQuery({ queryKey: ['notification-preferences'], queryFn: getPreferences });
  const [message, setMessage] = useState<Message>();
  const save = useMutation({
    mutationFn: (items: Preference[]) => savePreferences(items),
    onSuccess: async () => {
      setMessage({ tone: 'neutral', text: 'Bildirim tercihleriniz kaydedildi.' });
      await client.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
    onError: (error) => {
      setMessage({ tone: 'error', text: errorText(error, 'Tercihler kaydedilemedi.') });
    },
  });
  if (prefs.data === undefined) return null;
  const enabled = (channel: Preference['channel'], type: Preference['type']) =>
    prefs.data.items.find((p) => p.channel === channel && p.type === type)?.enabled ?? false;
  return (
    <Card>
      <form
        className="flex flex-col gap-md"
        onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          save.mutate(
            OUTBOUND_CHANNELS.flatMap((channel) =>
              NOTIFICATION_TYPES.map((type) => ({
                channel,
                type,
                enabled: form.get(`${channel}:${type}`) === 'on',
              })),
            ),
          );
        }}
      >
        <h2 className="text-xl font-semibold">Bildirim tercihleri</h2>
        <p className="text-sm text-muted-foreground">
          Bildirimler her zaman uygulama içinde görünür. WhatsApp yalnızca izin verdiyseniz ve
          numaranızı kaydettiyseniz kullanılır.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Bildirim türlerine göre kanal seçimi</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="p-sm">
                  Bildirim
                </th>
                <th scope="col" className="p-sm text-center">
                  E-posta
                </th>
                <th scope="col" className="p-sm text-center">
                  WhatsApp
                </th>
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_TYPES.map((type) => (
                <tr key={type} className="border-b border-border">
                  <th scope="row" className="p-sm font-normal">
                    {NOTIFICATION_TYPE_LABELS[type]}
                  </th>
                  {OUTBOUND_CHANNELS.map((channel) => (
                    <td key={channel} className="p-sm text-center">
                      <input
                        type="checkbox"
                        name={`${channel}:${type}`}
                        defaultChecked={enabled(channel, type)}
                        aria-label={`${NOTIFICATION_TYPE_LABELS[type]}: ${channel === 'email' ? 'E-posta' : 'WhatsApp'}`}
                        className="size-6 accent-primary"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <Button type="submit" disabled={save.isPending}>
            Tercihleri kaydet
          </Button>
        </div>
        {message !== undefined && <StatusMessage tone={message.tone}>{message.text}</StatusMessage>}
      </form>
    </Card>
  );
}

function InterestsCard() {
  const client = useQueryClient();
  const interests = useQuery({ queryKey: ['interests'], queryFn: getInterests });
  const [message, setMessage] = useState<Message>();
  const save = useMutation({
    mutationFn: (selected: string[]) => saveInterests(selected),
    onSuccess: async () => {
      setMessage({ tone: 'neutral', text: 'İlgi alanlarınız kaydedildi.' });
      await client.invalidateQueries({ queryKey: ['interests'] });
    },
    onError: (error) => {
      setMessage({ tone: 'error', text: errorText(error, 'İlgi alanları kaydedilemedi.') });
    },
  });
  if (interests.data === undefined) return null;
  return (
    <Card>
      <form
        className="flex flex-col gap-md"
        onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
          event.preventDefault();
          const value = new FormData(event.currentTarget).get('interests');
          const tags = (typeof value === 'string' ? value : '')
            .split(',')
            .map((tag) => tag.trim().toLocaleLowerCase('tr'))
            .filter((tag) => tag !== '');
          save.mutate([...new Set(tags)]);
        }}
      >
        <h2 className="text-xl font-semibold">İlgi alanları</h2>
        <TextField
          label="Seçtiğiniz ilgi alanları"
          name="interests"
          hint="Virgülle ayırın, örneğin: robotik, tiyatro, satranç. Eşleşen etkinlikler oylamaya açıldığında davet alırsınız."
          defaultValue={interests.data.selected.join(', ')}
          maxLength={1600}
        />
        {interests.data.inferred.length > 0 && (
          <div>
            <p className="mb-xs text-sm font-semibold">
              Oy, katılım ve değerlendirmelerinizden çıkarılanlar
            </p>
            <ul className="flex flex-wrap gap-sm">
              {interests.data.inferred.map((tag) => (
                <li key={tag}>
                  <Badge>#{tag}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <Button type="submit" disabled={save.isPending}>
            İlgi alanlarını kaydet
          </Button>
        </div>
        {message !== undefined && <StatusMessage tone={message.tone}>{message.text}</StatusMessage>}
      </form>
    </Card>
  );
}

/** Profile: consents (KVKK), WhatsApp number, notification preferences and interests. */
export function ProfilePage({ role }: { role: Role }) {
  return (
    <>
      <PageTitle description="İzinlerinizi, bildirim tercihlerinizi ve ilgi alanlarınızı buradan yönetin.">
        Profil ve bildirimler
      </PageTitle>
      <div className="flex flex-col gap-lg">
        <ConsentsCard />
        <PhoneCard />
        <PreferencesCard />
        {role === 'student' && <InterestsCard />}
        <MyDataCard />
      </div>
    </>
  );
}
