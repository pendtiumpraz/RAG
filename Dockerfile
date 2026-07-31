# Multi-stage build for the on-prem/self-hosted app image.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV MODEL_CACHE_DIR=/app/.model-cache
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json

# Berkas penyiapan basis data IKUT DISALIN — tanpa ini image-nya tak bisa
# menyiapkan dirinya sendiri. Sebelumnya hanya .next/node_modules/public yang
# masuk, sehingga `npm run db:migrate` (butuh src/modules/core/db/migrate.ts)
# dan `npm run db:setup-role` (butuh scripts/) MUSTAHIL dijalankan di dalam
# kontainer. Akibatnya `docker compose up` menghasilkan aplikasi tanpa satu
# tabel pun, dan tak ada jalan memperbaikinya dari dalam.
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
RUN mkdir -p /app/.model-cache
EXPOSE 3000
CMD ["npm", "start"]
