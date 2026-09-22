# Sandbox Development

Each production sandbox under this directory is a standalone image consumed by
one or more `SandboxProvider` implementations. Keep the image, backend runtime
configuration, local development path, and release publishing workflow aligned.

## Required template files

An E2B template should contain:

- `e2b.Dockerfile` as the production image definition.
- `build-sandbox.ts` using the E2B SDK to build the Dockerfile, apply the
  configured primary and extra tags, stream build logs, and exit nonzero on
  failure.
- `assign-tag.ts` to apply a release tag to an existing build without rebuilding.
- A private standalone `package.json`, `pnpm-lock.yaml`, and
  `pnpm-workspace.yaml`. Sandboxes are not part of the root pnpm workspace.
- A `build-local-image.sh` when the feature supports
  `SANDBOX_PROVIDER=docker`. Derive any local-only Dockerfile changes from
  `e2b.Dockerfile`; do not maintain two independent image definitions.
- A `.gitignore` covering `.env`, `node_modules`, generated Dockerfiles, packed
  tarballs, and other build output.

Complex templates should also have a README describing their inputs, outputs,
runtime restrictions, local workflow, template name, and environment variables.

## Image rules

- Install only the tools the agent is allowed to use. Keep restricted-agent
  images deliberately minimal.
- Route package installation through `sfw`, except for installing `sfw` itself.
  Pin tool versions when reproducibility matters.
- Never bake credentials or local `.env` files into an image.
- Make the runtime workdir, user, home directory, installed skills, and writable
  paths match the constants and paths used by the backend service.
- E2B supplies its runtime user. If plain Docker needs extra user setup, add it
  in the generated `Dockerfile.local`.
- Preinstall runtime dependencies. Agents should not install packages unless the
  feature explicitly permits it.

## Names and runtime configuration

- Give each template a stable production name and environment-variable family
  for its name, primary tag, extra tags, and source tag.
- Keep the defaults in `build-sandbox.ts`, `assign-tag.ts`, and
  `packages/backend/src/config/parseConfig.ts` identical.
- Backend template tags should default to the running Lightdash `VERSION`, so a
  release always launches its matching sandbox image.
- Add local Docker image configuration and bootstrap wiring when Docker is a
  supported provider. Add provider-specific image configuration only for
  providers the owning service supports.

## Release publishing

Every E2B template must be included in the template matrix in
`.github/workflows/post-release.yml`, which calls the reusable
`publish-e2b-template.yml` workflow. Do not copy its build and retag steps into
the release workflow.

- Publish in both US and EU E2B regions.
- Build `<template>:<release-version>` and update `:latest` when the template or
  one of its baked dependencies changed since the previous release.
- Otherwise, retag the existing `:latest` build with the release version.
- Watch every repository path baked into the image, including shared packages,
  SDKs, or skills; do not limit change detection to the sandbox directory when
  external sources affect the image.
- Add or rename the workflow entry in the same change as the template.

## Local workflow

From the sandbox directory:

```bash
sfw pnpm install --frozen-lockfile
E2B_API_KEY=... pnpm run build
```

Use the template-specific name, tag, and extra-tag variables for a release-style
build. Pass `--no-cache` when verifying Dockerfile changes that must bypass the
E2B cache.

For Docker-backed local development:

```bash
./build-local-image.sh
```

Keep its default tag aligned with `parseConfig.ts` and the local bootstrap
script.

## Validation

- Run the standalone frozen install and verify the TypeScript scripts start
  without module or configuration errors.
- Parse the changed workflow YAML and confirm every `build-sandbox.ts` template
  has release-workflow coverage.
- Build the local image when Docker support or the Dockerfile changes.
- Run a real E2B build only when external publishing and build costs are
  intended; verify both the versioned tag and `latest`.
- Smoke-test sandbox creation through each provider supported by the owning
  backend service.
