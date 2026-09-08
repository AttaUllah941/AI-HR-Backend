# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -S zenith && adduser -S zenith -G zenith \
  && apk add --no-cache wget \
  && mkdir -p logs uploads \
  && chown -R zenith:zenith /app

COPY --from=build --chown=zenith:zenith /app/node_modules ./node_modules
COPY --from=build --chown=zenith:zenith /app/dist ./dist
COPY --from=build --chown=zenith:zenith /app/prisma ./prisma
COPY --from=build --chown=zenith:zenith /app/package.json ./package.json
COPY --from=build --chown=zenith:zenith /app/package-lock.json ./package-lock.json
COPY --from=build --chown=zenith:zenith /app/prisma.config.ts ./prisma.config.ts

# Prisma CLI is required for migrate deploy at container start
RUN npm install prisma@7.9.1 --omit=dev --no-save \
  && chown -R zenith:zenith /app/node_modules

USER zenith
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health/live || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
