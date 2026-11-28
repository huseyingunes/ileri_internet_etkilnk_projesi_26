import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { getQrToken } from '../api/attendance';
import { getEvent } from '../api/events';
import { PageTitle, StatusMessage } from '../ui';

const KINDS = [
  { value: 'entry', label: 'Giriş' },
  { value: 'exit', label: 'Çıkış' },
  { value: 'spot_check', label: 'Ara yoklama' },
] as const;

/** Renders a URL as an SVG QR image; the generator is loaded only on this page. */
function useQrImage(url: string | undefined): string | undefined {
  const [image, setImage] = useState<string>();
  useEffect(() => {
    if (url === undefined) return;
    let active = true;
    void import('qrcode').then(async (qrcode) => {
      const svg = await qrcode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2 });
      if (active) setImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    });
    return () => {
      active = false;
    };
  }, [url]);
  return image;
}

/** Shown on a screen at the venue by the advisor; refreshes on the token's own schedule. */
export function QrDisplayPage({ eventId }: { eventId: string }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]['value']>('entry');
  const event = useQuery({ queryKey: ['event', eventId], queryFn: () => getEvent(eventId) });
  const token = useQuery({
    queryKey: ['qr', eventId, kind],
    queryFn: () => getQrToken(eventId, kind),
    refetchInterval: (query) => (query.state.data?.refreshAfterSeconds ?? 25) * 1000,
    refetchIntervalInBackground: true,
    gcTime: 0,
  });
  const image = useQrImage(token.data?.url);

  return (
    <>
      <PageTitle description="Öğrenciler bu kodu telefonlarının kamerasıyla okutur. Kod düzenli aralıklarla yenilenir; ekranın fotoğrafı kısa sürede geçersiz olur.">
        {event.data === undefined ? 'Katılım QR kodu' : `Katılım: ${event.data.title}`}
      </PageTitle>
      <fieldset className="mb-lg flex flex-wrap gap-md">
        <legend className="mb-sm font-semibold">Okutma türü</legend>
        {KINDS.map((option) => (
          <label key={option.value} className="flex min-h-11 items-center gap-sm">
            <input
              type="radio"
              name="qr-kind"
              value={option.value}
              checked={kind === option.value}
              onChange={() => {
                setKind(option.value);
              }}
              className="size-5 accent-primary"
            />
            {option.label}
          </label>
        ))}
      </fieldset>
      {token.status === 'error' && (
        <StatusMessage tone="error">
          {token.error instanceof ApiError ? token.error.message : 'QR kodu alınamadı.'}
        </StatusMessage>
      )}
      {image !== undefined && (
        <div className="mx-auto max-w-md rounded-xl bg-card p-lg">
          <img
            src={image}
            alt={`Katılım QR kodu (${KINDS.find((k) => k.value === kind)?.label ?? ''})`}
            width={480}
            height={480}
            className="h-auto w-full"
          />
          <p className="mt-sm text-center text-sm text-muted-foreground">
            Kod her {token.data?.refreshAfterSeconds ?? 25} saniyede yenilenir.
          </p>
        </div>
      )}
    </>
  );
}
