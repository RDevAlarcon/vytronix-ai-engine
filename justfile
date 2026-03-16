default:
  @just --list

# Local app
dev:
  npm run dev

build:
  npm run build

lint:
  npm run lint

typecheck:
  npm run typecheck

# Database
db-migrate:
  npm run db:migrate

db-seed:
  npm run db:seed

# Docker (production compose)
up:
  docker compose up -d --build

logs:
  docker compose logs -f app

down:
  docker compose down

down-v:
  docker compose down -v

# Docker (development compose with hot reload)
dev-up:
  docker compose -f docker-compose.dev.yml up -d --build

dev-logs:
  docker compose -f docker-compose.dev.yml logs -f app

dev-down:
  docker compose -f docker-compose.dev.yml down

dev-down-v:
  docker compose -f docker-compose.dev.yml down -v
