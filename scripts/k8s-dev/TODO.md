# /k8s-dev — TODO & handoff

Status as of 2026-06-26. The `/k8s-dev` skill is built and a live testbed is **running**, but the
end-to-end feature tests aren't finished and the work is **uncommitted**. This file is the
pick-up list.

## Current live state

- **Cluster:** `lightdash-k8s-dev` · EKS · region **eu-west-2** · account **329599630187**
- **Nodes:** 2× `m6i.large`, **100 GiB** disk (after the disk-size fix)
- **App:** Lightdash **v0.3246.0** (`lightdash/lightdash:latest`), healthy, real Let's Encrypt HTTPS
  at `https://lightdash.16.61.53.63.sslip.io` (sslip.io host — ephemeral, changes if the NLB IP changes)
- **Wired & verified:** EE license valid · `enable-data-apps` + `ai-writeback` flags = true ·
  admin has `create:DataApp` · Anthropic + E2B env set · S3 via IRSA · GitHub App **installation
  reconciled** in the DB (writeback path)
- **E2B confirmed working:** a generation run launched an E2B sandbox, ran Claude Code inside it,
  and read the dbt schema — but that run was **interrupted by the backend rollout** (kicked off
  mid-upgrade). Left a stale `appGeneratePipeline` graphile job (locked, attempts=1/2);
  `sweepStaleAppLocks` should clear it, else just regenerate.

## TO TEST (the actual point of the testbed)

- [ ] **Data-app generation, clean end-to-end.** On the now-stable backend: create an app
      (`+ → App`), confirm it finishes (E2B sandbox → Claude builds → `vite build` → `dist`
      uploaded to S3 → preview loads in the browser). The earlier run only proved the front half.
- [ ] **App preview/serving.** Confirm the generated app's assets serve from S3 and the preview
      renders (check `VITE_ASSET_BASE_URL`/preview-origin behaviour on a real host, not localhost).
- [ ] **AI writeback → PR.** Point a project's dbt connection at a repo in the **`lightdash` GitHub
      org** (the installation covers all its repos), run a writeback, confirm it clones, edits YAML,
      `lightdash compile`s, and **opens a PR**. (OAuth UI stays broken — shared dev App proxy — but
      writeback uses the installation token, which is wired.)
- [ ] **Sandbox-provider experiment (the eventual goal).** Build THIS branch's image
      (`/k8s-dev deploy` → ECR) to get the unreleased `SANDBOX_PROVIDER` code, then experiment with
      a Kubernetes sandbox provider running agent sandboxes as pods instead of E2B
      (see `packages/backend/src/ee/services/SandboxRuntime/DESIGN.md`).

## KNOWN ISSUES / FOLLOW-UPS

- [ ] **Inline scheduler kills in-flight generations on backend restart.** `scheduler.enabled=false`
      runs the worker inside the backend, so any `helm upgrade`/rollout aborts active app/writeback
      jobs. Consider `scheduler.enabled=true` (dedicated worker) for the testbed to isolate jobs.
- [ ] **`aws login` creds are short-lived (~10–15 min)** and expired mid-op several times (cluster
      create, node-group update). All scripts are idempotent (re-run after re-login), but for long
      ops prefer **static IAM keys** (`aws configure`) — set `AWS_PROFILE` in `config.env`.
- [ ] **GitHub OAuth UI** can't work on this host (shared `lightdash-app-dev` App routes through
      `github-proxy-dev.onrender.com`). For a clean UI flow, create a **dedicated GitHub App** with
      the callback pointed at the host (documented in the skill). Writeback already works via reconcile.
- [ ] Pin `IMAGE_TAG` to a specific release instead of `latest` once a known-good version is chosen
      (reproducibility).

## DESTROY THE STACK (stop billing)

It's billing now (EKS control plane + 2 nodes + NLB + NAT). When done testing:

```bash
/k8s-dev down            # helm uninstall + terraform destroy
# or:  ./scripts/k8s-dev/down.sh
```

- [ ] Run `down`. Re-login first if `aws login` creds expired (the destroy is a long op too).
- [ ] **Verify in the AWS console** afterwards: no orphan **ELB/NLB**, **EBS volumes** (the postgres
      PVC), **NAT gateway**, or **Elastic IPs** left behind. `down` deletes PVCs + the ingress LB
      before `terraform destroy` to avoid stranded LBs, but confirm.

## PUSH TO THE REPO

The whole skill is uncommitted on `sandbox-runtime-docker-provider`.

- [ ] Commit on its **own branch** (one-change-per-branch): `.claude/commands/k8s-dev.md` +
      `scripts/k8s-dev/**`. **Do NOT commit `config.env`** (gitignored — local profile/host).
      Also exclude `terraform/.terraform/`, state files, `TODO.md` if you'd rather keep it local.
- [ ] Open a PR. The skill encodes a lot of hard-won fixes this session — call them out in the body:
      AWS-CLI (official installer, not brew), empty `AWS_PROFILE`, `aws login`→Terraform cred bridge,
      VPC limit, tainted-cluster untaint, NLB DNS retry, cert-manager `orderNotReady` auto-reissue,
      ingress `proxy-buffer-size`, `IMAGE_TAG` (0.2248 was too old), node disk via
      `block_device_mappings` (100 GiB), PDB disabled (node-drain deadlock), migration-job `S3_ENDPOINT`.
