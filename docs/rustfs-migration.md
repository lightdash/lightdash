# Migrating object storage from MinIO to RustFS

Lightdash has replaced MinIO with [RustFS](https://rustfs.com) as the bundled
S3-compatible object store. RustFS now runs on ports 9000 and 9001, where MinIO
used to be, and the `minio` service is gone from the compose files.

If you are upgrading from a release that used MinIO, your objects are still in
the old MinIO volume and will not appear in RustFS on their own. This page is
how to bring them across.

Everything Lightdash keeps in object storage is affected: dashboard screenshots,
CSV and PDF exports, cached query results, and generated data-app bundles. None
of it lives in Postgres, so no database migration brings it over.

RustFS cannot read MinIO's on-disk format. Pointing RustFS at the old
`minio_data` volume does not work and corrupts data. The objects have to be
copied over the S3 API, which is what the script below does.

## Before you start

Both servers have to be running at once, on the same Docker network, so the
copy can read from one and write to the other.

RustFS comes up with the rest of the stack. Start your previous MinIO container
alongside it, on the same network and still attached to its existing data
volume. Give it a host port other than 9000, which RustFS now uses:

```bash
docker run -d --name minio \
  --network <the stack's network> \
  -p 9010:9000 \
  -v <project>_minio_data:/data \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin \
  coollabsio/minio:latest server /data
```

`docker network ls` shows the network name; it is usually `<project>_default`.
`docker volume ls` shows the volume.

## Copy the objects

```bash
./scripts/migrate-minio-to-rustfs.sh
```

The script reads only from MinIO. It deletes nothing on either side, and it is
safe to re-run: objects that already match are skipped and changed ones are
refreshed. It finds the Docker network from the running RustFS container, copies
each bucket, then compares object counts and fails if any bucket does not match.

Options, for anything that is not the default layout:

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

## Check the result

Open a dashboard screenshot, download a CSV export, and open a data app. Those
exercise read, write and presigned access respectively.

## Rolling back

Point the S3 settings back at your MinIO and restart:

```bash
S3_ENDPOINT=http://minio:9000
S3_PUBLIC_ENDPOINT=http://localhost:9010
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
```

The MinIO volume is untouched by the migration, so nothing is lost. Objects
written while RustFS was live stay in RustFS; copy them back by running the
script with the endpoints swapped.

`S3_PUBLIC_ENDPOINT` is the browser-facing URL used to sign presigned URLs. It
must be reachable from the browser and must match the host the browser fetches,
or SigV4 rejects the request.

## Removing MinIO

Once the app has run on RustFS long enough for you to trust it, stop the MinIO
container and drop its volume:

```bash
docker rm -f minio
docker volume rm <project>_minio_data
```

This is irreversible, so keep a copy until you are sure.

## Notes on behaviour that differs from MinIO

- **CORS is server-wide.** MinIO needed a CORS document per bucket. RustFS takes
  `RUSTFS_CORS_ALLOWED_ORIGINS` once, covering every bucket including ones the
  app creates later. Without it the S3 API sends no CORS headers and browser
  uploads fail.
- **The console moved.** It is still on port 9001, but served at
  `/rustfs/console/` rather than at the root.
- **Credentials changed.** The bundled defaults are `rustfsadmin` rather than
  `minioadmin`. Update `S3_ACCESS_KEY` and `S3_SECRET_KEY` if you pinned them.
- **Path-style addressing is still required.** Keep `S3_FORCE_PATH_STYLE=true`.
- **Object metadata is preserved.** Content types survive the copy, which
  matters for served app bundles.
