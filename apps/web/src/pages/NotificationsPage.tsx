import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatIstanbul } from '@etkinlik/shared';
import { listNotifications, markNotificationRead } from '../api/notifications';
import { Link } from '../router';
import { Badge, Button, Card, PageTitle, StatusMessage } from '../ui';

export function NotificationsPage() {
  const client = useQueryClient();
  const list = useQuery({ queryKey: ['notifications', 'all'], queryFn: () => listNotifications() });
  const read = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  return (
    <>
      <PageTitle description="Uygulama içi bildirimleriniz. E-posta ve WhatsApp tercihlerinizi profil sayfanızdan değiştirebilirsiniz.">
        Bildirimler
      </PageTitle>
      <p className="mb-lg">
        <Link href="/profil" className="underline underline-offset-4">
          Bildirim tercihleri ve izinler
        </Link>
      </p>
      {list.status === 'error' && (
        <StatusMessage tone="error">Bildirimler yüklenemedi.</StatusMessage>
      )}
      {list.data?.items.length === 0 && <StatusMessage>Henüz bildiriminiz yok.</StatusMessage>}
      <ul className="grid gap-md">
        {list.data?.items.map((n) => (
          <li key={n.id}>
            <Card className="flex flex-col gap-sm">
              <div className="flex flex-wrap items-center gap-sm">
                <h2 className="text-lg font-semibold">
                  {n.link === undefined ? (
                    n.title
                  ) : (
                    <Link href={n.link} className="underline underline-offset-4">
                      {n.title}
                    </Link>
                  )}
                </h2>
                {n.readAt === undefined && <Badge>Yeni</Badge>}
              </div>
              <p>{n.body}</p>
              <p className="text-sm text-muted-foreground">
                <time dateTime={n.createdAt}>{formatIstanbul(n.createdAt)}</time>
              </p>
              {n.readAt === undefined && (
                <div>
                  <Button
                    variant="secondary"
                    disabled={read.isPending}
                    onClick={() => {
                      read.mutate(n.id);
                    }}
                  >
                    Okundu olarak işaretle
                  </Button>
                </div>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
