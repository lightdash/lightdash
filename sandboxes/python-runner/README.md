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

Preinstalled libraries: pandas, numpy, scipy, pyarrow, scikit-learn, polars
(pinned in `e2b.Dockerfile`). `run()` must still return a pandas DataFrame.

Publishing: `post-release.yml` builds `lightdash-python-runner:<version>` in both
E2B regions on every release where this directory changed, and retags `:latest`
otherwise. Local builds use `pnpm run build` (`build-sandbox.ts`).
