Stop the Lightdash Docker development services.

Use this to stop PostgreSQL, MinIO, and headless browser containers when you're done developing.

## Stop Docker Services

```bash
docker compose -f docker/docker-compose.dev.mini.yml down
```

This stops and removes the containers but **preserves the data volumes** (database data, MinIO files).

## Check Status

To verify services are stopped:
```bash
docker compose -f docker/docker-compose.dev.mini.yml ps
```
