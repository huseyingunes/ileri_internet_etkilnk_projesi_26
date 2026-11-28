import { type AnchorHTMLAttributes, type MouseEvent, useSyncExternalStore } from 'react';

/**
 * Minimal history router (no dependency): path matching with `:params`,
 * client-side links that keep normal browser behaviour (new tab, modifiers).
 */

const NAVIGATE_EVENT = 'app:navigate';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

const snapshot = () => window.location.pathname + window.location.search;

export function useLocation(): { pathname: string; search: URLSearchParams } {
  const current = useSyncExternalStore(subscribe, snapshot);
  const url = new URL(current, window.location.origin);
  return { pathname: url.pathname, search: url.searchParams };
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (options.replace === true) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
  // Move focus to the new page's main content for keyboard and screen reader users.
  queueMicrotask(() => {
    document.getElementById('main')?.focus();
  });
}

/** Returns route params when `pattern` (e.g. `/etkinlikler/:id`) matches `pathname`. */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (const [index, part] of patternParts.entries()) {
    const value = pathParts[index] ?? '';
    if (part.startsWith(':')) {
      Object.defineProperty(params, part.slice(1), {
        value: decodeURIComponent(value),
        enumerable: true,
      });
    } else if (part !== value) {
      return null;
    }
  }
  return params;
}

export function Link({
  href,
  onClick,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      !href.startsWith('/') ||
      href.startsWith('/api/')
    ) {
      return;
    }
    event.preventDefault();
    navigate(href);
  };
  return (
    <a href={href} onClick={handle} {...rest}>
      {children}
    </a>
  );
}
