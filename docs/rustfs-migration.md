# Migrating object storage from MinIO to RustFS

Lightdash is replacing MinIO with [RustFS](https://rustfs.com) as the bundled
S3-compatible object store. Both run side by side for one release so objects can
be copied across before MinIO is removed.

Everything Lightdash keeps in object storage is affected: dashboard screenshots,
CSV and PDF exports, cached query results, and generated data-app bundles. None
of it lives in Postgres, so it does not come across with a database migration.

RustFS cannot read MinIO's on-disk format. Pointing RustFS at the old
`minio_data` volume does not work and corrupts data. The objects have to be
copied over the S3 API, which is what the script below does.

## Before you start

Both services must be running. In the compose stacks, MinIO is on 9000 and
RustFS on 9010, and `S3_ENDPOINT` still points at MinIO.

```bash
docker compose -f docker/docker-compose.dev.shared.yml --env-file .env.development up -d
```

## Copy the objects

```bash
./scripts/migrate-minio-to-rustfs.sh
```

The script reads only from MinIO. It deletes nothing on either side, and it is
safe to re-run: objects that already match are skipped and changed ones are
refreshed. It finds the Docker network from the running RustFS container, copies
each bucket, then compares object counts and fails if any bucket does not match.

Options, for anything that is not the default compose layout:

| Flag or variable | Default | Purpose |
|---|---|---|
| `--network NAME` | detected from the running RustFS container | Docker network both servers are on |
| `--buckets a,b,c` | `default,results,lightdash-apps` | Buckets to copy |
| `MINIO_ENDPOINT` | `http://minio:9000` | Source, as seen from that network |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | `minioadmin` | Source credentials |
| `RUSTFS_ENDPOINT` | `http://rustfs:9000` | Target, as seen from that network |
| `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY` | `rustfsadmin` | Target credentials |

Run it again after any final writes, immediately before you switch over. Objects
written to MinIO after a copy are not in RustFS until the next run.

## Switch the app over

Repoint the S3 settings at RustFS and restart. In `.env.development.local` or
your self-host environment:

```bash
S3_ENDPOINT=http://rustfs:9000
S3_PUBLIC_ENDPOINT=http://localhost:9010
S3_ACCESS_KEY=rustfsadmin
S3_SECRET_KEY=rustfsadmin
```

`S3_PUBLIC_ENDPOINT` is the browser-facing URL used to sign presigned URLs. It
must be reachable from the browser and must match the host the browser fetches,
or SigV4 rejects the request.

Check a dashboard screenshot, a CSV export and a data app after the switch.
Those exercise read, write and presigned access respectively.

## Rolling back

Point `S3_ENDPOINT` back at MinIO and restart. The MinIO volume is untouched by
the migration, so nothing is lost. Objects written while RustFS was live stay in
RustFS; copy them back by running the script with the endpoints swapped.

## Removing MinIO

Once the app has run on RustFS long enough for you to trust it, MinIO and its
volume can go. A later release drops the `minio` service from the compose files
and moves RustFS to ports 9000 and 9001.

```bash
docker volume rm <project>_minio_data
```

This is irreversible, so keep a copy until you are sure.

## Notes on behaviour that differs from MinIO

- **CORS is server-wide.** MinIO needed a CORS document per bucket. RustFS takes
  `RUSTFS_CORS_ALLOWED_ORIGINS` once, covering every bucket including ones the
  app creates later. Without it the S3 API sends no CORS headers and browser
  uploads fail.
- **The console moved.** It is on port 9001 inside the container, served at
  `/rustfs/console/` rather than at the root.
- **Path-style addressing is still required.** Keep `S3_FORCE_PATH_STYLE=true`.
- **Object metadata is preserved.** Content types survive the copy, which
  matters for served app bundles.
