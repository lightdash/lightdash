# MicroVM exec agent + image pipeline

Supports the **Lambda MicroVMs** sandbox provider
(`SANDBOX_PROVIDER=lambda-microvm`). See
`packages/backend/src/ee/services/SandboxRuntime/LAMBDA_MICROVM_PLAN.md`.

## `agent.js` — the in-microVM exec agent

Lambda MicroVMs ship no native exec SDK, so the backend's `LambdaExecChannel`
drives this dependency-free Node agent over the microVM's HTTPS proxy endpoint.
The AWS inbound connector terminates the JWE bearer (`X-aws-proxy-auth`) and
forwards to port **8080**, so the agent trusts inbound traffic.

It is baked into each sandbox image by a thin `FROM <ecr-image>` Dockerfile (no
npm install in Lambda's build env) and started as the image entrypoint.

**Contract** (kept in lock-step with `LambdaExecChannel.ts`):

| Route | Behaviour |
|-------|-----------|
| `POST /aws/lambda-microvms/runtime/v1/{ready,run,resume,suspend,terminate,validate}` | `200`. The `/ready` build hook gates image creation; the runtime hooks are acked no-ops so inbound traffic is never withheld. |
| `GET /ready` | `200` (local smoke-test convenience) |
| `POST /exec` `{cmd,cwd?,envs?,timeoutMs?}` | `200` + newline-delimited JSON: `{"stream":"stdout"\|"stderr","data":<base64>}` chunks then a terminal `{"exitCode":<n>}` or `{"timeout":true}`. The child runs in its own process group so a timeout kills the whole tree. |
| `GET /files?path=` | raw bytes (`200`) / `404` |
| `POST /files?path=` | write body, creating parent dirs (`204`) |
| `DELETE /files?path=` | idempotent remove (`204`) |

The hook path prefix `/aws/lambda-microvms/runtime/v1/` is AWS-defined (see the
Lambda MicroVMs docs); the `/exec` and `/files` routes are our own data plane.

## `build-microvm-image.sh` — the image pipeline

Reuses the already-built local Docker sandbox image (the validated Phase-B
pattern: push to ECR, thin `FROM <ecr> + agent` image — don't rebuild the
npm/dbt stack inside Lambda's ~7.2 GB build env).

```bash
# Prereq: the local Docker image (built automatically if missing) + `aws login`.
./build-microvm-image.sh writeback     # -> LAMBDA_MICROVM_AI_WRITEBACK_IMAGE_ARN
./build-microvm-image.sh data-app      # -> LAMBDA_MICROVM_DATA_APP_IMAGE_ARN
```

It is idempotent: ensures an ECR repo, a build IAM role (trusts
`lambda.amazonaws.com`), and an S3 staging bucket exist; pushes the arm64 image
(MicroVMs are Graviton-only); zips the thin Dockerfile + `agent.js`;
`create`/`update-microvm-image` on the **4 GB / 16 GB** tier with the `/ready`
hook ENABLED; polls the build to a terminal state; marks the version `ACTIVE`;
and prints the image ARN to feed the `LAMBDA_MICROVM_*` env.

Region defaults to **eu-west-1** (the EU MicroVMs launch region).
