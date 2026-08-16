FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV DATABASE_URL=postgres://postgres:build-only@127.0.0.1:5432/vytronix_ai_engine
ENV LLM_PROVIDER=lmstudio
ENV LM_STUDIO_BASE_URL=http://127.0.0.1:1234
ENV LM_STUDIO_MODEL=qwen2.5-7b-instruct
ENV LM_STUDIO_TEMPERATURE=0.2
ENV LM_STUDIO_MAX_TOKENS=1200
ENV LLM_REQUEST_TIMEOUT_MS=45000
ENV AI_ENGINE_API_KEY=build-only-placeholder
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/package-lock.json ./package-lock.json
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

USER node

EXPOSE 3000
CMD ["npm", "run", "start"]
