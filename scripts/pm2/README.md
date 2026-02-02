# PM2 Development Environment

PM2 provides process management for Lightdash local development, enabling better monitoring and simple CLI control of all development services.

## Quick Start

```bash
# Start all development services
pnpm pm2:start

# View logs from all services
pnpm pm2:logs

# Check status of all processes
pnpm pm2:status
```

## Prerequisites

Before starting PM2, ensure Docker dev services are running:

```bash
./scripts/docker-dev.sh
# or use the Claude Code skill:
/docker-dev
```

## Available Commands

| Command | Description |
|---------|-------------|
| `pnpm pm2:start` | Start all development processes |
| `pnpm pm2:stop` | Stop all processes (keeps them registered) |
| `pnpm pm2:restart` | Restart all processes |
| `pnpm pm2:delete` | Stop and remove all processes from PM2 |
| `pnpm pm2:status` | Show process status table |
| `pnpm pm2:monit` | Open interactive monitoring dashboard |
| `pnpm pm2:logs` | Stream all process logs |
| `pnpm pm2:logs:api` | Stream API server logs only |
| `pnpm pm2:logs:scheduler` | Stream scheduler logs only |
| `pnpm pm2:logs:frontend` | Stream frontend logs only |
| `pnpm pm2:restart:api` | Restart only the API server |
| `pnpm pm2:restart:scheduler` | Restart only the scheduler |
| `pnpm pm2:restart:frontend` | Restart only the frontend |
| `pnpm dev:pm2` | Start all processes and immediately tail logs |

## Process Overview

| Process | Port | Description |
|---------|------|-------------|
| `lightdash-api` | 8080 | Backend Express API server |
| `lightdash-scheduler` | 8081 | Background job processor (graphile-worker) |
| `lightdash-frontend` | 3000 | Vite dev server with HMR |
| `lightdash-common-watch` | - | TypeScript watcher for common package |
| `lightdash-warehouses-watch` | - | TypeScript watcher for warehouses package |

## Verification

After starting, verify the setup:

1. Check all processes are online:
   ```bash
   pnpm pm2:status
   ```

2. Verify frontend is accessible:
   ```
   http://localhost:3000
   ```

3. Verify API health:
   ```bash
   curl http://localhost:8080/api/v1/health
   ```

## Log Files

PM2 writes logs to `~/.pm2/logs/` (default PM2 location):
- `lightdash-api-out.log` / `lightdash-api-error.log`
- `lightdash-scheduler-out.log` / `lightdash-scheduler-error.log`
- `lightdash-frontend-out.log` / `lightdash-frontend-error.log`
- `lightdash-common-watch-out.log` / `lightdash-common-watch-error.log`
- `lightdash-warehouses-watch-out.log` / `lightdash-warehouses-watch-error.log`

## Comparison with `pnpm dev`

| Feature | `pnpm dev` | `pnpm pm2:start` |
|---------|------------|------------------|
| Process visibility | Interleaved terminal output | Individual process status/logs |
| Restart individual service | Not possible | `pnpm pm2:restart:api` |
| Memory/CPU monitoring | Not available | `pnpm pm2:monit` |
| Log management | Terminal only | Persistent log files |
| Background running | No | Yes (processes persist) |
| Best for | Quick terminal-based dev | LLM control, debugging |

## Troubleshooting

### Processes not starting
1. Check Docker services are running
2. Ensure `.env.development.local` exists
3. Run `pnpm install` if dependencies are missing

### Port already in use
Stop any existing dev processes:
```bash
pnpm pm2:delete
# or kill processes manually
lsof -ti:8080 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

### View detailed process info
```bash
pm2 show lightdash-api
```

### Clear PM2 logs
```bash
pm2 flush
```
