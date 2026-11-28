/**
 * KVKK: Sentry's defaults collect headers, cookies, bodies, user info, query
 * params, DB parameters and local variables. Everything personal is disabled;
 * only stack traces and structural metadata are sent. Shared by API and web.
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} as const satisfies Record<string, unknown>;
