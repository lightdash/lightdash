# Docker Configuration for Lightdash Development

<summary>
Docker Compose configurations for the supporting infrastructure that Lightdash needs in local development, like PostgreSQL, MinIO, headless browser, Prometheus and Mailpit.
</summary>

<importantToKnow>

**S3 / MinIO**:

-   `S3_ENDPOINT` — internal endpoint used by the backend (e.g. `http://minio:9000` inside Docker)
-   `S3_PUBLIC_ENDPOINT` — browser-facing endpoint used when minting presigned URLs that the browser fetches directly (e.g. app image uploads via PUT). Required in local dev because the Docker hostname `minio` is unreachable from the browser; set to `http://localhost:9000`. In production with real S3, omit this — the internal endpoint is already publicly resolvable.

**Configuration Files**:

-   `docker-compose.infra.yml`: Infrastructure services (PostgreSQL, MinIO, SSH server, headless browser, Prometheus, Mailpit)
-   `docker-compose.dev.shared.yml`: Shared services that run once for all dev instances
-   `dev-configs/`: Prometheus and SSH server configs mounted by `docker-compose.infra.yml`

</importantToKnow>

<links>
- Development setup: @/README.md
- Environment variables: @/.env.example
- Prometheus config: @/docker/dev-configs/prometheus.dev.yml
- Production dockerfile: @/dockerfile
</links>
