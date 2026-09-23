# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ARG NEXT_PUBLIC_ORGANIZATION_SLUG=acme-analytics
ARG NEXT_PUBLIC_DEV_AUTO_LOGIN=false
ARG NEXT_PUBLIC_DEV_EMAIL=admin@example.com
ARG NEXT_PUBLIC_DEV_PASSWORD=change-me-now
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ORGANIZATION_SLUG=$NEXT_PUBLIC_ORGANIZATION_SLUG
ENV NEXT_PUBLIC_DEV_AUTO_LOGIN=$NEXT_PUBLIC_DEV_AUTO_LOGIN
ENV NEXT_PUBLIC_DEV_EMAIL=$NEXT_PUBLIC_DEV_EMAIL
ENV NEXT_PUBLIC_DEV_PASSWORD=$NEXT_PUBLIC_DEV_PASSWORD
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/public ./public
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["npm", "run", "start"]
