# Draw: build the SPA, then run the Hono server (tsx) which serves dist/ + API + WebSocket.
FROM node:24-bookworm-slim AS build
WORKDIR /app
# better-sqlite3 falls back to compiling when its prebuilt binary can't be downloaded
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci --include=dev --no-audit --no-fund
COPY . .
RUN npx vite build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json tsconfig.json ./
COPY server ./server
VOLUME /data
EXPOSE 3000
CMD ["node_modules/.bin/tsx", "server/index.ts"]
