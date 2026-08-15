.DEFAULT_GOAL := help
.PHONY: help install infra up down logs dev migrate seed test test-integration lint format typecheck build workers-scale k8s-apply k8s-diff clean

help: ## Muestra esta ayuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Instala las dependencias del monorepo
	pnpm install

infra: ## Levanta solo PostgreSQL y Redis (para desarrollo nativo)
	docker compose up -d postgres redis
	@echo "Esperando a que la infraestructura esté lista..."
	docker compose exec -T postgres sh -c 'until pg_isready -U $${POSTGRES_USER:-bravo}; do sleep 1; done'

up: install infra migrate seed ## Arranque completo desde cero: deps, infra, migraciones y datos de ejemplo
	@echo ""
	@echo "  API      -> http://localhost:3001"
	@echo "  Frontend -> http://localhost:3000"
	@echo "  Ejecuta 'make dev' para arrancar API, workers y frontend."

down: ## Detiene la infraestructura
	docker compose down

clean: ## Detiene la infraestructura y BORRA los volúmenes de datos
	docker compose down -v

logs: ## Sigue los logs de la infraestructura
	docker compose logs -f

dev: ## Arranca API, workers y frontend en paralelo
	pnpm dev

migrate: ## Aplica las migraciones de Prisma
	pnpm --filter @bravo/api prisma:migrate

seed: ## Carga usuarios y solicitudes de ejemplo
	pnpm --filter @bravo/api prisma:seed

test: ## Ejecuta los tests unitarios
	pnpm test

test-integration: ## Ejecuta los tests de integración (requiere Docker)
	pnpm --filter @bravo/api test:integration

lint: ## Pasa ESLint a todo el monorepo
	pnpm lint

format: ## Formatea con Prettier
	pnpm format

typecheck: ## Comprueba tipos sin emitir
	pnpm typecheck

build: ## Compila todos los paquetes
	pnpm build

workers-scale: ## Arranca N workers en paralelo (uso: make workers-scale N=5)
	@test -n "$(N)" || (echo "Falta N. Uso: make workers-scale N=5" && exit 1)
	pnpm --filter @bravo/api workers:scale -- --instances=$(N)

k8s-diff: ## Muestra los manifiestos renderizados sin aplicarlos
	kubectl kustomize infra/k8s/overlays/dev

k8s-apply: ## Valida los manifiestos contra el esquema sin desplegar
	kubectl apply --dry-run=client -k infra/k8s/overlays/dev
