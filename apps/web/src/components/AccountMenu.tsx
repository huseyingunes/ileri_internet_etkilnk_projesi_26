import { useMutation, useQuery } from '@tanstack/react-query';
import type { Role } from '@etkinlik/shared';
import { fetchMe, loginHref, logout } from '../api/session';

const ROLE_LABELS: Record<Role, string> = {
  student: 'Öğrenci',
  advisor: 'Danışman',
  admin: 'Yönetici',
};

const buttonClass =
  'inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg px-md font-semibold transition-opacity duration-150 hover:opacity-90 active:opacity-75 disabled:cursor-wait disabled:opacity-60';

export function AccountMenu() {
  const me = useQuery({ queryKey: ['me'], queryFn: ({ signal }) => fetchMe(signal), retry: 1 });
  const signOut = useMutation({
    mutationFn: logout,
    // The response clears cookies and storage (Clear-Site-Data); reload into a clean state.
    onSettled: () => {
      window.location.assign('/');
    },
  });

  if (me.status === 'pending') {
    return <span className="text-sm text-muted-foreground">Oturum denetleniyor…</span>;
  }

  if (me.data === null || me.status === 'error') {
    return (
      <a href={loginHref(window.location)} className={`${buttonClass} bg-primary text-on-primary`}>
        Giriş yap
      </a>
    );
  }

  const user = me.data;
  return (
    <div className="flex items-center gap-md">
      <p className="hidden text-right text-sm sm:block">
        <span className="block font-semibold text-foreground">{user.displayName}</span>
        <span className="block text-muted-foreground">{ROLE_LABELS[user.role]}</span>
      </p>
      <button
        type="button"
        onClick={() => {
          signOut.mutate();
        }}
        disabled={signOut.isPending}
        className={`${buttonClass} border border-input-border bg-card text-foreground`}
      >
        {signOut.isPending ? 'Çıkış yapılıyor…' : 'Çıkış yap'}
      </button>
    </div>
  );
}
