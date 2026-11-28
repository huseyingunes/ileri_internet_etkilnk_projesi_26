import { AccountMenu } from './components/AccountMenu';
import { SystemStatus } from './components/SystemStatus';

function LoginFailedNotice() {
  if (new URLSearchParams(window.location.search).get('giris') !== 'hata') {
    return null;
  }
  return (
    <div
      role="alert"
      className="mb-lg rounded-xl border border-destructive bg-card p-md text-destructive"
    >
      <p className="font-semibold">Giriş tamamlanamadı.</p>
      <p className="mt-xs text-foreground">
        Oturum süresi dolmuş ya da giriş isteği bu tarayıcıdan başlatılmamış olabilir. Lütfen
        yeniden giriş yapın.
      </p>
    </div>
  );
}

export function App() {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-10 rounded-lg bg-primary px-md py-sm font-semibold text-on-primary focus:not-sr-only focus:fixed focus:left-md focus:top-md"
      >
        Ana içeriğe geç
      </a>

      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-md px-md py-sm">
          <p className="font-heading text-lg font-bold text-primary">Etkinlik Platformu</p>
          <AccountMenu />
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-md py-xl outline-none">
        <LoginFailedNotice />
        <h1 className="text-3xl font-bold text-foreground">Hoş geldiniz</h1>
        <p className="mt-sm max-w-prose text-muted-foreground">
          Bilim, kültür ve spor etkinliklerini oylayabileceğiniz, başvurabileceğiniz ve katılımınızı
          doğrulayabileceğiniz platform hazırlanıyor.
        </p>
        <div className="mt-xl">
          <SystemStatus />
        </div>
      </main>

      <footer className="mx-auto max-w-5xl px-md py-lg text-sm text-muted-foreground">
        <p>Giriş yalnızca üniversitenin kurumsal hesabıyla yapılır.</p>
      </footer>
    </>
  );
}
