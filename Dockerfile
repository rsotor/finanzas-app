# Imagen opcional: la forma recomendada es `npm install` + `npm run empezar` (ver docs/instalacion.md).
FROM node:22-bookworm-slim AS web
WORKDIR /app
COPY app ./app
COPY styles ./styles
COPY webapp/web ./webapp/web
RUN cd webapp/web && npm ci --no-audit --no-fund && npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 DB_PATH=/datos/finanzas.sqlite WEB_DIR=/app/webapp/web/dist AUTH_MODE=local HOST=0.0.0.0
COPY app ./app
COPY styles ./styles
COPY webapp/server/package*.json ./webapp/server/
RUN cd webapp/server && npm ci --omit=dev --no-audit --no-fund
COPY webapp/server ./webapp/server
COPY --from=web /app/webapp/web/dist ./webapp/web/dist
VOLUME /datos
EXPOSE 3000
CMD ["node", "webapp/server/src/index.js"]
