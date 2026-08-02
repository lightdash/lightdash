Manage a production-like Lightdash deployment on **Azure AKS** with the **Azure Container Apps Sandboxes** backend. Args: (none) = status, `up` = idempotently provision + deploy, `deploy` = build this branch → ACR → roll the deployment, `down` = tear everything down to stop spend.

This is the Azure sibling of `/k8s-dev` (AWS EKS). Where `/k8s-dev` exists to host a future Kubernetes sandbox provider, `/aks-dev` exercises the **`azure-sandboxes`** `SandboxProvider` (`packages/backend/src/ee/services/SandboxRuntime/AzureContainerAppsSandboxProvider.ts`): the data-app / AI-writeback agent runs inside an **Azure Container Apps Sandbox** (native suspend/resume) instead of E2B. It mirrors `/docker-dev` / `/k8s-dev` philosophy: an idempotent `up.sh` plus agentic self-repair.

## Architecture

```
az CLI + aca CLI (scripts/aks-dev/)              Helm (~/code/helm-charts/charts/lightdash)
  Resource group · ACR · AKS (OIDC+WI)     →     Lightdash backend (scheduler inline)
  User-assigned managed identity (UAMI)           bundled postgres (pgvector, ephemeral)
  2× sandbox groups + disk images                 bundled browserless-chrome
  (data-app + writeback, native pause)            migration Job (core + EE)
ingress-nginx (Azure LB) + cert-manager   →       in-cluster MinIO (S3, app files only)
sslip.io hostname, real HTTPS                      ServiceAccount → Workload Identity → ADC data plane
```

- **No Terraform** — Azure resources are created imperatively (idempotent `az ... show || create`). Sandbox groups + disk images are driven via the standalone **`aca` CLI** (the Sandboxes ADC data plane, `management.azuredevcompute.io`); `az rest` reaches only ARM. The `containerapp` `az` extension still can't install on the broken Homebrew `az` bottle, but `aca` is a separate binary and unaffected (see gotchas).
- **AKS** with `--enable-oidc-issuer --enable-workload-identity --attach-acr`. The backend pod gets a federated **Workload Identity** token; `DefaultAzureCredential` mints ADC data-plane bearers for the sandbox groups — **no client secret in config**.
- **Object storage is in-cluster MinIO**, not Azure Blob: Lightdash speaks the S3 API strictly (`parseBaseS3Config` enforces `S3_ENDPOINT/BUCKET/REGION`). MinIO backs the app's file storage only — the `azure-sandboxes` backend is `pauseResume:true` (native memory+disk snapshot), so it writes **no** sandbox snapshots to S3.
- **Two sandbox groups** (data-app + writeback), one group + disk image per feature, mirroring the split images on every other backend. Sandboxes expose **native exec/file** data-plane APIs — there is no in-container agent to bake into the image.
- **EE is wired from the start** (license from 1Password) so data-apps / writeback are unlocked.

## Commands

All commands `source scripts/aks-dev/lib.sh`, load `config.env`, verify tools + `az login`.

### `up` — provision + deploy (idempotent)

```bash
./scripts/aks-dev/up.sh
```

Steps (`STEP:`/`OK:`/`SKIP:`/`FAIL:`): providers → RG+ACR → AKS (OIDC+WI+attach-acr) → UAMI + federated credential + AcrPull → sandbox image(s) on ACR → sandbox group(s) + disk image(s) + **SandboxGroup Data Owner** role → MinIO → ingress-nginx + sslip host → cert-manager + issuer → k8s secrets (license/anthropic from 1Password) → render `values.azure.yaml.tpl` + `helm upgrade --install` → health. Ends `READY: https://<host>`.

`up` needs `IMAGE_REF` (the branch image). First time: run `deploy` to build it, or set `IMAGE_REF`/`IMAGE_TAG` in `config.env`.

### `deploy` — build this branch's image → roll

```bash
./scripts/aks-dev/deploy.sh [tag]
```

Builds the repo-root `Dockerfile` on ACR and rolls the deployment. The Dockerfile uses **BuildKit cache mounts**, so it builds via **`az acr run`** with `DOCKER_BUILDKIT=1` (not `az acr build`, which uses the classic builder and fails on `RUN --mount`). Context is a lean tarball (the Dockerfile only COPYs root config + `packages/*` + `docker/`). Required because the Azure provider is unreleased branch code.

### `down` — stop all spend

```bash
./scripts/aks-dev/down.sh
```

Deletes the sandbox groups (releases sandbox billing), then `az group delete` the whole RG (AKS, ACR, LB, public IP, identity).

### Sandbox disk image

```bash
./scripts/aks-dev/build-sandbox-image.sh <data-app|writeback>
```

Builds the feature's base toolchain image (`sandboxes/<feature>/Dockerfile.local`), **amd64 on ACR** (`az acr build` — no BuildKit cache mounts, so the classic builder is fine). Azure nodes are x86, so amd64 (vs Lambda's arm64/Graviton). Unlike the old dynamic-sessions image there is **no `agent.js` layer** — Sandboxes exec/files are native. `up.sh` registers the image as a sandbox-group disk image (`aca sandboxgroup disk create`).

## Self-repair protocol (when `up.sh` fails)

A `FAIL: <step> -- <reason>` names the failing phase. Diagnose (`kubectl get events`, `kubectl describe`, `az rest --method get` on the resource, `az acr task logs`), fix, **patch the failing script** so it can't recur, re-run `up`. Battle-tested cases (all hit on the first real bring-up):

**Azure CLI / extension**
- **`containerapp` extension won't install — `Pip failed... ImportError: ... pyexpat ... Symbol not found: _XML_SetAllocTrackerActivationThreshold`**: the same broken Homebrew `az` bottle issue `/k8s-dev` documents for awscli. Core `az` commands work; only `az extension` (pip) crashes. Sandbox groups + disk images are driven via the standalone **`aca` CLI** (a separate binary, not an `az` extension), so this doesn't block them. Sandbox-group ARM reads still go via `az rest` against `Microsoft.App`.
- Noisy `SyntaxWarning: invalid escape sequence` on every `az` call is the same broken bottle — filtered by `azq`/grep in the scripts; harmless.

**Capacity / SKU / preview access**
- **AKS create `BadRequest: The VM size of <X> is not allowed in your subscription in location`**: the error lists allowed SKUs. `Standard_D4s_v3` works in eastus on this sub. Set `AKS_NODE_SIZE` in `config.env`.
- **Sandboxes region availability (preview)**: Sandboxes is a preview feature and not GA in every region. `ACA_LOCATION` (default `eastus2`) selects the sandbox-group region (separate from AKS `LOCATION`; the ADC data plane is public HTTPS, so cross-region is fine). If group creation fails, check the preview supports the region and that the subscription is enrolled.
- **`aca` needs preview access + Entra ID** — only Entra accounts (no personal MS accounts). The operator running `up` needs **Container Apps SandboxGroup Data Owner** to create/manage sandboxes.

**Sandbox groups + disk images (preview — verified wire format)**
- **Data plane** = `https://management.<region>.azuredevcompute.io/subscriptions/…/sandboxGroups/{group}/sandboxes[/{id}]`, api-version `2026-02-01-preview`, `Authorization: Bearer` (audience `https://management.azuredevcompute.io/.default`). Verbs: create = `PUT` the `/sandboxes` **collection** (server assigns the id); `POST …/executeShellCommand`, `…/stop` (suspend → state **`Stopped`**, resumable), `…/resume`; files = `GET/PUT/DELETE …/files?path=`. Captured via `aca … --verbose`; encoded in `AzureContainerAppsSandboxProvider.ts` / `AzureSandboxExecChannel.ts`.
- **Disk images are addressed by UUID id, not name.** `aca sandboxgroup disk create` assigns a UUID; sandbox create needs `sourcesRef.diskImage.id = <uuid>`. `up.sh` captures the UUID and renders it into `AZURE_SANDBOXES_DATA_APP_DISK_IMAGE`.
- **Disk-image ACR pull needs registry credentials, not managed identity** (MI pull is preview-flagged → `RegistryAuthFailed`). `up.sh` mints an ACR AAD token (`az acr login --expose-token`) and passes `--username 00000000-0000-0000-0000-000000000000 --token <accessToken>`.
- **Role is SandboxGroup Data Owner** (not the dynamic-sessions **Session Executor**) — even a subscription **Owner** gets `403`/`401` on the ADC data plane without it. Granted to the backend UAMI **and** the operator on each group; a fresh group's RBAC takes ~20–60s to propagate before the first disk/sandbox call.

**Image build**
- **`az acr build` fails `the --mount option requires BuildKit`**: the repo Dockerfile uses BuildKit cache mounts. Use `az acr run` with a task that sets `DOCKER_BUILDKIT=1` (deploy.sh does this). `az acr run -f <task>` resolves the task file **inside the uploaded context**, so it must be copied into the context dir (not referenced by an absolute local path).
- **`az acr build`/`run` rejects a `.tar.gz` path** (`Source location should be a local directory path or remote URL`): pass a **directory**, not a tarball — it tars the dir itself.

**Workload Identity**
- The backend SA must be annotated `azure.workload.identity/client-id: <UAMI clientId>` and the pod labelled `azure.workload.identity/use: "true"` (the chart's `serviceAccount.annotations` + `podLabels`). The AKS WI mutating webhook (installed by `--enable-workload-identity`) then injects the projected token + `AZURE_*` env that `DefaultAzureCredential` consumes. The federated credential subject is `system:serviceaccount:lightdash:lightdash`.

**Kubernetes / app** (shared with `/k8s-dev`)
- **502 on `/assets/*`**: Lightdash's large CSP header overflows nginx's 4k proxy buffer — the overlay sets `proxy-buffer-size: 16k`.
- **data-app/writeback 504**: synchronous runs exceed nginx's 60s default — the overlay sets `proxy-read/send-timeout: 600`.
- **migration Job `ParseError: S3-compatible storage is required`**: the job doesn't inherit the main env — `migrationJob.extraEnv` sets the MinIO `S3_*`.

## Configuration

`config.env` (gitignored; copy from `config.example.env`). Key values: `LOCATION` (eastus), `ACA_LOCATION` (eastus2 — Sandboxes region), `ACR_NAME` (globally-unique), `AKS_NODE_SIZE`, the sandbox group names + disk image names + ACR images, `SANDBOX_RESOURCE_TIER` (M) / `SANDBOX_API_VERSION`, `SITE_HOST_MODE` (sslip|custom), 1Password item names for the EE license + Anthropic key. The backend env (`SANDBOX_PROVIDER=azure-sandboxes`, `AZURE_SANDBOXES_*`, Workload Identity client id, MinIO S3) is rendered into `values.azure.yaml.tpl`.

## Secrets discipline

Nothing sensitive is committed. `LIGHTDASH_SECRET`, postgres password, MinIO creds, the EE license, and the Anthropic key live only in k8s Secrets created at runtime. The license comes from the 1Password item **"Development Lightdash EE license key"** — never a customer-named item. The sandbox data plane authenticates with **no static secret** (Workload Identity + managed identity).

## Cost

AKS control plane + 2× `Standard_D4s_v3` + Azure LB + ACR + Sandboxes usage. Sandboxes **scale to zero** when idle (auto-suspend), so there's no warm-instance floor like the old session pools — but the cluster still bills. Not free — **always `down` when done.**
