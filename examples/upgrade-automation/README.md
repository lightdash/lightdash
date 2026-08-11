# Self-hosted Lightdash upgrade automation

This example keeps a self-hosted Lightdash deployment on the newest release that the public release-safety gate can reach. It is intentionally generic, has no telemetry, and stores its evidence only in the consumer repository.

The loop is:

1. Stop silently when an open issue carries the freeze label.
2. Read the current image tag and the public release-safety index.
3. Run `lightdash upgrade-check` against candidate public versions and select the newest green-reachable target. A required stop becomes the next target. A genuinely red next hop opens a held pull request; unknown or incomplete safety data fails closed and retries on a later run.
4. Optionally require the mapped image tag to exist in an OCI registry.
5. Open a pin pull request containing the complete nine-key verdict JSON.
6. Enable auto-merge when configured and green, or send an `[upgrade-hold]` Slack message for a red hop.
7. After the consumer's deployment workflow finishes, poll `/api/v1/readyz` every 20 seconds and compare the `Lightdash-Version` response header from `/` with the pinned public version. Three consecutive ready and version-matched polls are required.
8. On failure, open a freeze issue and send an `[upgrade-verify-failed]` Slack message. The automation never rolls back.
9. Comment the verdict, verification result, timings, readiness reason, and deployment-run link on the pin pull request.

## Copy the workflow

Copy [`template-workflow.yml`](./template-workflow.yml) to `.github/workflows/lightdash-upgrade.yml` in the repository that owns the deployment pin. Change the `Deploy Lightdash` workflow name under `workflow_run` to the exact `name:` of the workflow that deploys the default branch.

The template polls hourly, can be run manually, and accepts a `repository_dispatch` event of type `lightdash-release`. These are detection mechanisms only: each new release is considered as soon as a trigger observes it, with no upgrade window or veto delay.

The plan and verify jobs call reusable composite actions from this repository. Replace both `REPLACE_WITH_LIGHTDASH_COMMIT_SHA` placeholders with the same reviewed full commit SHA that contains this directory. Keeping the action immutable is important because both jobs receive repository-write credentials and the optional Slack secret.

## Inputs

| Input | Template setting | Meaning |
| --- | --- | --- |
| `instance_url` | `LIGHTDASH_INSTANCE_URL` | Public base URL of the deployment to verify. |
| `bump_target` | `LIGHTDASH_BUMP_TARGET` | Relative YAML or JSON file plus a dot-separated scalar path, written as `file#path.to.version`. YAML must use block mappings and keep the scalar on the same line as its key. |
| `tag_suffix` | `LIGHTDASH_TAG_SUFFIX` | Optional suffix appended to a public version when writing the image tag. The suffix is removed before comparisons and calls to `upgrade-check`. |
| `registry_check` | `LIGHTDASH_REGISTRY_CHECK` | Optional OCI image repository, without a tag. The action runs `docker manifest inspect repository:version+suffix`; authenticate to a private registry earlier in the job. An unavailable tag exits without opening or updating a pull request and is retried by the next trigger. |
| `verify_window` | `LIGHTDASH_VERIFY_WINDOW` | Post-deploy verification budget. Accepts seconds or an `s`, `m`, or `h` suffix and defaults to `20m`. |
| `auto_merge` | `LIGHTDASH_AUTO_MERGE` | Set to `'true'` for zero-touch squash auto-merge after a green gate. The repository must allow auto-merge. |
| `escalation` | `LIGHTDASH_UPGRADE_SLACK_WEBHOOK` secret | Optional Slack incoming-webhook URL. The webhook configuration selects the destination channel. Empty disables Slack while retaining issues and pull-request comments. |
| `freeze_label` | `LIGHTDASH_FREEZE_LABEL` | Label on any open issue that disarms planning. Verification failures create this label and an issue automatically. |

The composite actions also take `github_token`. The verify action receives `deploy_run_url`, `deploy_conclusion`, and `deployed_sha` from `workflow_run`; customers normally leave those template expressions unchanged.

## Event choreography

The schedule, manual dispatch, and release dispatch run the planning half. A freeze-only job is deliberately first and checkout is skipped when frozen. The plan action repeats the check so direct composite-action consumers retain the same fail-closed behavior.

The deployment workflow runs when the pin pull request merges into the default branch. Its completed `workflow_run` event starts verification and supplies the actual deploy-run URL and deployed SHA. Verification exits silently when that commit did not change the configured bump file, so unrelated deployments are ignored. A failed deployment workflow is itself a verification failure and creates the freeze issue without waiting for readiness polling.

`/api/v1/readyz` certifies the schema gate and clean migration run ledger without the per-request database work performed by `/api/v1/health`. The probe does not expose a version, so the action separately reads the public `Lightdash-Version` header from the instance root. A missing or ingress-stripped header fails closed. Old pods can return 404 for `readyz`; polling continues until the new pods answer or the verification budget expires.

The current CLI includes a required stop equal to the target in `requiredStops`, making that hop exit non-zero even when its underlying verdict is true. The plan action accepts only that narrow stop-target case: the verdict must be true, coverage complete, the minimum previous version satisfied, and the target must be the sole required stop. False and unknown verdicts are never treated as green.

## Tokens and permissions

The workflow requests:

- `contents: write` to push the version branch;
- `pull-requests: write` to open, comment on, and enable auto-merge for the pin pull request;
- `issues: write` to inspect freeze issues and create a freeze label and issue on failure;
- `actions: read` to consume deployment workflow metadata.

The repository `GITHUB_TOKEN` is enough to open a pull request and leave durable comments when repository policy allows write tokens. GitHub suppresses most new workflow runs caused by events created with a workflow's own `GITHUB_TOKEN`. In particular, merging the pin with that token may not trigger the consumer's push-based deployment workflow, so zero-touch auto-merge should use a fine-grained PAT or GitHub App token stored as `UPGRADE_AUTOMATION_TOKEN`. Grant it repository Contents, Pull requests, and Issues read/write permissions plus Actions read access. Repository rules and required checks still apply.

`workflow_dispatch` and `repository_dispatch` are exceptions to GitHub's recursion suppression and always create workflow runs. A release-event integration can call:

```bash
gh api --method POST repos/OWNER/REPOSITORY/dispatches \
  -f event_type=lightdash-release
```

## Freeze and recovery

To disarm upgrades manually, open an issue with the configured freeze label. The first planning job detects it before checkout and exits without a pull request, Slack message, or other side effect.

Verification failure creates the same kind of issue automatically. Investigate the linked deployment run and the recorded readiness reason, restore the deployment forward, and confirm that `readyz` is 200 with three stable version matches. Close every open freeze-labelled issue to re-arm planning; the next scheduled or manual run resumes from the version currently pinned in the default branch.

No step sends telemetry or calls back to Lightdash. Network calls are limited to GitHub, the public Lightdash release-safety index and npm package registry, the configured deployment and registry, and the optional Slack webhook. The planner installs its reviewed CLI version into an isolated runner-temporary prefix so a different CLI version in the consumer repository cannot shadow `upgrade-check`.
