import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatIstanbul } from '@etkinlik/shared';
import { useRef, useState } from 'react';
import { ApiError } from '../api/client';
import { createDataRequest, type DataRequest, listDataRequests } from '../api/notifications';
import { Button, Card, StatusMessage, TextField } from '../ui';

const STATUS: Record<DataRequest['status'], string> = {
  pending: 'Sırada',
  processing: 'Hazırlanıyor',
  completed: 'Tamamlandı',
  failed: 'Başarısız',
};
const CONFIRM_WORD = 'SİL';

/** KVKK: "download my data" and "delete my data". */
export function MyDataCard() {
  const client = useQueryClient();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmText, setConfirmText] = useState('');
  const [message, setMessage] = useState<{ tone: 'neutral' | 'error'; text: string }>();
  const requests = useQuery({
    queryKey: ['data-requests'],
    queryFn: listDataRequests,
    // While something is being prepared, check again shortly.
    refetchInterval: (query) =>
      query.state.data?.items.some((r) => r.status === 'pending' || r.status === 'processing') ===
      true
        ? 5_000
        : false,
  });
  const create = useMutation({
    mutationFn: createDataRequest,
    onSuccess: async (request) => {
      setMessage({
        tone: 'neutral',
        text:
          request.kind === 'export'
            ? 'Talebiniz alındı. Dosya hazır olunca bu listeden indirebilirsiniz.'
            : 'Silme talebiniz alındı. Hesabınız kısa süre içinde anonimleştirilecek ve oturumunuz kapanacak.',
      });
      await client.invalidateQueries({ queryKey: ['data-requests'] });
    },
    onError: (error) => {
      setMessage({
        tone: 'error',
        text: error instanceof ApiError ? error.message : 'Talep oluşturulamadı.',
      });
    },
  });

  return (
    <Card className="flex flex-col gap-md">
      <h2 className="text-xl font-semibold">Verilerim</h2>
      <p className="text-sm">
        Platformda hakkınızda tutulan verilerin bir kopyasını indirebilir ya da verilerinizin
        silinmesini isteyebilirsiniz. Silme işleminde adınız, e-postanız, telefonunuz ve yazdığınız
        metinler kaldırılır; puan defteri gibi değiştirilemeyen kayıtlar sizinle ilişkisi kesilerek
        istatistik için kalır.
      </p>
      <div className="flex flex-wrap gap-sm">
        <Button
          disabled={create.isPending}
          onClick={() => {
            create.mutate('export');
          }}
        >
          Verilerimi indir
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            setConfirmText('');
            dialogRef.current?.showModal();
          }}
        >
          Verilerimi sil
        </Button>
      </div>
      {message !== undefined && <StatusMessage tone={message.tone}>{message.text}</StatusMessage>}
      {requests.data !== undefined && requests.data.items.length > 0 && (
        <ul className="grid gap-sm" aria-label="Taleplerim">
          {requests.data.items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-sm">
              <span>
                {r.kind === 'export' ? 'Dışa aktarma' : 'Silme'} ·{' '}
                <time dateTime={r.requestedAt}>{formatIstanbul(r.requestedAt)}</time> ·{' '}
                {STATUS[r.status]}
              </span>
              {r.downloadUrl !== undefined && (
                <a
                  href={r.downloadUrl}
                  download="verilerim.json"
                  className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
                >
                  Dosyayı indir
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby="delete-data-title"
        className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-xl bg-card p-lg text-card-foreground backdrop:bg-foreground/50"
      >
        <form
          method="dialog"
          className="flex flex-col gap-md"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmText.trim().toLocaleUpperCase('tr') !== CONFIRM_WORD) return;
            create.mutate('delete');
            dialogRef.current?.close();
          }}
        >
          <h2 id="delete-data-title" className="text-xl font-semibold">
            Verilerinizi silmek istediğinize emin misiniz?
          </h2>
          <p>
            Bu işlem geri alınamaz. Hesabınız anonimleştirilir ve oturumunuz kapanır. Aynı kurumsal
            hesapla yeniden giriş yaparsanız boş bir hesap oluşur.
          </p>
          <TextField
            label={`Onaylamak için ${CONFIRM_WORD} yazın`}
            value={confirmText}
            required
            autoComplete="off"
            onChange={(e) => {
              setConfirmText(e.target.value);
            }}
          />
          <div className="flex flex-wrap justify-end gap-sm">
            <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={confirmText.trim().toLocaleUpperCase('tr') !== CONFIRM_WORD}
            >
              Kalıcı olarak sil
            </Button>
          </div>
        </form>
      </dialog>
    </Card>
  );
}
