# SOLARekta production image: one Node process, SQLite database and private uploads
# on a persistent volume mounted at /data. See docs/DEPLOYMENT.md.

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Build tools are only a fallback in case better-sqlite3 has no prebuilt binary.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
# Fail the build early if the native SQLite module did not compile.
RUN node -e "require('better-sqlite3')(':memory:').close()"
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATABASE_PATH=/data/solarekta.db \
    UPLOAD_DIR=/data/uploads \
    PORT=3000
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/db ./db
COPY --from=build /app/scripts/start.mjs ./scripts/start.mjs
EXPOSE 3000
# Runs as root so it can write to platform volumes, which are usually mounted root-owned.
CMD ["node", "scripts/start.mjs"]
