import { useQuery } from '@tanstack/react-query';
import { listNotifications } from '../api/notifications';
import { Link } from '../router';

/**
 * Header link with the unread count. Short-interval polling (prompt: polling
 * first, SSE only if needed); paused while the tab is hidden.
 */
export function NotificationBell() {
  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => listNotifications(true),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
  const count = unread.data?.unreadCount ?? 0;
  const label = count === 0 ? 'Bildirimler' : `Bildirimler, ${String(count)} okunmamış`;
  return (
    <Link
      href="/bildirimler"
      aria-label={label}
      className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-input-border bg-card text-foreground"
    >
      <svg
        aria-hidden="true"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-xs -top-xs min-w-5 rounded-full bg-destructive px-xs text-center text-xs font-bold text-on-destructive"
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
