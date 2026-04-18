# SunHub · Comandos agrupados
# -----------------------------------------------------------------------------
# Uso rápido:
#   make help          → lista de targets
#   make bootstrap     → setup completo desde cero (deps + db + datos reales)
#   make up            → bootstrap + dev server + cron (un solo comando)
#   make dev           → solo Next.js
#   make cron          → solo worker con cron (sincronización periódica)
# -----------------------------------------------------------------------------

SHELL := /bin/bash
.DEFAULT_GOAL := help

DC_CONTAINER ?= sunhub-pg
DC_IMAGE     ?= postgres:15
DC_PASSWORD  ?= sunhub
DC_PORT      ?= 5432

# Mailpit (SMTP local + UI web para capturar correos en dev)
DC_MAIL_CONTAINER ?= sunhub-mail
DC_MAIL_IMAGE     ?= axllent/mailpit:latest
DC_MAIL_SMTP_PORT ?= 1025
DC_MAIL_UI_PORT   ?= 8025

.PHONY: help install db-up db-down db-reset db-push db-generate db-studio \
        plants-sync ingest alarms cron dev build start lint bootstrap up clean mw-ping \
        create-user data-reset smtp-up smtp-down smtp-reset

help:
	@printf "\nSunHub · Makefile targets\n\n"
	@printf "  %-16s %s\n" "install"      "Instala dependencias (npm install)"
	@printf "  %-16s %s\n" "db-up"        "Arranca Postgres local (docker: $(DC_CONTAINER))"
	@printf "  %-16s %s\n" "db-down"      "Detiene Postgres local"
	@printf "  %-16s %s\n" "db-reset"     "Elimina contenedor + volumen de Postgres"
	@printf "  %-16s %s\n" "smtp-up"      "Arranca Mailpit local (SMTP:$(DC_MAIL_SMTP_PORT) | UI:$(DC_MAIL_UI_PORT))"
	@printf "  %-16s %s\n" "smtp-down"    "Detiene Mailpit"
	@printf "  %-16s %s\n" "smtp-reset"   "Elimina contenedor de Mailpit"
	@printf "  %-16s %s\n" "db-push"      "prisma db push (aplica schema al DB)"
	@printf "  %-16s %s\n" "db-generate"  "prisma generate"
	@printf "  %-16s %s\n" "db-studio"    "Abre Prisma Studio"
	@printf "  %-16s %s\n" "plants-sync"  "Sincroniza plantas reales desde el middleware"
	@printf "  %-16s %s\n" "ingest"       "Corre un tick único de ingestión (one-shot)"
	@printf "  %-16s %s\n" "alarms"       "Corre un tick único del worker de alarmas (one-shot)"
	@printf "  %-16s %s\n" "cron"         "Levanta el worker con cron (ingest + alarms + plants-sync)"
	@printf "  %-16s %s\n" "dev"          "Arranca Next.js (localhost:3000)"
	@printf "  %-16s %s\n" "build"        "Build de producción"
	@printf "  %-16s %s\n" "start"        "Arranca Next.js en modo producción"
	@printf "  %-16s %s\n" "lint"         "Linter"
	@printf "  %-16s %s\n" "mw-ping"      "Health-check del middleware"
	@printf "  %-16s %s\n" "create-user"  "Crea o actualiza un usuario: make create-user EMAIL=... PASSWORD=... [ROLE=admin] [NAME=...]"
	@printf "  %-16s %s\n" "data-reset"   "Borra todos los datos operacionales y re-sincroniza desde el middleware (preserva usuarios)"
	@printf "\n"
	@printf "  %-16s %s\n" "bootstrap"    "install + db-up + db-push + plants-sync"
	@printf "  %-16s %s\n" "up"           "bootstrap + dev + cron en paralelo (Ctrl+C mata ambos)"
	@printf "  %-16s %s\n" "clean"        "Limpia .next/ y caches de build"
	@printf "\n"

# ---------- deps -----------------------------------------------------------
install:
	npm install

# ---------- base de datos --------------------------------------------------
db-up:
	@if docker ps -a --format '{{.Names}}' | grep -q "^$(DC_CONTAINER)$$"; then \
	  docker start $(DC_CONTAINER) >/dev/null && echo "✓ Postgres ya existía, arrancado ($(DC_CONTAINER))"; \
	else \
	  docker run -d --name $(DC_CONTAINER) -e POSTGRES_PASSWORD=$(DC_PASSWORD) \
	    -p $(DC_PORT):5432 $(DC_IMAGE) >/dev/null && echo "✓ Postgres creado ($(DC_CONTAINER))"; \
	fi
	@echo "⏳ esperando a que Postgres acepte conexiones…"
	@until docker exec $(DC_CONTAINER) pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done
	@docker exec $(DC_CONTAINER) psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='sunhub'" \
	  | grep -q 1 || docker exec $(DC_CONTAINER) psql -U postgres -c "CREATE DATABASE sunhub" >/dev/null
	@echo "✓ Postgres listo en localhost:$(DC_PORT)"

db-down:
	-docker stop $(DC_CONTAINER) >/dev/null 2>&1 && echo "✓ Postgres detenido"

db-reset:
	-docker rm -f $(DC_CONTAINER) >/dev/null 2>&1 && echo "✓ Contenedor eliminado"

# ---------- SMTP local (Mailpit) -------------------------------------------
# Mailpit captura TODOS los correos salientes en una UI web (no los reenvía).
# SMTP sin auth ni TLS en el puerto $(DC_MAIL_SMTP_PORT), UI en http://localhost:$(DC_MAIL_UI_PORT).
smtp-up:
	@if docker ps -a --format '{{.Names}}' | grep -q "^$(DC_MAIL_CONTAINER)$$"; then \
	  docker start $(DC_MAIL_CONTAINER) >/dev/null && echo "✓ Mailpit ya existía, arrancado ($(DC_MAIL_CONTAINER))"; \
	else \
	  docker run -d --name $(DC_MAIL_CONTAINER) \
	    -p $(DC_MAIL_SMTP_PORT):1025 -p $(DC_MAIL_UI_PORT):8025 \
	    -e MP_SMTP_AUTH_ACCEPT_ANY=1 \
	    -e MP_SMTP_AUTH_ALLOW_INSECURE=1 \
	    $(DC_MAIL_IMAGE) >/dev/null && echo "✓ Mailpit creado ($(DC_MAIL_CONTAINER))"; \
	fi
	@echo "✓ SMTP listo en localhost:$(DC_MAIL_SMTP_PORT) · UI http://localhost:$(DC_MAIL_UI_PORT)"

smtp-down:
	-docker stop $(DC_MAIL_CONTAINER) >/dev/null 2>&1 && echo "✓ Mailpit detenido"

smtp-reset:
	-docker rm -f $(DC_MAIL_CONTAINER) >/dev/null 2>&1 && echo "✓ Contenedor Mailpit eliminado"

db-push:
	npm run db:push

db-generate:
	npm run db:generate

db-studio:
	npm run db:studio

# ---------- ingestión ------------------------------------------------------
plants-sync:
	npm run plants:sync

ingest:
	npm run ingest

alarms:
	npm run alarms

cron:
	npm run cron

mw-ping:
	npm run mw:ping

# Reset de datos operacionales. Borra plants/devices/readings/alarms/predictions/contracts/reports
# y re-sincroniza plantas reales desde el middleware. Preserva users/sessions/providers.
#   make data-reset           → interactivo, pide confirmación
#   make data-reset YES=1     → sin confirmación
data-reset:
	@if [ "$(YES)" = "1" ]; then \
	  npm run data:reset -- --yes; \
	else \
	  npm run data:reset; \
	fi

# Crea un usuario. Uso:
#   make create-user EMAIL=ops@sunhub.co PASSWORD=cambiar123 ROLE=admin NAME="Roberto Striana"
create-user:
	@if [ -z "$(EMAIL)" ] || [ -z "$(PASSWORD)" ]; then \
	  echo "✗ Uso: make create-user EMAIL=... PASSWORD=... [ROLE=admin|ops|viewer] [NAME=...]"; \
	  exit 1; \
	fi
	EMAIL="$(EMAIL)" PASSWORD="$(PASSWORD)" ROLE="$${ROLE:-admin}" NAME="$${NAME:-$(EMAIL)}" npm run user:create

# ---------- app ------------------------------------------------------------
dev:
	npm run dev

build:
	npm run build

start:
	npm run start

lint:
	npm run lint

clean:
	rm -rf .next tsconfig.tsbuildinfo

# ---------- workflows ------------------------------------------------------
# Setup completo: deps, DB lista, schema aplicado, plantas reales cargadas.
bootstrap: install db-up smtp-up db-push plants-sync
	@echo ""
	@echo "✓ Bootstrap completo."
	@echo "  Próximo paso → make up   (dev + cron en paralelo)"

# Un solo comando: todo listo + levanta Next.js y el cron.
# Ctrl+C detiene ambos procesos.
up: bootstrap
	@echo ""
	@echo "▶ Arrancando Next.js + cron worker (Ctrl+C para detener ambos)…"
	@trap 'kill 0' EXIT INT TERM; \
	  npm run cron & \
	  npm run dev; \
	  wait
