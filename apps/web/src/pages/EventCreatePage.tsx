import { useMutation, useQuery } from '@tanstack/react-query';
import { CATEGORIES, CATEGORY_LABELS, istanbulLocalToIso, type Role } from '@etkinlik/shared';
import { type SyntheticEvent, useState } from 'react';
import { ApiError } from '../api/client';
import { createEvent, listAdvisors } from '../api/events';
import { navigate } from '../router';
import { Button, Card, PageTitle, SelectField, StatusMessage, TextArea, TextField } from '../ui';

const DEFAULTS = { capacity: '50', radius: '100', qr: '25' };

/** Proposal form: native validation first, server field errors next to each field. */
export function EventCreatePage({ role }: { role: Role }) {
  const advisors = useQuery({
    queryKey: ['advisors'],
    queryFn: listAdvisors,
    enabled: role === 'student',
  });
  const [error, setError] = useState<ApiError | undefined>();
  const create = useMutation({
    mutationFn: createEvent,
    onSuccess: (event) => {
      navigate(`/etkinlikler/${event.id}`);
    },
    onError: (e) => {
      setError(
        e instanceof ApiError ? e : new ApiError(500, 'INTERNAL_ERROR', 'Öneri gönderilemedi.', []),
      );
    },
  });

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = form.get(name);
      return typeof value === 'string' ? value.trim() : '';
    };
    const advisorId = text('advisorId');
    create.mutate({
      title: text('title'),
      description: text('description'),
      category: text('category'),
      ...(advisorId === '' ? {} : { advisorId }),
      startsAt: istanbulLocalToIso(text('startsAt')),
      endsAt: istanbulLocalToIso(text('endsAt')),
      location: {
        name: text('locationName'),
        latitude: Number(text('latitude')),
        longitude: Number(text('longitude')),
      },
      capacity: Number(text('capacity')),
      attendanceRadiusM: Number(text('radius')),
      qrRefreshSeconds: Number(text('qr')),
      participationRequirements: text('requirements'),
      tags: text('tags')
        .split(',')
        .map((tag) => tag.trim().toLocaleLowerCase('tr-TR'))
        .filter((tag) => tag !== ''),
    });
  };
  const fieldError = (field: string) => error?.fieldError(field);

  return (
    <>
      <PageTitle
        description={
          role === 'student'
            ? 'Öneriniz seçtiğiniz danışmanın onayından sonra oylama havuzuna girer.'
            : 'Öneriniz doğrudan oylama havuzuna girer.'
        }
      >
        Etkinlik öner
      </PageTitle>
      <Card>
        <form noValidate={false} onSubmit={submit} className="grid gap-lg md:grid-cols-2">
          {error !== undefined && (
            <div className="md:col-span-2">
              <StatusMessage tone="error">{error.message}</StatusMessage>
            </div>
          )}
          <div className="md:col-span-2">
            <TextField
              label="Başlık"
              name="title"
              required
              minLength={3}
              maxLength={200}
              error={fieldError('title')}
            />
          </div>
          <div className="md:col-span-2">
            <TextArea
              label="Açıklama"
              name="description"
              required
              maxLength={5000}
              error={fieldError('description')}
            />
          </div>
          <SelectField
            label="Kategori"
            name="category"
            required
            defaultValue=""
            error={fieldError('category')}
          >
            <option value="" disabled>
              Seçin
            </option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </SelectField>
          {role === 'student' && (
            <SelectField
              label="Danışman"
              name="advisorId"
              required
              defaultValue=""
              hint="Önerinizi onaylayacak danışman."
              error={fieldError('advisorId')}
            >
              <option value="" disabled>
                {advisors.status === 'pending' ? 'Yükleniyor…' : 'Seçin'}
              </option>
              {advisors.data?.items.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName}
                </option>
              ))}
            </SelectField>
          )}
          <TextField
            label="Başlangıç"
            name="startsAt"
            type="datetime-local"
            required
            hint="İstanbul saati."
            error={fieldError('startsAt')}
          />
          <TextField
            label="Bitiş"
            name="endsAt"
            type="datetime-local"
            required
            hint="İstanbul saati."
            error={fieldError('endsAt')}
          />
          <div className="md:col-span-2">
            <TextField
              label="Konum"
              name="locationName"
              required
              maxLength={200}
              error={fieldError('location.name')}
            />
          </div>
          <TextField
            label="Enlem"
            name="latitude"
            type="number"
            inputMode="decimal"
            step="any"
            min={-90}
            max={90}
            required
            error={fieldError('location.latitude')}
          />
          <TextField
            label="Boylam"
            name="longitude"
            type="number"
            inputMode="decimal"
            step="any"
            min={-180}
            max={180}
            required
            error={fieldError('location.longitude')}
          />
          <TextField
            label="Kontenjan"
            name="capacity"
            type="number"
            min={1}
            max={100000}
            required
            defaultValue={DEFAULTS.capacity}
            error={fieldError('capacity')}
          />
          <TextField
            label="Katılım yarıçapı (metre)"
            name="radius"
            type="number"
            min={1}
            max={5000}
            required
            defaultValue={DEFAULTS.radius}
            error={fieldError('attendanceRadiusM')}
          />
          <TextField
            label="QR yenileme süresi (saniye)"
            name="qr"
            type="number"
            min={20}
            max={30}
            required
            defaultValue={DEFAULTS.qr}
            error={fieldError('qrRefreshSeconds')}
          />
          <TextField
            label="Anahtar kelimeler"
            name="tags"
            hint="Virgülle ayırın, en fazla 10."
            error={fieldError('tags')}
          />
          <div className="md:col-span-2">
            <TextArea
              label="Katılım koşulları"
              name="requirements"
              maxLength={2000}
              error={fieldError('participationRequirements')}
            />
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Gönderiliyor…' : 'Öneriyi gönder'}
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
