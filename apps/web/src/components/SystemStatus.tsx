import { useQuery } from '@tanstack/react-query';
import { fetchLiveness } from '../api/health';

function StatusIcon({ ok }: { ok: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" className="shrink-0">
      {ok ? (
        <path
          d="M20 6 9 17l-5-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M12 8v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/** Phase 0 placeholder: proves the client → Caddy → API path works. */
export function SystemStatus() {
  const { status, isFetching, refetch } = useQuery({
    queryKey: ['health', 'live'],
    queryFn: ({ signal }) => fetchLiveness(signal),
    retry: 1,
  });

  const message =
    status === 'pending'
      ? 'Sunucu denetleniyor…'
      : status === 'success'
        ? 'Sunucu çalışıyor.'
        : 'Sunucuya şu anda ulaşılamıyor.';

  return (
    <section
      aria-labelledby="system-status-title"
      className="rounded-xl border border-border bg-card p-lg text-card-foreground"
    >
      <h2 id="system-status-title" className="text-xl font-semibold">
        Sistem durumu
      </h2>
      <p
        role="status"
        className={`mt-sm flex items-center gap-sm ${status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
      >
        {status !== 'pending' && <StatusIcon ok={status === 'success'} />}
        <span>{message}</span>
      </p>
      {status === 'error' && (
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="mt-md inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg bg-primary px-lg font-semibold text-on-primary disabled:cursor-wait motion-safe:transition-opacity hover:opacity-90"
        >
          {isFetching ? 'Deneniyor…' : 'Yeniden dene'}
        </button>
      )}
    </section>
  );
}
