# Docker Configuration for Lightdash Development

<summary>
Docker Compose configurations for running Lightdash in different environments. Provides isolated services for the main backend and supporting infrastructure like MinIO and Prometheus.
</summary>

<howToUse>
The main entry point is `docker-compose.dev.yml` for local development:

```bash
# Start all services
docker compose -p lightdash-app -f docker/docker-compose.dev.yml --env-file .env.development.local up --detach --remove-orphans
```

Key services:

-   `lightdash-dev`: Main backend API (ports 8080, 3000, 9090, 6006)
-   `db-dev`: PostgreSQL with pgvector extension
-   `minio`: S3-compatible storage for development
-   `prometheus`: Metrics collection

</howToUse>

<codeExample>

```yaml
# Service architecture with shared configuration
x-lightdash-base: &lightdash-base
  build: *lightdash-build
  volumes: *lightdash-volumes
  environment: *lightdash-environment

services:
  lightdash-dev:
    <<: *lightdash-base
    environment:
      SCHEDULER_EXCLUDE_TASKS: ${SCHEDULER_EXCLUDE_TASKS}
    ports: ['8080:8080', '3000:3000']
```

</codeExample>

<importantToKnow>

**Development Workflow**:

-   `lightdash-dev` starts with `sleep infinity` for manual setup (migrations, builds)
-   Environment variables are deduplicated using YAML anchors (`x-lightdash-*`)

**Port Allocation**:

-   8080: Backend API
-   3000: Frontend development server
-   9090: Prometheus metrics
-   5432: PostgreSQL database
-   9000/9001: MinIO storage

**Configuration Files**:

-   `docker-compose.dev.yml`: Full development environment
-   `docker-compose.dev.mini.yml`: Minimal setup
-   `docker-compose.preview.yml`: Preview deployments

</importantToKnow>

<links>
- Development setup: @/README.md
- Environment variables: @/.env.example
- Prometheus config: @/docker/dev-configs/prometheus.dev.yml
- Production dockerfile: @/dockerfile
</links>
