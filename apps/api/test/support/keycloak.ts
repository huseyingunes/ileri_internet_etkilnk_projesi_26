import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';

const REALM_FILE = fileURLToPath(
  new URL('../../../../deploy/keycloak/realm/etkinlik-realm.json', import.meta.url),
);

export interface DemoUser {
  username: string;
  role: 'student' | 'advisor' | 'admin';
}

export interface StartedKeycloak {
  container: StartedTestContainer;
  issuer: string;
  users: DemoUser[];
}

/** Starts Keycloak with the same realm file the deployment imports. */
export async function startKeycloak(env: {
  appOrigin: string;
  clientSecret: string;
  demoPassword: string;
  initialAdminEmail: string;
}): Promise<StartedKeycloak> {
  const container = await new GenericContainer('quay.io/keycloak/keycloak:26.8.2')
    .withCommand(['start-dev', '--import-realm'])
    .withEnvironment({
      KC_HTTP_RELATIVE_PATH: '/idp',
      KC_BOOTSTRAP_ADMIN_USERNAME: 'bootstrap',
      KC_BOOTSTRAP_ADMIN_PASSWORD: `${env.clientSecret}-admin`,
      APP_ORIGIN: env.appOrigin,
      OIDC_CLIENT_SECRET: env.clientSecret,
      DEMO_USER_PASSWORD: env.demoPassword,
      INITIAL_ADMIN_EMAIL: env.initialAdminEmail,
    })
    .withCopyFilesToContainer([
      { source: REALM_FILE, target: '/opt/keycloak/data/import/etkinlik-realm.json' },
    ])
    .withExposedPorts(8080)
    .withWaitStrategy(Wait.forLogMessage(/Listening on/))
    .withStartupTimeout(180_000)
    .start();

  const realm: unknown = JSON.parse(await readFile(REALM_FILE, 'utf8'));
  const users: DemoUser[] = [];
  if (
    typeof realm === 'object' &&
    realm !== null &&
    'users' in realm &&
    Array.isArray(realm.users)
  ) {
    for (const user of realm.users as {
      username: string;
      attributes?: { etkinlik_role?: string[] };
    }[]) {
      const role = user.attributes?.etkinlik_role?.[0];
      if (role === 'student' || role === 'advisor' || role === 'admin') {
        users.push({ username: user.username, role });
      }
    }
  }

  return {
    container,
    issuer: `http://${container.getHost()}:${container.getMappedPort(8080).toString()}/idp/realms/etkinlik`,
    users,
  };
}
