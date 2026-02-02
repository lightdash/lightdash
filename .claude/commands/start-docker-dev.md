Start the Lightdash development environment (assumes setup is already complete).

Use `/setup-docker-dev` if this is a fresh setup or Docker volumes were cleared.

## Step 1: Check and Start Docker Services

Check if Docker services are running:
```bash
docker compose -f docker/docker-compose.dev.mini.yml ps
```

If not running or services are unhealthy, start them:
```bash
docker compose -f docker/docker-compose.dev.mini.yml --env-file .env.development up -d
```

Wait a few seconds for PostgreSQL to be ready.

## Step 2: Start the Development Server

```bash
export PGHOST=localhost S3_ENDPOINT=http://localhost:9000 HEADLESS_BROWSER_HOST=localhost HEADLESS_BROWSER_PORT=3001
pnpx dotenv-cli -e .env.development -- pnpm dev
```

## Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **Demo login**: `demo@lightdash.com` / `demo_password!`

## Common Issues

- **`relation "sessions" does not exist`**: Run migrations: `PGHOST=localhost pnpx dotenv-cli -e .env.development -- pnpm -F backend migrate`
- **Redirected to `/register`**: Database needs seeding. Use `/reset-docker-dev` to reset and seed.
- **`relation "jaffle.orders" does not exist`**: dbt models need building. Use `/reset-docker-dev` to rebuild.
