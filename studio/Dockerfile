# Poddar Creation Studio — production image (Phase 5 M31)
#
# Three stages, because the thing that ships should carry neither the toolchain that built it
# nor the sources it was built from. The result is roughly 200MB and contains a Node runtime,
# the traced server, and the Prisma engine — nothing else.
#
#   docker build -t poddar-studio .
#   docker run --env-file .env.production -p 3000:3000 poddar-studio

# ---- 1. Dependencies ---------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# Prisma's engines are built against glibc; on Alpine they need the compatibility layer.
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY prisma.config.ts ./
# `npm ci` runs postinstall, which is `prisma generate` — the client must exist before build.
RUN npm ci

# ---- 2. Build ----------------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A build-time DATABASE_URL is required because Next evaluates server modules while
# prerendering. It is never connected to — any syntactically valid URL will do — and the real
# one arrives at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1
ENV BUILD_STANDALONE=1
RUN npm run build

# ---- 3. Runtime --------------------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# An unprivileged user, because a container that runs as root turns a code-execution bug into
# a host problem.
RUN addgroup -g 1001 -S nodejs && adduser -S studio -u 1001

COPY --from=build --chown=studio:nodejs /app/.next/standalone ./
COPY --from=build --chown=studio:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=studio:nodejs /app/public ./public
# Migrations, the seed and the Prisma CLI travel with the image so a release can migrate
# itself without a second artefact that might not match.
COPY --from=build --chown=studio:nodejs /app/prisma ./prisma
COPY --from=build --chown=studio:nodejs /app/prisma.config.ts ./
COPY --from=build --chown=studio:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=build --chown=studio:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=studio:nodejs /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

USER studio
EXPOSE 3000

# Kubernetes and Compose both understand this; it is the same endpoint the load balancer polls.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
