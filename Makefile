.DEFAULT_GOAL := help
.PHONY: help env install infra up down logs dev migrate test lint format typecheck build clean

help: ## Muestra esta ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

env: ## Crea el .env y genera las claves que faltan
	node scripts/setup-env.mjs

install: env ## Instala las dependencias del monorepo
	pnpm install

infra: ## Levanta solo PostgreSQL y Redis (para desarrollo nativo)
	docker compose up -d postgres redis
	@echo "Esperando a que la infraestructura esté lista..."
	docker compose exec -T postgres sh -c 'until pg_isready -U $${POSTGRES_USER:-bravo}; do sleep 1; done'

up: install infra ## Arranque completo desde cero: entorno, dependencias e infraestructura
	@echo ""
	@echo "  Ejecuta 'make dev'. La API queda en http://localhost:3001"

down: ## Detiene la infraestructura
	docker compose down

clean: ## Detiene la infraestructura y BORRA los volúmenes de datos
	docker compose down -v

logs: ## Sigue los logs de la infraestructura
	docker compose logs -f

dev: ## Arranca en paralelo, con recarga, todo lo que tenga script dev
	pnpm dev

migrate: ## Aplica las migraciones pendientes
	pnpm --filter @bravo/api prisma:migrate

test: ## Ejecuta los tests unitarios
	pnpm test

lint: ## Pasa ESLint a todo el monorepo
	pnpm lint

format: ## Formatea con Prettier
	pnpm format

typecheck: ## Comprueba tipos sin emitir
	pnpm typecheck

build: ## Compila todos los paquetes
	pnpm build
