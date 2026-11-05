# Draw: install deps (cached layer) → typecheck + build the SPA → run the Hono server (tsx).
FROM node:24-bookworm-slim AS build
WORKDIR /app
# dependency layer: reused as long as package.json / package-lock.json / the patch script don't change
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --include=dev --no-audit --no-fund \
 && node -e "new (require('better-sqlite3'))(':memory:').close()"
COPY . .
RUN npx tsc --noEmit -p . && npx vite build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY server ./server
COPY --from=build /app/dist ./dist
VOLUME /data
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "server/index.ts"]
