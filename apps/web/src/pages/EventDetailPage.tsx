import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CATEGORY_LABELS, EVENT_STATUS_LABELS, formatIstanbul } from '@etkinlik/shared';
import { type SyntheticEvent, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { cancelEvent, getEvent, getMedia, reviewEvent, setCover, uploadImage } from '../api/events';
import { Badge, Button, Card, Picture, StatusMessage, TextArea, TextField } from '../ui';

function ReasonDialog({
  title,
  label,
  confirm,
  onSubmit,
  dialogRef,
}: {
  title: string;
  label: string;
  confirm: string;
  onSubmit: (reason: string) => void;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
}) {
  const [reason, setReason] = useState('');
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${confirm}-title`}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-xl bg-card p-lg text-card-foreground backdrop:bg-foreground/50"
    >
      <form
        method="dialog"
        className="flex flex-col gap-md"
        onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
          event.preventDefault();
          onSubmit(reason.trim());
          dialogRef.current?.close();
        }}
      >
        <h2 id={`${confirm}-title`} className="text-xl font-semibold">
          {title}
        </h2>
        <TextArea
          label={label}
          required
          maxLength={2000}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
        />
        <div className="flex justify-end gap-sm">
          <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
            Vazgeç
          </Button>
          <Button type="submit" variant="danger">
            {confirm}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

function CoverUpload({ eventId }: { eventId: string }) {
  const client = useQueryClient();
  const [alt, setAlt] = useState('');
  const [message, setMessage] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (file === undefined) throw new ApiError(422, 'VALIDATION_FAILED', 'Bir görsel seçin.', []);
      const media = await uploadImage(file, alt);
      // Variants are derived in the background; wait briefly so the cover can show.
      for (let i = 0; i < 20; i += 1) {
        const current = await getMedia(media.id);
        if (current.status !== 'pending') break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      return await setCover(eventId, media.id);
    },
    onSuccess: async () => {
      setMessage('Kapak görseli güncellendi.');
      await client.invalidateQueries({ queryKey: ['event', eventId] });
    },
    onError: (error) => {
      setMessage(error instanceof ApiError ? error.message : 'Görsel yüklenemedi.');
    },
  });
  return (
    <form
      className="flex flex-col gap-md"
      onSubmit={(event) => {
        event.preventDefault();
        upload.mutate();
      }}
    >
      <h2 className="text-xl font-semibold">Kapak görseli</h2>
      <div className="flex flex-col gap-xs">
        <label htmlFor="cover-file" className="font-semibold">
          Görsel dosyası
        </label>
        <p id="cover-hint" className="text-sm text-muted-foreground">
          JPEG, PNG, WebP ya da AVIF; en fazla 10 MB.
        </p>
        <input
          id="cover-file"
          ref={fileRef}
          type="file"
          required
          accept="image/jpeg,image/png,image/webp,image/avif"
          aria-describedby="cover-hint"
          className="min-h-11"
        />
      </div>
      <TextField
        label="Alternatif metin"
        hint="Görseli göremeyenler için kısa açıklama."
        maxLength={300}
        value={alt}
        onChange={(e) => {
          setAlt(e.target.value);
        }}
      />
      <Button type="submit" disabled={upload.isPending}>
        {upload.isPending ? 'Yükleniyor…' : 'Yükle'}
      </Button>
      {message !== undefined && (
        <StatusMessage tone={upload.isError ? 'error' : 'neutral'}>{message}</StatusMessage>
      )}
    </form>
  );
}

export function EventDetailPage({ id }: { id: string }) {
  const client = useQueryClient();
  const event = useQuery({
    queryKey: ['event', id],
    queryFn: ({ signal }) => getEvent(id, signal),
  });
  const rejectRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState<string | undefined>();

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['event', id] });
    await client.invalidateQueries({ queryKey: ['events'] });
  };
  const review = useMutation({
    mutationFn: (body: { decision: 'approve' | 'reject'; reason?: string }) =>
      reviewEvent(id, body),
    onSuccess: async (_data, body) => {
      setNotice(
        body.decision === 'approve'
          ? 'Etkinlik onaylandı ve havuza eklendi.'
          : 'Etkinlik reddedildi.',
      );
      await refresh();
    },
    onError: (error) => {
      setNotice(error instanceof ApiError ? error.message : 'İşlem tamamlanamadı.');
    },
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => cancelEvent(id, reason),
    onSuccess: async () => {
      setNotice('Etkinlik iptal edildi.');
      await refresh();
    },
    onError: (error) => {
      setNotice(error instanceof ApiError ? error.message : 'İşlem tamamlanamadı.');
    },
  });

  if (event.status === 'pending') return <StatusMessage>Etkinlik yükleniyor…</StatusMessage>;
  if (event.status === 'error') {
    return (
      <StatusMessage tone="error">
        {event.error instanceof ApiError && event.error.status === 404
          ? 'Etkinlik bulunamadı.'
          : 'Etkinlik yüklenemedi.'}
      </StatusMessage>
    );
  }
  const data = event.data;
  const cover = data.cover;

  return (
    <article className="flex flex-col gap-lg">
      <header className="flex flex-col gap-sm">
        <div className="flex flex-wrap gap-sm">
          <Badge>{CATEGORY_LABELS[data.category]}</Badge>
          <Badge>{EVENT_STATUS_LABELS[data.status]}</Badge>
        </div>
        <h1 className="text-3xl font-bold">{data.title}</h1>
      </header>
      {notice !== undefined && <StatusMessage>{notice}</StatusMessage>}
      {cover?.status === 'ready' && cover.width !== undefined && cover.height !== undefined && (
        <Picture
          variants={cover.variants}
          alt={cover.alt}
          width={cover.width}
          height={cover.height}
          sizes="(min-width: 1024px) 64rem, 100vw"
          eager
          className="aspect-video"
        />
      )}
      <Card>
        <dl className="grid gap-x-md gap-y-sm sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold">Başlangıç</dt>
          <dd>
            <time dateTime={data.startsAt}>{formatIstanbul(data.startsAt)}</time>
          </dd>
          <dt className="font-semibold">Bitiş</dt>
          <dd>
            <time dateTime={data.endsAt}>{formatIstanbul(data.endsAt)}</time>
          </dd>
          <dt className="font-semibold">Yer</dt>
          <dd>{data.location.name}</dd>
          <dt className="font-semibold">Düzenleyen</dt>
          <dd>{data.organizer.name}</dd>
          {data.advisor !== undefined && (
            <>
              <dt className="font-semibold">Danışman</dt>
              <dd>{data.advisor.displayName}</dd>
            </>
          )}
          <dt className="font-semibold">Kontenjan</dt>
          <dd>{data.capacity}</dd>
        </dl>
      </Card>
      <section aria-labelledby="desc-title">
        <h2 id="desc-title" className="text-xl font-semibold">
          Açıklama
        </h2>
        <p className="mt-sm whitespace-pre-line">{data.description}</p>
        {data.participationRequirements !== '' && (
          <>
            <h3 className="mt-md font-semibold">Katılım koşulları</h3>
            <p className="mt-xs whitespace-pre-line">{data.participationRequirements}</p>
          </>
        )}
        {data.tags.length > 0 && (
          <ul aria-label="Anahtar kelimeler" className="mt-md flex flex-wrap gap-sm">
            {data.tags.map((tag) => (
              <li key={tag}>
                <Badge>#{tag}</Badge>
              </li>
            ))}
          </ul>
        )}
        {data.rejectionReason !== undefined && (
          <p className="mt-md text-destructive">Ret gerekçesi: {data.rejectionReason}</p>
        )}
        {data.cancellationReason !== undefined && (
          <p className="mt-md text-destructive">İptal gerekçesi: {data.cancellationReason}</p>
        )}
      </section>

      {(data.viewer.canReview || data.viewer.canManagePhotos) && (
        <Card className="flex flex-wrap gap-sm">
          {data.viewer.canReview && (
            <>
              <Button
                disabled={review.isPending}
                onClick={() => {
                  review.mutate({ decision: 'approve' });
                }}
              >
                Onayla
              </Button>
              <Button variant="danger" onClick={() => rejectRef.current?.showModal()}>
                Reddet
              </Button>
            </>
          )}
          {data.viewer.canManagePhotos &&
            data.status !== 'cancelled' &&
            data.status !== 'completed' && (
              <Button variant="secondary" onClick={() => cancelRef.current?.showModal()}>
                Etkinliği iptal et
              </Button>
            )}
        </Card>
      )}
      {data.viewer.canEdit && (
        <Card>
          <CoverUpload eventId={id} />
        </Card>
      )}
      <ReasonDialog
        dialogRef={rejectRef}
        title="Öneriyi reddet"
        label="Ret gerekçesi"
        confirm="Reddet"
        onSubmit={(reason) => {
          review.mutate({ decision: 'reject', reason });
        }}
      />
      <ReasonDialog
        dialogRef={cancelRef}
        title="Etkinliği iptal et"
        label="İptal gerekçesi"
        confirm="İptal et"
        onSubmit={(reason) => {
          cancel.mutate(reason);
        }}
      />
    </article>
  );
}
