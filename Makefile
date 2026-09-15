.PHONY: setup db dev check-all check-db build

setup:
	@test -f .env || cp .env.example .env
	bun install --frozen-lockfile
	cd server && go mod download
	$(MAKE) db

db:
	docker compose up -d --wait db

dev:
	bun run dev:all

check-all:
	bun run check:all:fix
	cd server && go fmt ./... && go test -race ./... && go vet ./... && go build ./...

check-db:
	@test -n "$$TEST_DATABASE_URL" || (echo "Set TEST_DATABASE_URL to an isolated PostgreSQL database." && exit 1)
	cd server && go test -race -count=1 ./...

build:
	bun run build
	cd server && go build -o small-hero-api ./cmd/server
