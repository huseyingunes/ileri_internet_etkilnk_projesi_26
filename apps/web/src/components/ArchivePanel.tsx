import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CATEGORY_LABELS, formatIstanbul } from '@etkinlik/shared';
import { type SyntheticEvent, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { uploadImageAndWait } from '../api/events';
import { addPhoto, getArchive, getRatings, rateEvent, removePhoto } from '../api/feedback';
import { Button, Card, Picture, StatusMessage, TextArea, TextField } from '../ui';

const RESULT_LABELS = {
  winner: 'Kazandı',
  tie_pending: 'Eşitlik, yönetici kararı bekleniyor',
  below_threshold: 'Asgari oy eşiğine ulaşılamadı',
  no_votes: 'Oy kullanılmadı',
} as const;

const formatAverage = (value: number | null | undefined) =>
  value === null || value === undefined
    ? 'Henüz yok'
    : value.toLocaleString('tr-TR', { maximumFractionDigits: 2 });

function RatingForm({ eventId }: { eventId: string }) {
  const client = useQueryClient();
  const [message, setMessage] = useState<{ tone: 'neutral' | 'error'; text: string }>();
  const rate = useMutation({
    mutationFn: (body: { score: number; comment?: string }) => rateEvent(eventId, body),
    onSuccess: async () => {
      setMessage({ tone: 'neutral', text: 'Değerlendirmeniz için teşekkürler.' });
      await client.invalidateQueries({ queryKey: ['archive', eventId] });
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Değerlendirme kaydedilemedi.',
      });
    },
  });
  return (
    <Card>
      <form
        className="flex flex-col gap-md"
        onSubmit={(event: SyntheticEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const comment = form.get('comment');
          rate.mutate({
            score: Number(form.get('score')),
            ...(typeof comment === 'string' && comment.trim() !== ''
              ? { comment: comment.trim() }
              : {}),
          });
        }}
      >
        <h2 className="text-xl font-semibold">Etkinliği değerlendirin</h2>
        <fieldset className="flex flex-col gap-xs">
          <legend className="mb-xs font-semibold">Puanınız (1 en düşük, 5 en yüksek)</legend>
          <div className="flex flex-wrap gap-md">
            {[1, 2, 3, 4, 5].map((score) => (
              <label key={score} className="flex min-h-11 min-w-11 items-center gap-xs">
                <input
                  type="radio"
                  name="score"
                  value={score}
                  required
                  className="size-5 accent-primary"
                />
                {score}
              </label>
            ))}
          </div>
        </fieldset>
        <TextArea
          label="Yorumunuz (isteğe bağlı)"
          name="comment"
          maxLength={2000}
          hint="Yorumlar danışmana ve yöneticiye adınız gösterilmeden iletilir."
        />
        <div>
          <Button type="submit" disabled={rate.isPending}>
            Değerlendirmeyi gönder
          </Button>
        </div>
        {message !== undefined && <StatusMessage tone={message.tone}>{message.text}</StatusMessage>}
      </form>
    </Card>
  );
}

function GalleryManager({ eventId, photoIds }: { eventId: string; photoIds: string[] }) {
  const client = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState('');
  const [message, setMessage] = useState<{ tone: 'neutral' | 'error'; text: string }>();
  const refresh = () => client.invalidateQueries({ queryKey: ['archive', eventId] });
  const upload = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0];
      if (file === undefined) throw new ApiError(422, 'VALIDATION_FAILED', 'Bir görsel seçin.', []);
      const media = await uploadImageAndWait(file, alt);
      await addPhoto(eventId, media.id);
    },
    onSuccess: async () => {
      setMessage({ tone: 'neutral', text: 'Fotoğraf galeriye eklendi.' });
      setAlt('');
      if (fileRef.current !== null) fileRef.current.value = '';
      await refresh();
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Fotoğraf eklenemedi.',
      });
    },
  });
  const remove = useMutation({
    mutationFn: (mediaId: string) => removePhoto(eventId, mediaId),
    onSuccess: refresh,
  });
  return (
    <Card className="flex flex-col gap-md">
      <h2 className="text-xl font-semibold">Galeriyi yönet</h2>
      <p className="text-sm text-muted-foreground">
        Yalnızca fotoğrafının kullanılmasına izin veren öğrencilerin seçilebildiği kareleri ekleyin.
      </p>
      <form
        className="flex flex-col gap-md"
        onSubmit={(event) => {
          event.preventDefault();
          upload.mutate();
        }}
      >
        <div className="flex flex-col gap-xs">
          <label htmlFor="gallery-file" className="font-semibold">
            Fotoğraf dosyası
          </label>
          <input
            id="gallery-file"
            ref={fileRef}
            type="file"
            required
            accept="image/jpeg,image/png,image/webp,image/avif"
            className="min-h-11"
          />
        </div>
        <TextField
          label="Alternatif metin"
          hint="Fotoğrafı göremeyenler için kısa açıklama."
          maxLength={300}
          required
          value={alt}
          onChange={(e) => {
            setAlt(e.target.value);
          }}
        />
        <div>
          <Button type="submit" disabled={upload.isPending}>
            {upload.isPending ? 'Yükleniyor…' : 'Galeriye ekle'}
          </Button>
        </div>
      </form>
      {message !== undefined && <StatusMessage tone={message.tone}>{message.text}</StatusMessage>}
      {photoIds.length > 0 && (
        <ul className="flex flex-wrap gap-sm" aria-label="Galerideki fotoğraflar">
          {photoIds.map((id, index) => (
            <li key={id}>
              <Button
                variant="secondary"
                disabled={remove.isPending}
                onClick={() => {
                  remove.mutate(id);
                }}
              >
                {index + 1}. fotoğrafı kaldır
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RatingReport({ eventId }: { eventId: string }) {
  const report = useQuery({ queryKey: ['ratings', eventId], queryFn: () => getRatings(eventId) });
  if (report.data === undefined) return null;
  const comments = report.data.items.filter((r) => r.comment !== undefined);
  return (
    <section aria-labelledby="ratings-title" className="flex flex-col gap-sm">
      <h2 id="ratings-title" className="text-xl font-semibold">
        Değerlendirmeler
      </h2>
      <p>
        Ortalama: <strong>{formatAverage(report.data.averageRating)}</strong> (
        {report.data.ratingCount} değerlendirme)
      </p>
      {comments.length === 0 ? (
        <StatusMessage>Henüz yorum yok.</StatusMessage>
      ) : (
        <ul className="grid gap-sm">
          {comments.map((r) => (
            <li key={r.createdAt}>
              <Card>
                <p className="font-semibold">{r.score} / 5</p>
                <p className="mt-xs whitespace-pre-line">{r.comment}</p>
                <p className="mt-xs text-sm text-muted-foreground">
                  <time dateTime={r.createdAt}>{formatIstanbul(r.createdAt)}</time>
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Archive of a completed event: numbers, voting results, gallery and ratings. */
export function ArchivePanel({ eventId, canManage }: { eventId: string; canManage: boolean }) {
  const archive = useQuery({ queryKey: ['archive', eventId], queryFn: () => getArchive(eventId) });
  if (archive.status === 'pending') return <StatusMessage>Arşiv yükleniyor…</StatusMessage>;
  if (archive.status === 'error') {
    return <StatusMessage tone="error">Arşiv bilgileri yüklenemedi.</StatusMessage>;
  }
  const data = archive.data;
  return (
    <>
      <section aria-labelledby="archive-title" className="flex flex-col gap-md">
        <h2 id="archive-title" className="text-xl font-semibold">
          Etkinlik arşivi
        </h2>
        <dl className="grid grid-cols-2 gap-md sm:grid-cols-3">
          <div className="flex flex-col-reverse gap-xs rounded-xl border border-border bg-card p-lg">
            <dt className="text-sm text-muted-foreground">Katılımcı</dt>
            <dd className="text-2xl font-bold tabular-nums">{data.participantCount}</dd>
          </div>
          <div className="flex flex-col-reverse gap-xs rounded-xl border border-border bg-card p-lg">
            <dt className="text-sm text-muted-foreground">Ortalama puan</dt>
            <dd className="text-2xl font-bold tabular-nums">{formatAverage(data.averageRating)}</dd>
          </div>
          <div className="flex flex-col-reverse gap-xs rounded-xl border border-border bg-card p-lg">
            <dt className="text-sm text-muted-foreground">Değerlendirme</dt>
            <dd className="text-2xl font-bold tabular-nums">{data.ratingCount ?? 0}</dd>
          </div>
        </dl>
        {data.voting.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <caption className="mb-sm text-left font-semibold">Oylama sonuçları</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="p-sm">
                    Gün
                  </th>
                  <th scope="col" className="p-sm">
                    Kategori
                  </th>
                  <th scope="col" className="p-sm">
                    Sonuç
                  </th>
                  <th scope="col" className="p-sm text-right">
                    Bu etkinliğin oyu
                  </th>
                  <th scope="col" className="p-sm text-right">
                    Toplam oy
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.voting.map((result) => (
                  <tr key={result.id} className="border-b border-border">
                    <td className="p-sm">{result.date}</td>
                    <td className="p-sm">{CATEGORY_LABELS[result.category]}</td>
                    <td className="p-sm">
                      {result.winner?.id === eventId ? 'Kazandı' : RESULT_LABELS[result.status]}
                    </td>
                    <td className="p-sm text-right tabular-nums">
                      {result.entries.find((e) => e.event.id === eventId)?.voteCount ?? 0}
                    </td>
                    <td className="p-sm text-right tabular-nums">{result.totalVotes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <section aria-labelledby="gallery-title">
          <h3 id="gallery-title" className="mb-sm text-lg font-semibold">
            Fotoğraf galerisi
          </h3>
          {data.photos.length === 0 ? (
            <StatusMessage>Henüz fotoğraf eklenmedi.</StatusMessage>
          ) : (
            <ul className="grid grid-cols-1 gap-md sm:grid-cols-2 lg:grid-cols-3">
              {data.photos.map((photo) =>
                photo.width === undefined || photo.height === undefined ? null : (
                  <li key={photo.id}>
                    <Picture
                      variants={photo.variants}
                      alt={photo.alt}
                      width={photo.width}
                      height={photo.height}
                      sizes="(min-width: 1024px) 21rem, (min-width: 640px) 50vw, 100vw"
                    />
                  </li>
                ),
              )}
            </ul>
          )}
        </section>
      </section>
      {data.viewer?.canRate === true && <RatingForm eventId={eventId} />}
      {data.viewer?.rated === true && <StatusMessage>Bu etkinliği değerlendirdiniz.</StatusMessage>}
      {canManage && (
        <>
          <GalleryManager eventId={eventId} photoIds={data.photos.map((p) => p.id)} />
          <RatingReport eventId={eventId} />
        </>
      )}
    </>
  );
}
