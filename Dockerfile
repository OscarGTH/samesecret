FROM node:18 AS builder

WORKDIR /usr/src/app

# Install dependencies (including dev deps for the build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build (Vite + bundle server via esbuild)
COPY . .
RUN npm run build

FROM node:18-slim
WORKDIR /app

# Only runtime deps
COPY package.json package-lock.json ./
RUN npm ci --production=true

# Copy built artifacts from builder
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000
ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/server.cjs"]
