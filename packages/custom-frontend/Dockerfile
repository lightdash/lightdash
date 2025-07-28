# ---------- STAGE 1: Build ----------
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy only the files needed for install
COPY package.json ./

# Install dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate && pnpm install --no-frozen-lockfile

# Copy the rest of the project
COPY . .

# Build the Next.js app (creates .next/standalone)
RUN pnpm build

# ---------- STAGE 2: Run ----------
FROM node:20-alpine AS runner

# Set working directory
WORKDIR /app

# Copy standalone build from builder stage
COPY --from=builder /app/.next/standalone ./

# Copy static assets (needed for _next/static)
COPY --from=builder /app/.next/static ./.next/static

# Copy public assets if you have any (like favicon, etc.)
COPY --from=builder /app/public ./public

# Expose default Next.js port
EXPOSE 8080

# Set PORT env for Cloud Run
ENV PORT=8080

# Run Next.js standalone server
CMD ["node", "server.js"]
