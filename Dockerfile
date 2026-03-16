FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/vytronix_ai_engine
ENV LLM_PROVIDER=lmstudio
ENV LM_STUDIO_BASE_URL=http://127.0.0.1:1234
ENV LM_STUDIO_MODEL=qwen2.5-7b-instruct
ENV LM_STUDIO_TEMPERATURE=0.2
ENV LM_STUDIO_MAX_TOKENS=1200
ENV LLM_REQUEST_TIMEOUT_MS=45000
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/src ./src
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000
CMD ["npm", "run", "start"]
