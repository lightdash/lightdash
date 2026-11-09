Manage a production-like Lightdash deployment on AWS EKS. Args: (none) = show status, `up` = idempotently provision + deploy, `deploy` = build this branch → ECR → roll the deployment, `logs` = tail backend/scheduler, `psql` = shell into the bundled postgres, `down` = tear everything down to stop spend.

This is the **cloud testbed** for experimenting with running agent/data-app sandboxes in AWS instead of E2B (see `packages/backend/src/ee/services/SandboxRuntime/DESIGN.md` — a Kubernetes `SandboxProvider` is the Phase-3 endgame). `/k8s-dev` only stands up the host cluster + a public, HTTPS, EE-enabled Lightdash; the sandbox provider itself is a later, separate backend change.

It mirrors `/docker-dev`'s philosophy: an idempotent deterministic script (`scripts/k8s-dev/up.sh`) plus agentic **self-repair** when a step fails. Re-running `up` reconciles drift.

## Architecture

```
Terraform (scripts/k8s-dev/terraform/)          Helm (~/code/helm-charts/charts/lightdash)
  VPC · EKS + EC2 node group · S3 · IRSA   →     Lightdash backend (scheduler inline)
  ECR · EBS-CSI addon                             bundled postgres (pgvector, ephemeral)
                                                  bundled browserless-chrome
ingress-nginx (NLB) + cert-manager (LE)   →       migration Job (core + EE)
sslip.io hostname, real HTTPS                      ServiceAccount → IRSA → S3
```

- **Terraform** owns cloud infra only (no cluster creds at plan time). **EC2 node group, not Fargate** — deliberately, so the future Kubernetes sandbox provider can run DaemonSets / privileged / gVisor pods.
- The chart is deployed **unmodified** via the `scripts/k8s-dev/values.aws.yaml.tpl` overlay (rendered by `up.sh`). We never fork it.
- Postgres is the chart's **bundled, ephemeral** Bitnami `pgvector` (the "temporary DB" — dies with the cluster). S3 is a real bucket reached via **IRSA** (no static keys).
- **EE is wired from the start** (license from 1Password) so the data-app/agent features are unlocked.

## First-time setup

1. **Tools:** `terraform`, `kubectl`, `helm` are present; `docker buildx` is only needed for `deploy`.
   - **AWS CLI — do NOT use `brew install awscli` on recent macOS.** The Homebrew `python@3.14` bottle has a broken `pyexpat` (`Symbol not found: _XML_SetAllocTrackerActivationThreshold`, resolves system `libexpat`); `aws --version` works but every real command errors. Use the **official self-contained installer** instead:
     ```bash
     curl -fsSL https://awscli.amazonaws.com/AWSCLIV2.pkg -o /tmp/AWSCLIV2.pkg
     sudo installer -pkg /tmp/AWSCLIV2.pkg -target /     # installs /usr/local/bin/aws
     # if a broken brew awscli is on PATH first, `brew uninstall awscli` so it doesn't shadow it
     ```
2. **Config:** `cp scripts/k8s-dev/config.example.env scripts/k8s-dev/config.env` and edit (`AWS_REGION`, `IMAGE_TAG`, `LETSENCRYPT_EMAIL`). `config.env` is gitignored. **Leave `AWS_PROFILE` unset (commented) when using `aws login` / the default chain** — `lib.sh` unsets an empty value, but never export it as `""`.
3. **AWS auth — two paths:**
   - `aws login` (new CLI v2 — temp creds from your Console browser session): simplest, no SSO start URL needed. **But the token is short-lived** (see token-expiry below). `lib.sh::export_aws_creds` bridges these into `AWS_*` env vars because the Terraform SDK does **not** read the `~/.aws/login` cache (without it Terraform falls back to EC2 IMDS → "No valid credential sources").
   - SSO profile (`aws configure sso` once, then `aws sso login --profile <p>`) or **static IAM access keys** (`aws configure`). Static keys don't expire — **prefer them for the full ~15-min apply** so it can't expire mid-cluster-create.
   - The scripts run `aws sts get-caller-identity` first and `FAIL: aws-auth` with guidance if you need to re-auth.

## Commands

All commands `source scripts/k8s-dev/lib.sh`, load `config.env`, and verify tools + AWS identity before doing anything.

### `up` — provision + deploy (idempotent)

```bash
./scripts/k8s-dev/up.sh
```

Steps (each prints `STEP:`/`OK:`/`SKIP:`, fails with `FAIL: <step> -- <reason>`):
1. `terraform init` + `apply` — VPC, EKS, node group, S3, IRSA roles, ECR, EBS-CSI addon.
2. `aws eks update-kubeconfig`; ensure namespace.
3. Apply the **gp3** default StorageClass (so the postgres PVC binds).
4. `helm upgrade --install ingress-nginx` (NLB, cross-zone on); wait for the NLB hostname.
5. Resolve the public host: **sslip mode** → `lightdash.<nlb-ip>.sslip.io` (with a DNS retry loop);
   **custom mode** → your `SITE_HOST` (it prints the CNAME → NLB you must add).
6. `helm upgrade --install cert-manager` + the `letsencrypt` ClusterIssuer (HTTP-01).
7. Create k8s secrets **idempotently**: `lightdash-pg` (random pw) and `lightdash-app`
   (random `LIGHTDASH_SECRET` + EE license + Anthropic + E2B + GitHub App, pulled from 1Password).
8. Render the values overlay (envsubst with TF outputs) and `helm upgrade --install lightdash`.
9. Wait for the TLS cert (auto-reissue on the cert-manager `orderNotReady` race), poll
   `/api/v1/health`; print `READY: https://<host>`.

Ends by reminding you the cluster is **billing** — run `down` when finished.

### `deploy` — code "reload" (production-style)

The answer to "how does code reloading work": there is **no hot reload** — build an immutable image and roll the deployment onto it.

```bash
./scripts/k8s-dev/deploy.sh
```

ECR login → `docker buildx build --platform linux/amd64` of the repo root `Dockerfile` → push tagged with the short git SHA → `helm upgrade --reuse-values --set image.*` → `kubectl rollout status`. Needed to run **this branch's** unreleased code (e.g. the sandbox-runtime work).

### `logs`, `psql`, status

```bash
kubectl -n lightdash logs -l app.kubernetes.io/component=backend -f --tail=100   # logs
kubectl -n lightdash exec -it statefulset/lightdash-postgresql -- psql -U lightdash   # psql
./scripts/k8s-dev/status.sh        # or just /k8s-dev with no args
```

### `down` — stop all spend

```bash
./scripts/k8s-dev/down.sh
```

`helm uninstall` lightdash + ingress-nginx (releases the NLB), delete PVCs (releases EBS), then `terraform destroy`. Verify no orphan ELB/EBS in the console afterward.

## Self-repair protocol (when `up.sh` fails)

Same contract as `dev-fast-start.sh`: a `FAIL: <step> -- <reason>` line names the failing phase.
1. Diagnose the root cause (read the relevant logs — `kubectl get events`, `kubectl describe`, `terraform plan`, cert-manager `kubectl describe certificate -n lightdash`).
2. Fix it, then **patch the failing script** so the same failure can't recur. Keep the `STEP:/OK:/SKIP:/FAIL:` contract and idempotency.
3. Re-run `up.sh` — it reconciles and should reach `READY:`.

Common cases (battle-tested — these all happened on real bring-ups):

**AWS auth / credentials**
- **`FAIL: aws-auth` but `aws sts get-caller-identity` works in your shell**: usually an exported empty `AWS_PROFILE` ("config profile () could not be found"). `lib.sh` now unsets it when blank; make sure `config.env` doesn't `export AWS_PROFILE=""`.
- **Terraform: `No valid credential sources found` / falls back to IMDS `169.254.169.254`**: the AWS SDK can't see `aws login` creds. Handled by `lib.sh::export_aws_creds` (`aws configure export-credentials --format env`). If it recurs, run `aws login` then re-run `up`.
- **Terraform: `ExpiredTokenException: The security token ... is expired` mid-apply**: `aws login` creds are short-lived and EKS create/node-group updates take ~10-15 min. Run `aws login` again, then re-run `up.sh` (idempotent — it continues). To avoid entirely, use **static IAM keys** (`aws configure`) for the apply.

**Terraform state drift (from a mid-apply failure)**
- **`ResourceInUseException: Cluster already exists` on re-run**: the `CreateCluster` API succeeded but the post-create *wait* failed (e.g. token expiry), so Terraform **tainted** the cluster and now wants to destroy+recreate it. The cluster is actually fine. Fix: `terraform -chdir=scripts/k8s-dev/terraform untaint 'module.eks.aws_eks_cluster.this[0]'` then re-run `up`. (Do **not** `import` — it's already in state.)
- General rule: after a partial apply, prefer `untaint` (resource exists and is healthy) over `import` (resource missing from state) over destroy+recreate (slowest).

**AWS account limits**
- **`VpcLimitExceeded: The maximum number of VPCs has been reached`**: the region is at its 5-VPC default quota. Pick a region with headroom (`aws ec2 describe-vpcs --region <r> --query 'length(Vpcs)'`) and set `AWS_REGION` in `config.env`, request a quota bump, or reuse an existing VPC. If you switch region after a partial apply, run `down` first so resources like the S3 bucket aren't stranded in the old region.

**Nodes / scheduling**
- **Node disk only ~20 GiB / `ephemeral-storage` evictions / migration pod OOM-137**: EKS managed node groups using a launch template **ignore `disk_size`** (AL2023 defaults to 20 GiB), and two Lightdash images (~2.4 GiB each) fill it. Fixed: `eks.tf` sets the root volume via **`block_device_mappings`** (default 100 GiB). Changing it does a rolling node replacement.
- **Node-group rolling update stuck `UPDATING`, old node won't drain**: a PodDisruptionBudget with `minAvailable:1` on a single-replica workload = `ALLOWED DISRUPTIONS: 0`, so the pod can't be evicted. The overlay sets `podDisruptionBudget.enabled: false`. Unblock a live one by deleting the pod (`kubectl delete pod` bypasses the PDB) + the PDB.

**Kubernetes / app**
- **`dns -- could not resolve <nlb>`**: the NLB isn't live yet. `up.sh` retries ~6 min; if it still fails, re-run `up`.
- **TLS still pending**: cert-manager HTTP-01 takes a few minutes on first issue. The site is reachable over HTTP meanwhile.
- **TLS cert `errored` with `Failed to finalize Order: orderNotReady` (challenge `valid`)**: a known cert-manager finalize race. `up.sh` auto-heals it (deletes the Certificate to force a clean re-issue). Manual: `kubectl -n lightdash delete certificate lightdash-tls certificaterequest --all order --all`.
- **postgres PVC Pending**: the gp3 StorageClass / EBS-CSI addon isn't ready — check `kubectl get sc` and the `aws-ebs-csi-driver` addon.
- **migration Job CrashLoop / `knex migrate` exits 1 with `ParseError: S3-compatible storage is required`**: recent versions ENFORCE `S3_ENDPOINT` (`parseBaseS3Config`), and the migration job doesn't inherit the main `extraEnv`. The overlay sets `S3_ENDPOINT`/`BUCKET`/`REGION` in `migrationJob.extraEnv`. A migration `Completed` pod alongside failed retries is fine (`job.status.succeeded=1` is authoritative).
- **502 on `/assets/*` (`/api/v1/health` is 200, pods healthy)**: ingress-nginx `upstream sent too big header` — Lightdash's CSP header exceeds nginx's default 4k proxy buffer. The overlay sets `nginx.ingress.kubernetes.io/proxy-buffer-size: 16k`.
- **"Create data app" missing / `GET /api/v2/feature-flag/enable-data-apps` → 404 "not found"**: the deployed **image is too old**. The chart's appVersion (`0.2248.0`) predates data-apps and the `LIGHTDASH_ENABLE_FEATURE_FLAGS` env mechanism (older `FeatureFlagModel` *throws* NotFound instead of honoring the env allowlist), so the flag never resolves and the ability builder grants no `DataApp` rules even to an admin. Fix: deploy a **recent** image — `IMAGE_TAG=latest` (or a release ≥ the one that added `enable-data-apps`), or `/k8s-dev deploy` to run this branch. Verify: `curl -H "Authorization: ApiKey <pat>" https://<host>/api/v2/feature-flag/enable-data-apps` returns `enabled:true`. (Diagnostic tip: PATs are bcrypt-hashed with a *deterministic* salt from `LIGHTDASH_SECRET`, so you can mint a test PAT directly in the DB.)
- **data-app generation interrupted by a backend restart**: `scheduler.enabled=false` runs the worker inline in the backend, so a `helm upgrade`/rollout aborts in-flight app/writeback jobs. Consider `scheduler.enabled=true` (dedicated worker) for the testbed.
- **data-app generation fails (E2B template not found)**: the `E2B_API_KEY` must belong to the E2B team owning `lightdash/lightdash-data-app`; `E2B_TEMPLATE_TAG=latest` avoids a missing per-version template.

## Secrets discipline (matches `/docker-dev`)

Nothing sensitive is committed. `LIGHTDASH_SECRET`, the postgres password, the EE license, Anthropic/E2B keys, and the GitHub App creds live only in k8s Secrets created at runtime. The EE license comes from the 1Password item **"Development Lightdash EE license key"** — **never** a customer-named item (confidentiality policy). S3 needs no keys at all (IRSA).

## GitHub integration (dbt-over-GitHub + AI writeback)

Required for connecting a dbt project from GitHub and for AI writeback (opening PRs). **Not**
needed for data-app generation (that only needs the license + Anthropic + E2B).

### ⚠️ Do NOT use the shared `lightdash-app-dev` App on a real host

The shared dev App's OAuth callback is hardwired to a **proxy** (`github-proxy-dev.onrender.com`)
that demultiplexes to *proxy-known* dev instances by parsing the `state` (`<redirectDomain>_<id>`).
An arbitrary EKS host (sslip.io or your own domain) is unknown to that proxy, so after you
install + authorize you land on the proxy with **"bad request missing parameter"** — the failure
is the *proxy*, not your instance. You cannot fix this from the Lightdash side.

### Use a dedicated GitHub App (the correct path for a hosted instance)

1. GitHub → Settings → Developer settings → **New GitHub App**.
2. **Callback URL:** `https://<SITE_HOST>/api/v1/github/oauth/callback` and check **"Request
   user authorization (OAuth) during installation"**.
3. Webhook: uncheck **Active** (not needed for testing).
4. Permissions: Repository → **Contents** (R/W), **Pull requests** (R/W), **Metadata** (R).
5. Create → generate a **private key** (.pem) → note **App ID**, **Client ID**, generate a
   **Client secret** → **Install** it on the target repo(s).
6. Put the creds in the `lightdash-app` secret (`GITHUB_APP_ID`, `GITHUB_APP_NAME`,
   `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_PRIVATE_KEY` = `base64 -i key.pem`) and
   `helm upgrade`. Point `GITHUB_OP_ITEM` at a 1Password item holding this App's `export GITHUB_*`
   block so `up.sh` picks it up next time.

Overlay env (set regardless of App): `GITHUB_REDIRECT_DOMAIN` = the **full** `SITE_HOST`
(Lightdash's `siteUrl.split('.')[0]` derivation collapses a multi-label sslip.io host to just
`lightdash`), and `GITHUB_OAUTH_REDIRECT_URI` = `https://<SITE_HOST>/api/v1/github/oauth/callback`.

### Quick alternative — DB-reconcile (test writeback without the OAuth UI)

`/docker-dev` never uses the browser flow; it writes the installation straight into
`github_app_installations` (AES-256-GCM `salt[64]|tag[16]|iv[12]|msg`, pbkdf2 sha512/2000/32,
keyed by the running `LIGHTDASH_SECRET`). This skill ships a k8s-adapted version — once the App
is installed (grab `installation_id` from the failed callback URL `?installation_id=...`):

```bash
./scripts/k8s-dev/reconcile-github.sh <installation_id>
```

It reads `LIGHTDASH_SECRET` + pg password from the cluster secrets, port-forwards postgres,
encrypts the id, and UPSERTs the row using the **real first user** (not the seeded demo). Verify
the App + installation are live by minting a token: App JWT (RS256, `iss=GITHUB_APP_ID`, key =
`Buffer.from(GITHUB_PRIVATE_KEY,'base64')`) → `POST /app/installations/<id>/access_tokens` → `201`.
Note the secret stores `GITHUB_PRIVATE_KEY` as base64-of-PEM, so it's double-base64 under
`kubectl get secret` (decode the storage layer, then `Buffer.from(...,'base64')` for the PEM).

## Public access / TLS (no DNS access needed)

Default **sslip mode** gives real Let's Encrypt HTTPS on `lightdash.<nlb-ip>.sslip.io` with zero DNS access. Because the dev domain's Route53 zone may live in another account, the optional **custom mode** (`SITE_HOST_MODE=custom`) uses HTTP-01, which only needs the hostname to resolve to the NLB — add one CNAME → NLB hostname in whichever account hosts the zone; no cross-account Route53 automation. Caveat: an NLB IP can change; if sslip breaks, re-run `up`. For sustained GitHub/writeback testing, prefer the custom-domain path (stable hostname).

## Cost

EKS control plane (~$0.10/hr) + 2× `m6i.large` (100 GiB) + NLB + single NAT. Not free — **always `down` when done**. `status` and `up`'s final line remind you the cluster is up.

## Phase B: sandbox experiments (later)

Once Lightdash is up and EE features work, the Kubernetes `SandboxProvider` (running agent sandboxes as pods/Jobs in *this* cluster instead of E2B) is tracked in `SandboxRuntime/DESIGN.md` and is a separate backend change — build this branch's image via `/k8s-dev deploy`. This skill exists to give it a place to run.

## GKE (future)

Structured so a sibling `gke-dev` is a drop-in later: the Helm overlay and TLS/issuer flow are portable; only `terraform/` and the IRSA→Workload-Identity annotation change.
