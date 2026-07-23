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
RUN mkdir -p /app/.model-cache
EXPOSE 3000
CMD ["npm", "start"]
