# Build stage
FROM node:18-slim as builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && \
    npx playwright install chromium --with-deps

# Production stage
FROM node:18-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    libgtk-3-0 \
    libnss3 \
    libnspr4 \
    libxss1 \
    libasound2 \
    libxrandr2 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libgbm1 \
    libxkbcommon0 \
    libegl1 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed node_modules and playwright browsers from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin

# Copy application code
COPY . .

# Create non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8000) + '/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

CMD ["node", "src/index.js"]
