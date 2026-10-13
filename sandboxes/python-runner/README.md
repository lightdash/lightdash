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

## Publishing

Every release publishes the template to both E2B regions through the
`e2b-templates` matrix in `.github/workflows/post-release.yml`: it builds
`lightdash-python-runner:<version>` (and moves `:latest`) when this directory
changed since the previous release, otherwise it retags `:latest` with the
release version (`assign-tag.ts`). Manual build:

```bash
sfw pnpm install --frozen-lockfile
E2B_API_KEY=... E2B_PYTHON_TEMPLATE_TAG=<tag> pnpm run build
```

## Environment variables (backend)

| Variable | Default | Purpose |
|---|---|---|
| `E2B_PYTHON_TEMPLATE_NAME` | `lightdash-python-runner` | E2B template name |
| `E2B_PYTHON_TEMPLATE_TAG` | running Lightdash version | E2B template tag |
| `SANDBOX_PYTHON_DOCKER_IMAGE` | `lightdash-python-runner:local` | Image for `SANDBOX_PROVIDER=docker` |
| `SANDBOX_INPUT_MAX_BYTES` | `67108864` (64 MiB) | Total input bytes pushed into one sandbox run |
