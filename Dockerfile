# =================================================================
# Stage 1: Build & Compile TypeScript
# =================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests, build scripts, and pre-packaged WASM files for caching and offline builds
COPY package*.json ./
COPY scripts/ ./scripts/
COPY public/ ./public/

# Install all dependencies (including devDependencies for build tooling)
RUN npm ci

# Copy configuration and source files
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to dist/cli.js
RUN npm run build

# =================================================================
# Stage 2: Production Runtime
# =================================================================
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies (skip lifecycle scripts to avoid re-downloading WASM)
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy build artifacts and WASM grammar files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Create executable symlinks (stackengine / se)
RUN ln -s /app/dist/cli.js /usr/local/bin/stackengine && \
    ln -s /app/dist/cli.js /usr/local/bin/se && \
    chmod +x /app/dist/cli.js

# Set directory ownership and switch to non-root node user
RUN chown -R node:node /app
USER node

# Expose proxy port
EXPOSE 8080

# Set default entrypoint to CLI in proxy mode
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["proxy", "--port", "8080", "--upstream", "https://api.openai.com"]
