# What this file does
# - Builds a production "preview build" container for the LMS.
#
# Key concepts (plain English)
# - Multi-stage build keeps the final image smaller:
#   1) install deps
#   2) build Next.js
#   3) run the compiled app
#
# How it works
# - This Dockerfile expects the build context to be the `/lms` folder.
# - The interactive training assets live outside the image in a mounted `/app/content` volume.
#
# How to change it
# - If you later switch to Postgres, you'll typically only adjust env vars and volumes (README).

FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Install dependencies first (better layer caching).
COPY package.json package-lock.json* ./
RUN npm ci

# Prisma client generation needs the schema present.
COPY prisma ./prisma
RUN npx prisma generate

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .

RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Next.js output + runtime deps
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Notes:
# - You must provide env vars at runtime (NEXTAUTH_SECRET, DATABASE_URL, etc.).
# - For SQLite, mount a volume for /app/prisma to persist the DB file.
# - For modules, mount a volume for /app/content and set CONTENT_DIR="./content".
CMD ["npm", "start"]

