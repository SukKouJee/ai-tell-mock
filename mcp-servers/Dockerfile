# ============================================
# Stage 1: Build
# ============================================
FROM node:18-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy package files first (cache optimization)
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/sql-validator-mcp/package.json ./packages/sql-validator-mcp/
COPY packages/airflow-mcp/package.json ./packages/airflow-mcp/
COPY packages/datahub-mcp/package.json ./packages/datahub-mcp/
COPY packages/gateway-bridge/package.json ./packages/gateway-bridge/
COPY packages/gateway/package.json ./packages/gateway/

# Install all dependencies
RUN npm ci

# Copy source code
COPY tsconfig.base.json ./
COPY packages/ ./packages/

# Build TypeScript
RUN npm run build

# ============================================
# Stage 2: Production
# ============================================
FROM node:18-alpine AS production

WORKDIR /app

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/sql-validator-mcp/package.json ./packages/sql-validator-mcp/
COPY packages/airflow-mcp/package.json ./packages/airflow-mcp/
COPY packages/datahub-mcp/package.json ./packages/datahub-mcp/
COPY packages/gateway-bridge/package.json ./packages/gateway-bridge/
COPY packages/gateway/package.json ./packages/gateway/

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/sql-validator-mcp/dist ./packages/sql-validator-mcp/dist
COPY --from=builder /app/packages/airflow-mcp/dist ./packages/airflow-mcp/dist
COPY --from=builder /app/packages/datahub-mcp/dist ./packages/datahub-mcp/dist
COPY --from=builder /app/packages/gateway-bridge/dist ./packages/gateway-bridge/dist
COPY --from=builder /app/packages/gateway/dist ./packages/gateway/dist

# Copy mock data if needed
COPY mock-data/ ./mock-data/

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

USER nodejs

# Environment defaults
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Run gateway
CMD ["npm", "run", "start", "-w", "packages/gateway"]
