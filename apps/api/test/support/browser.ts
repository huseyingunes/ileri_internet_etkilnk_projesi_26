/**
 * Tiny cookie-keeping HTTP client that imitates a browser for OIDC flows in
 * tests (manual redirects, per-host cookie jar, HTML form submission).
 */
export class TestBrowser {
  private readonly jars = new Map<string, Map<string, string>>();

  private jar(url: URL): Map<string, string> {
    let jar = this.jars.get(url.host);
    if (jar === undefined) {
      jar = new Map();
      this.jars.set(url.host, jar);
    }
    return jar;
  }

  cookie(host: string, name: string): string | undefined {
    return this.jars.get(host)?.get(name);
  }

  setCookie(host: string, name: string, value: string): void {
    this.jar(new URL(`http://${host}`)).set(name, value);
  }

  async request(
    input: string | URL,
    init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ): Promise<Response> {
    const url = new URL(input);
    const jar = this.jar(url);
    const cookieHeader = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    const response = await fetch(url, {
      method: init.method ?? 'GET',
      redirect: 'manual',
      headers: { ...(cookieHeader === '' ? {} : { Cookie: cookieHeader }), ...init.headers },
      ...(init.body === undefined ? {} : { body: init.body }),
    });
    for (const header of response.headers.getSetCookie()) {
      const [pair = '', ...attributes] = header.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      const expired = attributes.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value === '';
      if (expired) jar.delete(name);
      else jar.set(name, value);
    }
    return response;
  }
}

/** Extracts the Keycloak login form action from its HTML. */
export function loginFormAction(html: string): string {
  const match = /<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/.exec(html);
  if (match?.[1] === undefined) {
    throw new Error('Keycloak login form not found');
  }
  return match[1].replaceAll('&amp;', '&');
}
