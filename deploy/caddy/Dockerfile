# syntax=docker/dockerfile:1.7
# Builds the PWA and serves it from Caddy, which also proxies /api to the API.

FROM node:26.13.1-trixie-slim AS build
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts -w @etkinlik/shared -w @etkinlik/web --include-workspace-root
COPY tsconfig.base.json ./
COPY design-system design-system
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @etkinlik/shared && npm run build -w @etkinlik/web

FROM caddy:2.11.9-alpine AS runtime
COPY deploy/caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
RUN SITE_ADDRESS=localhost API_UPSTREAM=api:3000 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
