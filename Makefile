.PHONY: up down logs migrate seed demo-incident test lint format benchmark

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f --tail=100

migrate:
	docker compose exec api alembic upgrade head

seed:
	docker compose exec api python -m app.seed

demo-incident:
	docker compose exec api python -m app.demo

test:
	cd apps/api && python -m pytest

lint:
	cd apps/api && ruff check .

format:
	cd apps/api && ruff format .

benchmark:
	cd apps/api && python -m app.benchmarks.run
