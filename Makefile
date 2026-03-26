install:
	npm install

dev:
	npm run dev

dev-worker:
	npm run dev:worker

build:
	npm run build

test:
	npm run test

lint:
	npm run lint

up:
	docker-compose up --build

down:
	docker-compose down
