FROM node:18 AS builder

WORKDIR /usr/src/app

# Copy package files
COPY package.json package-lock.json* ./

# Clean install - delete any cached/local stuff and reinstall fresh
RUN rm -rf node_modules package-lock.json && npm install

# Copy source
COPY . .

# Build
RUN npm run build


FROM node:18-slim

WORKDIR /app

# Copy package.json
COPY package.json ./

# Install production dependencies fresh
RUN npm install --omit=dev

# Copy built files
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/server.cjs"]