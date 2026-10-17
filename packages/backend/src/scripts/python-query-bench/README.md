# Python query node benchmark

Times each phase of a python query node (`POST /api/v2/projects/{projectUuid}/query/python`)
with trivial user code (`return inputs["x"]`) so harness and transport cost is isolated, plus
one realistic case (StandardScaler + KMeans). It drives the real `PythonInputReader`,
`PythonSandboxRunner` and `validatePythonResultRows`, over the Docker sandbox provider
running the same image E2B builds (`sandboxes/python-runner/e2b.Dockerfile`).

```bash
./sandboxes/python-runner/build-local-image.sh
cd packages/backend
LIGHTDASH_SECRET=bench S3_ENDPOINT=http://localhost:9 S3_BUCKET=bench S3_REGION=us-east-1 \
  pnpm exec tsx --tsconfig tsconfig.scripts.json src/scripts/python-query-bench/index.ts \
  [--repeat 3] [--only narrow-100k,kmeans-100k]
```

The S3 variables only satisfy config parsing; nothing is sent to S3.

## What it measures

| phase                                  | where                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `backend.read_inputs`                  | `PythonInputReader` buffering the input JSONL (in-memory stream, no S3 latency) |
| `sandbox.create` / `destroy`           | provider create and destroy                                                     |
| `sandbox.compile`                      | writing `main.py` + `runner.py`, `py_compile`                                   |
| `sandbox.write_inputs`                 | pushing inputs + `meta.json` through the provider file API                      |
| `sandbox.run`                          | the harness process, end to end (includes python start-up and imports)          |
| `harness.load` / `user_code` / `write` | phases inside the harness, reported in `meta.json` `timingsMs`                  |
| `sandbox.read_output`                  | reading `result.jsonl` + `meta.json` back                                       |
| `backend.validate`                     | `validatePythonResultRows` on the API process                                   |
| `backend.serialise_upload`             | writing the result JSONL into the upload stream (null sink, no S3)              |
| `loop.max_block`                       | longest event-loop stall of the API process during the run                      |

Scenarios: `narrow` is 7 columns (number, string, boolean, timestamp, date); `wide50` is 50
columns. Every column has ~1% nulls.

## Not measured

- E2B: sandbox create (~2.5s in production vs ~0.15s for a local container) and file/command
  round trips over the internet (every `files.write` / `commands.run` is one HTTP call;
  Docker is a local `exec`). The rainbow dev environment has no `E2B_API_KEY` and its egress
  allows only `api.e2b.dev`, not the per-sandbox hosts, so end-to-end E2B runs were not
  possible from this session.
- S3 download/upload latency and `wait_references`.

## Results

Docker provider, 4 vCPU container host, median of 3 runs, ms.

### Before (row-wise harness, whole-file validation)

| phase                    | narrow-1k | narrow-10k | narrow-100k | wide50-10k | kmeans-100k |
| ------------------------ | --------: | ---------: | ----------: | ---------: | ----------: |
| input / output MiB       | 0.1 / 0.1 |  1.4 / 1.5 | 14.8 / 14.9 |  7.5 / 7.6 | 14.8 / 16.1 |
| backend.read_inputs      |         1 |          1 |           4 |          2 |           5 |
| sandbox.create           |       164 |        154 |         219 |        150 |         151 |
| sandbox.compile          |       265 |        266 |         260 |        247 |         263 |
| sandbox.write_inputs     |       217 |        213 |         224 |        222 |         220 |
| harness.load             |        15 |        113 |         828 |        419 |         786 |
| harness.user_code        |         0 |          0 |           0 |          0 |       1,285 |
| harness.write            |        44 |        192 |       2,090 |        711 |       2,355 |
| sandbox.run              |       744 |        957 |       3,601 |      1,836 |       5,299 |
| sandbox.read_output      |       155 |        141 |         242 |        163 |         266 |
| backend.validate         |         3 |         12 |         189 |         65 |         187 |
| backend.serialise_upload |         5 |         15 |         156 |         67 |         188 |
| sandbox.destroy          |        75 |         72 |         160 |        142 |         139 |
| loop.max_block           |        17 |         33 |         348 |        136 |         359 |
| **total**                |     1,635 |      1,777 |       4,943 |      2,875 |       6,705 |

`wide50-100k` fails: `Python query inputs exceed the combined size limit of 64 MiB` (77.7 MiB).

### After (pyarrow in, polars out, batched validation, fewer round trips)

| phase                    | narrow-1k | narrow-10k | narrow-100k | wide50-10k | kmeans-100k |
| ------------------------ | --------: | ---------: | ----------: | ---------: | ----------: |
| input / output MiB       | 0.1 / 0.1 |  1.4 / 1.5 | 14.8 / 14.9 |  7.5 / 7.6 | 14.8 / 16.1 |
| backend.read_inputs      |         0 |          2 |          11 |          2 |           5 |
| sandbox.create           |       186 |        151 |         227 |        165 |         162 |
| sandbox.compile          |       264 |        280 |         328 |        273 |         295 |
| sandbox.write_inputs     |       166 |        182 |         233 |        220 |         238 |
| harness.load             |        21 |         86 |         395 |        123 |         331 |
| harness.user_code        |         0 |          0 |           0 |          0 |       1,348 |
| harness.write            |        42 |        171 |         289 |        235 |         274 |
| sandbox.run              |       718 |        947 |       1,504 |      1,054 |       2,882 |
| sandbox.read_output      |       147 |        158 |         316 |        164 |         282 |
| backend.validate         |         4 |         27 |         230 |        103 |         254 |
| backend.serialise_upload |         0 |          2 |           8 |          4 |           9 |
| sandbox.destroy          |        63 |         83 |         123 |         94 |         129 |
| loop.max_block           |        16 |         32 |          41 |         39 |          43 |
| **total**                |     1,226 |      1,496 |       2,625 |      1,774 |       3,875 |

`compile` and `write_inputs` now run concurrently, so their sum exceeds their wall time.
`backend.validate` now also re-serialises rows (it used to happen in `serialise_upload`) and
yields the event loop every ~1 MiB, so it no longer shows up as one stall.

What is left at 100k rows: ~0.75s of python start-up and imports inside `sandbox.run`
(pandas, pyarrow), ~0.7s of harness load + write, ~0.5s of provider file transfer,
~0.25s of backend validation. On E2B, sandbox create and every round trip cost more.

### Where the 64 MiB caps bite

Both the combined input cap (`PYTHON_MAX_INPUT_BYTES`) and the result cap
(`PYTHON_MAX_RESULT_BYTES`) are 64 MiB of JSONL. At the sizes above that is roughly
430k rows for the 7-column shape (~155 B/row) and 82k rows for the 50-column shape
(~815 B/row). Today the per-node row limit (`AI_COPILOT_MAX_QUERY_LIMIT`, default 1000)
hits long before either cap.
