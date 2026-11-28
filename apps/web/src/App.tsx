import { useQuery } from '@tanstack/react-query';
import type { Role } from '@etkinlik/shared';
import type { ReactNode } from 'react';
import { fetchMe, loginHref } from './api/session';
import { AccountMenu } from './components/AccountMenu';
import { NotificationBell } from './components/NotificationBell';
import { SystemStatus } from './components/SystemStatus';
import { EventCreatePage } from './pages/EventCreatePage';
import { EventDetailPage } from './pages/EventDetailPage';
import { EventsPage } from './pages/EventsPage';
import { MyApplicationsPage } from './pages/MyApplicationsPage';
import { DailySelectionPage, SettingsPage } from './pages/AdminVotingPages';
import { AttendancePage } from './pages/AttendancePage';
import { QrDisplayPage } from './pages/QrDisplayPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { ReasonPromptsPage } from './pages/ReasonPromptsPage';
import { ResultsPage } from './pages/ResultsPage';
import { LeaderboardPage, MyScorePage, ScoreRulesPage } from './pages/ScorePages';
import { ReviewsPage } from './pages/ReviewsPage';
import { VotingPage } from './pages/VotingPage';
import { Link, matchPath, useLocation } from './router';
import { buttonClass, StatusMessage } from './ui';

function LoginFailedNotice() {
  const { search } = useLocation();
  if (search.get('giris') !== 'hata') {
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

interface NavItem {
  href: string;
  label: string;
  roles: Role[];
}

const NAV: NavItem[] = [
  { href: '/oylama', label: 'Oylama', roles: ['student', 'advisor', 'admin'] },
  { href: '/etkinlikler', label: 'Etkinlikler', roles: ['student', 'advisor', 'admin'] },
  { href: '/etkinlikler/yeni', label: 'Etkinlik öner', roles: ['student', 'advisor', 'admin'] },
  { href: '/basvurularim', label: 'Başvurularım', roles: ['student'] },
  { href: '/puanim', label: 'Puanım', roles: ['student'] },
  { href: '/sorularim', label: 'Sorularım', roles: ['student'] },
  { href: '/liderlik', label: 'Liderlik', roles: ['student', 'advisor', 'admin'] },
  { href: '/onaylar', label: 'Onaylar', roles: ['advisor', 'admin'] },
  { href: '/gunluk-secim', label: 'Günlük seçim', roles: ['admin'] },
  { href: '/puan-tablosu', label: 'Puan tablosu', roles: ['admin'] },
  { href: '/ayarlar', label: 'Ayarlar', roles: ['admin'] },
];

function MainNav({ role, pathname }: { role: Role; pathname: string }) {
  const items = NAV.filter((item) => item.roles.includes(role));
  return (
    <nav aria-label="Ana gezinme" className="border-b border-border bg-card">
      <ul className="mx-auto flex max-w-5xl gap-xs overflow-x-auto px-md">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={pathname === item.href ? 'page' : undefined}
              className="inline-flex min-h-11 items-center border-b-2 border-transparent px-sm font-semibold text-muted-foreground aria-[current=page]:border-primary aria-[current=page]:text-foreground"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Home({ signedIn }: { signedIn: boolean }) {
  return (
    <>
      <h1 className="text-3xl font-bold text-foreground">Hoş geldiniz</h1>
      <p className="mt-sm max-w-prose text-muted-foreground">
        Bilim, kültür ve spor etkinliklerini oylayabileceğiniz, başvurabileceğiniz ve katılımınızı
        doğrulayabileceğiniz platform.
      </p>
      <div className="mt-lg">
        {signedIn ? (
          <Link href="/etkinlikler" className={buttonClass()}>
            Etkinliklere göz atın
          </Link>
        ) : (
          <a href={loginHref(window.location)} className={buttonClass()}>
            Kurumsal hesabınızla giriş yapın
          </a>
        )}
      </div>
      <div className="mt-xl">
        <SystemStatus />
      </div>
    </>
  );
}

function Routes({ role }: { role: Role }): ReactNode {
  const { pathname } = useLocation();
  if (pathname === '/etkinlikler') return <EventsPage />;
  if (pathname === '/etkinlikler/yeni') return <EventCreatePage role={role} />;
  if (pathname === '/onaylar' && role !== 'student') return <ReviewsPage />;
  if (pathname === '/oylama') return <VotingPage role={role} />;
  if (pathname === '/basvurularim' && role === 'student') return <MyApplicationsPage />;
  if (pathname === '/sonuclar') return <ResultsPage role={role} />;
  if (pathname === '/gunluk-secim' && role === 'admin') return <DailySelectionPage />;
  if (pathname === '/ayarlar' && role === 'admin') return <SettingsPage />;
  if (pathname === '/bildirimler') return <NotificationsPage />;
  if (pathname === '/profil') return <ProfilePage role={role} />;
  if (pathname === '/sorularim' && role === 'student') return <ReasonPromptsPage />;
  if (pathname === '/puanim' && role === 'student') return <MyScorePage />;
  if (pathname === '/liderlik') return <LeaderboardPage />;
  if (pathname === '/puan-tablosu') return <ScoreRulesPage role={role} />;
  if (pathname === '/katilim') return <AttendancePage role={role} />;
  const qr = matchPath('/etkinlikler/:id/qr', pathname);
  if (qr?.['id'] !== undefined && role !== 'student') return <QrDisplayPage eventId={qr['id']} />;
  const detail = matchPath('/etkinlikler/:id', pathname);
  if (detail?.['id'] !== undefined)
    return <EventDetailPage key={detail['id']} id={detail['id']} role={role} />;
  if (pathname === '/') return <Home signedIn />;
  return <StatusMessage tone="error">Sayfa bulunamadı.</StatusMessage>;
}

export function App() {
  const { pathname } = useLocation();
  const me = useQuery({ queryKey: ['me'], queryFn: ({ signal }) => fetchMe(signal), retry: 1 });
  const role = me.data?.role;

  return (
    <>
      <a
        href="#main"
        className="sr-only z-10 rounded-lg bg-primary px-md py-sm font-semibold text-on-primary focus:not-sr-only focus:fixed focus:left-md focus:top-md"
      >
        Ana içeriğe geç
      </a>

      <header className="border-b border-border bg-card">
        <div className="mx-auto flex min-h-16 max-w-5xl flex-wrap items-center justify-between gap-md px-md py-sm">
          <Link href="/" className="font-heading text-lg font-bold text-primary">
            Etkinlik Platformu
          </Link>
          <div className="flex items-center gap-sm">
            {role !== undefined && <NotificationBell />}
            {role !== undefined && (
              <Link
                href="/profil"
                className="inline-flex min-h-11 items-center rounded-lg px-sm font-semibold text-foreground underline-offset-4 hover:underline"
              >
                Profil
              </Link>
            )}
            <AccountMenu />
          </div>
        </div>
      </header>
      {role !== undefined && <MainNav role={role} pathname={pathname} />}

      <main id="main" tabIndex={-1} className="mx-auto max-w-5xl px-md py-xl outline-none">
        <LoginFailedNotice />
        {me.status === 'pending' && <StatusMessage>Yükleniyor…</StatusMessage>}
        {me.status === 'error' && <Home signedIn={false} />}
        {me.status === 'success' &&
          (role === undefined ? <Home signedIn={false} /> : <Routes role={role} />)}
      </main>

      <footer className="mx-auto max-w-5xl px-md py-lg text-sm text-muted-foreground">
        <p>Giriş yalnızca üniversitenin kurumsal hesabıyla yapılır.</p>
      </footer>
    </>
  );
}
