# syntax=docker/dockerfile:1.7
# One image, two entry points: HTTP API (default) and worker (dist/worker.js).

FROM node:26.13.1-trixie-slim AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts -w @etkinlik/shared -w @etkinlik/api --include-workspace-root

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @etkinlik/shared && npm run build -w @etkinlik/api

# One-off migration runner (`docker compose run --rm migrate`). Never runs on API start-up,
# so a backup can be taken first (docs/isletim-kilavuzu.md, "Göçler").
FROM build AS migrate
WORKDIR /app/apps/api
USER node
CMD ["/app/node_modules/.bin/prisma", "migrate", "deploy"]

FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts --omit=dev -w @etkinlik/shared -w @etkinlik/api

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=prod-deps --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/packages/shared/package.json packages/shared/
COPY --from=build --chown=root:root /app/packages/shared/dist packages/shared/dist
COPY --from=build --chown=root:root /app/apps/api/package.json apps/api/
COPY --from=build --chown=root:root /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "--enable-source-maps", "dist/main.js"]
