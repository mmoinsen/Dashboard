# ---- build the web client ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY web web
COPY server/src/shared server/src/shared
RUN npm run build -w web

# ---- runtime: server (TypeScript runs natively on Node >= 22.18) ----
FROM node:22-alpine
ENV NODE_ENV=production \
    KOMPASS_CONFIG_DIR=/config \
    KOMPASS_WEB_DIR=/app/web/dist \
    PORT=8080
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY server/src server/src
COPY --from=build /app/web/dist web/dist
VOLUME /config
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/src/index.ts"]
