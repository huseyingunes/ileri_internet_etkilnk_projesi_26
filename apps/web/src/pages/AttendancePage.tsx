import { useMutation, useQuery } from '@tanstack/react-query';
import type { Role } from '@etkinlik/shared';
import { useState } from 'react';
import { ApiError } from '../api/client';
import {
  grantLocationConsent,
  listConsents,
  scanAttendance,
  type ScanResult,
} from '../api/attendance';
import { Button, Card, PageTitle, StatusMessage } from '../ui';

const REASONS: Record<NonNullable<ScanResult['rejectionReason']>, string> = {
  token_expired: 'QR kodunun süresi dolmuş. Ekrandaki güncel kodu yeniden okutun.',
  token_wrong_event: 'Bu QR kodu başka bir etkinliğe ait.',
  outside_radius: 'Konumunuz etkinlik alanının dışında görünüyor.',
  location_unavailable: 'Konumunuz yeterli doğrulukla alınamadı. Açık alana yakın deneyin.',
  outside_event_time: 'Okutma etkinlik saatleri dışında yapıldı.',
};

/** Reads the token from the URL fragment once and removes it from the address bar. */
function takeTokenFromFragment(): string | undefined {
  const match = /(?:^#|&)t=([\w-]+\.[\w-]+)/.exec(window.location.hash);
  if (match?.[1] !== undefined) {
    window.history.replaceState(null, '', window.location.pathname);
    return match[1];
  }
  return undefined;
}

function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 0,
    });
  });
}

const minutes = (seconds: number) => Math.floor(seconds / 60);

/** Landing page of the QR link (opened by the phone's own camera app). */
export function AttendancePage({ role }: { role: Role }) {
  const [token] = useState(takeTokenFromFragment);
  const [consentChecked, setConsentChecked] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const consents = useQuery({
    queryKey: ['consents'],
    queryFn: listConsents,
    enabled: role === 'student',
  });
  const hasConsent = consents.data?.items.some((c) => c.kind === 'location' && c.granted) === true;

  const verify = useMutation({
    mutationFn: async () => {
      if (token === undefined) throw new Error('missing token');
      if (!hasConsent) await grantLocationConsent();
      const position = await currentPosition();
      // Coordinates are sent once for verification; the server stores only the distance.
      return await scanAttendance({
        token,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyM: position.coords.accuracy,
      });
    },
    onError: (e) => {
      if (e instanceof ApiError) setError(e.message);
      else if (
        typeof GeolocationPositionError !== 'undefined' &&
        e instanceof GeolocationPositionError
      ) {
        setError('Konum alınamadı. Tarayıcıda bu site için konum iznini açıp yeniden deneyin.');
      } else setError('Katılım doğrulanamadı.');
    },
  });

  if (role !== 'student') {
    return <StatusMessage>Katılım doğrulaması yalnızca öğrenciler içindir.</StatusMessage>;
  }
  if (token === undefined) {
    return (
      <>
        <PageTitle>Katılım doğrulama</PageTitle>
        <StatusMessage>
          Etkinlik alanındaki ekranda gösterilen QR kodunu telefonunuzun kamerasıyla okutun.
        </StatusMessage>
      </>
    );
  }
  const result = verify.data;

  return (
    <>
      <PageTitle>Katılım doğrulama</PageTitle>
      <Card className="flex flex-col gap-md">
        <h2 className="text-xl font-semibold">Konumunuz neden gerekiyor?</h2>
        <p>
          Etkinlik alanında olduğunuzu doğrulamak için konumunuz bir kez okunur. Koordinatlarınız
          saklanmaz; yalnızca etkinlik noktasına uzaklığınız ve okutma zamanı kaydedilir.
        </p>
        {!hasConsent && (
          <label className="flex min-h-11 items-start gap-md">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => {
                setConsentChecked(e.target.checked);
              }}
              className="mt-xs size-5 accent-primary"
            />
            <span>
              Katılım doğrulaması için konumumun bu şekilde kullanılmasına açık rıza veriyorum.
              Rızamı profilimden geri alabilirim.
            </span>
          </label>
        )}
        <div>
          <Button
            disabled={verify.isPending || (!hasConsent && !consentChecked) || result !== undefined}
            onClick={() => {
              setError(undefined);
              verify.mutate();
            }}
          >
            {verify.isPending ? 'Doğrulanıyor…' : 'Konumumu paylaş ve katılımı doğrula'}
          </Button>
        </div>
        {error !== undefined && <StatusMessage tone="error">{error}</StatusMessage>}
        {result !== undefined && (
          <div role="status" className="flex flex-col gap-xs">
            <p className="font-semibold">
              {result.accepted
                ? 'Okutmanız kaydedildi.'
                : REASONS[result.rejectionReason ?? 'token_expired']}
            </p>
            <p>
              Şu ana kadar etkinlikte bulunduğunuz süre: {minutes(result.presenceSoFarSeconds)}{' '}
              dakika. Katılmış sayılmak için gereken süre: {minutes(result.requiredPresenceSeconds)}{' '}
              dakika. Çıkarken çıkış kodunu da okutun.
            </p>
          </div>
        )}
      </Card>
    </>
  );
}
