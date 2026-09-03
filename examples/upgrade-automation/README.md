# Self-hosted Lightdash upgrade automation

This example keeps a self-hosted Lightdash deployment on the newest release that the public release-safety gate can reach. It is intentionally generic, has no telemetry, and stores its evidence only in the consumer repository.

> [!NOTE]
> This example is in [Beta](https://docs.lightdash.com/references/workspace/feature-maturity-levels), together with the release-safety artifact that it reads. The workflow runs today and we use this approach on our own instance, but the artifact fields, the verdict shape and the action inputs can still change.
>
> Pin the composite actions to a reviewed commit SHA, which the steps below require anyway, and read this page again when you move that pin. Feedback shapes where this goes next: tell us in a [GitHub issue](https://github.com/lightdash/lightdash/issues) if the loop does not fit your deployment.

The loop is:

1. Stop silently when an open issue carries the freeze label.
2. Read the current image tag and the public release-safety index.
3. Run `lightdash upgrade-check` against candidate public versions and select the newest green-reachable target. A required stop becomes the next target. Any next hop that is not green opens a held pull request: a genuinely red hop, and equally one whose safety data is unknown or incomplete. Both hold; neither merges. The held pull request states which of the two it is.
4. Optionally require the mapped image tag to exist in an OCI registry.
5. Open or reuse one pin pull request for the configured branch prefix, containing the complete nine-key verdict JSON. A held pull request is titled `HOLD: chore: upgrade Lightdash to VERSION`, carries the configured hold label, and explains itself under a `Why this is held` heading. Pull requests for versions already pinned on the default branch close automatically. When a replacement target opens or is reused, older pull requests with the same prefix close automatically. A newer open target remains authoritative if an older planning run finishes later. Pull requests with another prefix are untouched.
6. Enable auto-merge when configured and green, or send an `[upgrade-hold]` Slack message for a hop that is red or unknown. The escalation repeats while the pull request stays held, at most once per `hold_reminder_interval`.
7. After the consumer's deployment workflow finishes, poll `/api/v1/readyz` every 20 seconds and compare the `Lightdash-Version` response header from `/` with the pinned public version. Three consecutive ready and version-matched polls are required.
8. On failure, open a freeze issue and send an `[upgrade-verify-failed]` Slack message. The automation never rolls back.
9. Comment the verdict, verification result, timings, readiness reason, and deployment-run link on the pin pull request.

## Copy the workflow

Copy [`template-workflow.yml`](./template-workflow.yml) to `.github/workflows/lightdash-upgrade.yml` in the repository that owns the deployment pin. Change the `Deploy Lightdash` workflow name under `workflow_run` to the exact `name:` of the workflow that deploys the default branch. Copy [`template-freeze-workflow.yml`](./template-freeze-workflow.yml) to `.github/workflows/lightdash-upgrade-freeze.yml` to provide the recommended dispatch-based pause and resume path.

The template polls hourly, can be run manually, and accepts a `repository_dispatch` event of type `lightdash-release`. These are detection mechanisms only: each new release is considered as soon as a trigger observes it, with no upgrade window or veto delay. The template also listens for freeze-label changes and issue close/reopen events so it can announce freeze transitions.

The plan, verify, and freeze-announcement jobs call reusable composite actions from this repository. Replace all three `REPLACE_WITH_LIGHTDASH_COMMIT_SHA` placeholders with the same reviewed full commit SHA that contains this directory. Replace the placeholder in the freeze workflow with that same pinned SHA before using it. Keeping these references immutable is important because the workflows receive repository-write credentials and the optional Slack secret.

The plan action creates the pin commit through the GitHub API, so GitHub verifies the commit and it satisfies rulesets that require signed commits. Because the action does not use Git to push, its consumer checkout should set `persist-credentials: false`.

## Inputs

| Input | Template setting | Meaning |
| --- | --- | --- |
| `instance_url` | `LIGHTDASH_INSTANCE_URL` | Public base URL of the deployment to verify. |
| `bump_target` | `LIGHTDASH_BUMP_TARGET` | Relative YAML or JSON file plus a dot-separated scalar path, written as `file#path.to.version`. YAML must use block mappings, keep the scalar on the same line as its key, and not duplicate the target path. Its scalar must be unquoted, single-quoted, or JSON-compatible double-quoted. |
| `tag_suffix` | `LIGHTDASH_TAG_SUFFIX` | Optional suffix appended to a public version when writing the image tag. The suffix is removed before comparisons and calls to `upgrade-check`. |
| `registry_check` | `LIGHTDASH_REGISTRY_CHECK` | Optional OCI image repository, without a tag. The action runs `docker manifest inspect repository:version+suffix`; authenticate to a private registry earlier in the job. An unavailable tag exits without opening or updating a pull request and is retried by the next trigger. |
| `verify_window` | `LIGHTDASH_VERIFY_WINDOW` | Post-deploy verification budget. Accepts seconds or an `s`, `m`, or `h` suffix and defaults to `20m`. |
| `auto_merge` | `LIGHTDASH_AUTO_MERGE` | Set to `'true'` for zero-touch squash auto-merge after a green gate. The repository must allow auto-merge. |
| `escalation` | `LIGHTDASH_UPGRADE_SLACK_WEBHOOK` secret | Optional Slack incoming-webhook URL. The webhook configuration selects the destination channel. Empty disables Slack while retaining issues and pull-request comments. |
| `freeze_label` | `LIGHTDASH_FREEZE_LABEL` | Label on any open issue that disarms planning. Verification failures create this label and an issue automatically. |
| `hold_label` | `LIGHTDASH_HOLD_LABEL` | Label applied to a held upgrade pull request and removed once that pull request goes green. Defaults to `upgrade-hold`. Empty disables label management. |
| `hold_reminder_interval` | `LIGHTDASH_HOLD_REMINDER_INTERVAL` | Minimum time between repeated `[upgrade-hold]` Slack messages for one held pull request. Accepts seconds or an `s`, `m`, or `h` suffix and defaults to `24h`. `0` disables reminders. |
| `anthropic_api_key` | `ANTHROPIC_API_KEY` secret | Optional Anthropic API key. When set, a held pull request gains one Claude-written paragraph above the release facts. Empty, and the section is facts only. |

The composite actions also take `github_token`. The verify action receives `deploy_run_url`, `deploy_conclusion`, and `deployed_sha` from `workflow_run`; customers normally leave those template expressions unchanged. The freeze announcer receives issue-event metadata from the workflow and sends its optional Slack notification through the same `escalation` webhook.

## Plan outputs

| Output | Meaning |
| --- | --- |
| `branch` | Name of the upgrade branch created or updated by the plan action. |
| `pr_number` | Number of the upgrade pull request created or updated by the plan action. |
| `pr_url` | URL of the upgrade pull request created or updated by the plan action. |

All three outputs are empty when planning exits early because upgrades are frozen, no newer version is available, or the mapped image is unavailable in the configured registry.

## A held pull request

A hop that is red or unknown opens a pull request that must not merge, so it is made to look different from a green one:

- the title is prefixed with `HOLD: `, and the prefix disappears by itself on the first planning run that finds a green target for the same branch;
- the configured hold label is added, and removed again when the pull request goes green. Every label call is best effort: a token without label write access logs the underlying error and planning continues;
- the body carries a `Why this is held` section, built from the per-release `release-safety.json` of each release between the current pin and the target whose `rollingUpdateSafe` is `false` or `unknown`. It names the recommended deploy strategy, the migrations and the tables they touch, the reason text of each declared break, and the count of breaking API changes. A release with unknown safety data is reported as incomplete data, not as a known break. The section covers the first five affected releases and says how many more there are. A release whose detail file cannot be read is reported as such and never blocks the pull request from opening;
- with `anthropic_api_key` set, one Claude-written paragraph sits above those facts, under an attribution line that says which part a model wrote and which part comes from the release. The key is used at that one moment and nowhere else: never on a green pull request, and never on a planning run that does not rewrite the body, so a hold costs about one call rather than one every five minutes. No key, a failed or refused call, or an empty answer all drop the paragraph and keep the facts, without failing the run. The example is complete without a key;
- the `[upgrade-hold]` Slack message repeats. The planner keeps no state of its own, so each escalation leaves a marked comment on the pull request and the next one waits until that comment is older than `hold_reminder_interval`. The message says how long the hold has been open.

## Event choreography

The schedule, manual dispatch, and release dispatch run the planning half. A freeze-only job is deliberately first and checkout is skipped when frozen. The plan action repeats the check so direct composite-action consumers retain the same fail-closed behavior. Issue events run only the freeze announcer: planning, freeze checking, and verification do not run for them.

The deployment workflow runs when the pin pull request merges into the default branch. Its completed `workflow_run` event starts verification and supplies the actual deploy-run URL and deployed SHA. Verification identifies the matching merged pin pull request in the deployed commit history, so batched pushes are covered; a pin pull request with an existing verification summary and unrelated deployments exit silently. A failed deployment workflow is itself a verification failure and creates the freeze issue without waiting for readiness polling.

Verification has three outcomes: a matching merged upgrade pull request runs the full readiness and version check, no matching pull request logs a successful no-op, and any pull-request lookup failure fails the job without skipping verification.

`/api/v1/readyz` certifies the schema gate and reports migration run ledger warnings without the per-request database work performed by `/api/v1/health`. A parked migration or an unavailable ledger is advisory and does not make the probe fail. Verification treats a parked migration as a failure even though `readyz` returns 200. The probe does not expose a version, so the action separately reads the public `Lightdash-Version` header from the instance root. A missing or ingress-stripped header fails closed. Old pods can return 404 for `readyz`; polling continues until the new pods answer or the verification budget expires.

The current CLI includes a required stop equal to the target in `requiredStops`, making that hop exit non-zero even when its underlying verdict is true. The plan action accepts only that narrow stop-target case: the verdict must be true, coverage complete, the minimum previous version satisfied, and the target must be the sole required stop. False and unknown verdicts are never treated as green.

## Tokens and permissions

The workflow grants each job only the permissions it uses:

- the planner gets `contents: write`, `pull-requests: write`, and `issues: read` to create the version branch and pull request after checking the freeze state;
- the verifier gets `contents: read`, `pull-requests: write`, and `issues: write` to inspect the deployed commit, record the result, and create a freeze issue on failure;
- the freeze check and announcer get `issues: read` only.

The repository `GITHUB_TOKEN` is enough to create the API-authored commit, open a pull request, and leave durable comments when repository policy allows write tokens. The plan action needs Contents read/write, Pull requests read/write, and Issues read permissions; the verifier also needs Contents read, Pull requests read/write, and Issues read/write. GitHub suppresses most new workflow runs caused by events created with a workflow's own `GITHUB_TOKEN`. In particular, merging the pin with that token may not trigger the consumer's push-based deployment workflow, and an automatically created freeze issue does not trigger the issue-event announcer. Zero-touch auto-merge should use a fine-grained PAT or GitHub App token stored as `UPGRADE_AUTOMATION_TOKEN` with the same repository permissions. Repository rules and required checks still apply. When a PAT or GitHub App token does trigger the auto-created issue event, the exact `<!-- upgrade-automation:auto-freeze -->` sentinel in its body suppresses a duplicate pause notification.

`workflow_dispatch` and `repository_dispatch` are exceptions to GitHub's recursion suppression and always create workflow runs. A release-event integration can call:

```bash
gh api --method POST repos/OWNER/REPOSITORY/dispatches \
  -f event_type=lightdash-release
```

## Security maintenance

The CLI is exactly pinned and its complete dependency tree is locked in `cli/package-lock.json`; Renovate updates both in this repository. When copying the example, let your own Renovate or Dependabot update the copied `cli/package.json` and lockfile together.

## Freeze and recovery

Use the copied freeze workflow's `freeze` dispatch to pause upgrades and its `unfreeze` dispatch to resume them. The workflow creates or closes freeze-labelled issues but posts no Slack messages itself. Announcements come from the PR 1 issue-event announcer in the main upgrade workflow. Manual issue authoring remains supported: open an issue with the configured freeze label to disarm upgrades. The first planning job detects it before checkout and exits without a pull request or other side effect. When that issue becomes the only open freeze-labelled issue, the issue-event announcer posts one `[upgrade-freeze-on]` Slack message saying that automated Lightdash upgrades are paused and that closing the issue resumes them. The first active freeze issue is the pause transition; additional labelled issues do not announce another pause.

Verification failure creates the same kind of issue automatically, with the auto-freeze sentinel in its body. Investigate the linked deployment run and the recorded readiness reason, restore the deployment forward, and confirm that `readyz` is 200 with three stable version matches. Close or unlabel every open freeze-labelled issue to re-arm planning; when the count reaches zero, the announcer posts one `[upgrade-freeze-off]` Slack message that automated Lightdash upgrades are resumed. The next scheduled or manual run resumes from the version currently pinned in the default branch.

No step sends telemetry or calls back to Lightdash. Network calls are limited to GitHub, the public Lightdash release-safety index and npm package registry, the configured deployment and registry, and the optional Slack webhook. The planner installs the reviewed CLI dependency tree from its committed lockfile with lifecycle scripts disabled, in an isolated runner-temporary prefix so a different CLI version in the consumer repository cannot shadow `upgrade-check`.
