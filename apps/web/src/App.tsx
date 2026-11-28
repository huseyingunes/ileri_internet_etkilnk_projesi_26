import { SystemStatus } from './components/SystemStatus';

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
        <div className="mx-auto flex min-h-16 max-w-5xl items-center px-md">
          <p className="font-heading text-lg font-bold text-primary">Etkinlik Platformu</p>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-md py-xl outline-none">
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
