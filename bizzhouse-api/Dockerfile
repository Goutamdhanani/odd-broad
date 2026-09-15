# ─── Stage 1: Build ─────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# Copy source and compile TypeScript
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src/ ./src/

RUN npm run build

# ─── Stage 2: Production ────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Security: run as non-root
RUN addgroup --system --gid 1001 nestjs && \
    adduser  --system --uid 1001 --ingroup nestjs nestjs

# Install only production dependencies
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --ignore-scripts

# Copy built output
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

USER nestjs

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/main"]
