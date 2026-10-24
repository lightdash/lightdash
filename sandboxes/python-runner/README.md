# python-runner sandbox

Image for python query nodes (`POST /api/v2/projects/{projectUuid}/query/python`).
The backend writes the harness and the user code into `/work` per run, pushes the
referenced result files into `/work/in`, runs `python3 -I runner.py`, and reads
`/work/out/result.jsonl` and `/work/out/meta.json` back. The sandbox has no
egress and no credentials.

- Production: `SANDBOX_PROVIDER=e2b`, template `E2B_PYTHON_TEMPLATE_NAME` (default
  `lightdash-python-runner`) at tag `E2B_PYTHON_TEMPLATE_TAG` (default: running version).
- Local: `SANDBOX_PROVIDER=docker`, image `SANDBOX_PYTHON_DOCKER_IMAGE` (default
  `lightdash-python-runner:local`), built with `./build-local-image.sh`.
- Cloud Run: `SANDBOX_PROVIDER=gcp-cloud-run`. The gateway bakes in one image, so
  python needs its own gateway service, separate from the data-app one. Build it
  with `./build-cloud-run-image.sh` and point the backend at it with
  `GCP_CLOUD_RUN_PYTHON_SANDBOX_URL` / `GCP_CLOUD_RUN_PYTHON_SANDBOX_SECRET`.

Preinstalled libraries: pandas, numpy, scipy, pyarrow, scikit-learn, polars
(pinned in `e2b.Dockerfile`). `run()` must still return a pandas DataFrame.

Publishing: `post-release.yml` builds `lightdash-python-runner:<version>` in both
E2B regions on every release where this directory changed, and retags `:latest`
otherwise. Local builds use `pnpm run build` (`build-sandbox.ts`).

## Warm E2B variant

`pnpm run build --warm` uses the same Dockerfile, then runs an isolated Python
process importing numpy, pandas, scipy.stats and pyarrow. The ready check waits
for `/tmp/python-warm-ready`, written after those imports, before E2B snapshots
the template. That process stays asleep; each query still starts a fresh
`python3 -I /work/runner.py` process.

The warm build and `pnpm exec tsx assign-tag.ts --warm` use
`E2B_PYTHON_WARM_TEMPLATE_NAME` (default `lightdash-python-runner-warm`),
`E2B_PYTHON_WARM_TEMPLATE_TAG`, `E2B_PYTHON_WARM_TEMPLATE_EXTRA_TAGS` and
`E2B_PYTHON_WARM_TEMPLATE_SOURCE_TAG`. Cold builds and tags use their existing
variables. Release publishing handles both variants in both regions.

For the local experiment, build only the isolated experimental target:

```sh
E2B_PYTHON_WARM_TEMPLATE_NAME=lightdash-python-runner-exp-warm \
E2B_PYTHON_WARM_TEMPLATE_TAG=exp \
E2B_PYTHON_WARM_TEMPLATE_EXTRA_TAGS= \
pnpm run build --warm
```

Configure the local backend with the existing E2B credentials/domain and:

```ini
SANDBOX_PROVIDER=e2b
E2B_PYTHON_WARM_TEMPLATE_NAME=lightdash-python-runner-exp-warm
E2B_PYTHON_WARM_TEMPLATE_TAG=exp
LIGHTDASH_ENABLE_FEATURE_FLAGS=composer-optimization-python-warm-template
```

Preserve other entries in `LIGHTDASH_ENABLE_FEATURE_FLAGS`; the composer endpoint
still requires `compose-sql-runner`. Alternatively, enable the warm flag for the
project's organization through Console, with no ENV force-on. Backend warm tags
default to the running Lightdash version. Restart API/workers after ENV changes.
