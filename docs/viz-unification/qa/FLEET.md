# Fleet brief

One agent per QA doc. Paste the common block, then the agent's block. Fill the
`<…>` inputs; environment details (cluster, URLs, credentials, rig scripts) are
given by the requester, not stored in this public repository.

## Common block

```text
You are verifying the viz unification branch of lightdash/lightdash
(branch claude/friendly-heisenberg-atf1t3) before it ships. Read, in order:
docs/viz-unification/qa/README.md, docs/viz-unification/migration.md (the
phase sections relevant to your area), and your QA doc below.

Environment:
- Upgrade rig: <URL of an instance that ran 2.603.0, was seeded with
  qa/tools/seed-v1.mjs, then upgraded to image <tag>>, manifest at <path>.
  If you must build your own rig, follow README "The upgrade rig" with
  <rig instructions>.
- Fresh instance on the branch for new-behaviour tests: <URL>.
- Login: <email> / <password>. Licence, AI key, Slack, Google: <what exists>.

Rules:
- Run every test ID in your doc. For each predicted defect (-Pxx), confirm or
  refute it with evidence; do not fix code.
- Do not re-save the seeded dashboard or edit seeded content unless a test
  says so; other agents share the rig. Create your own content in a space
  named "QA <your area> <your initials>".
- Report one row per test ID: ID | status (pass, fail, blocked, confirmed,
  refuted) | evidence (screenshot path, request and response excerpt, log
  line) | notes. Then list anything broken that no test covers.
- Blocked means the environment lacks something (licence, key, account);
  say what.
```

## Agents

| Agent | QA doc | Extra inputs |
|---|---|---|
| SQL runner | [01-sql-runner.md](01-sql-runner.md) | A user without `manage:SqlRunner`; a multi-connection project if available |
| Charts | [02-charts-and-pipeline-charts.md](02-charts-and-pipeline-charts.md) | A composer chart saved from an agent thread (or mark composer tests blocked) |
| Dashboards | [03-dashboards.md](03-dashboards.md) | A previous release browser tab opened before the upgrade, if the rig can still serve old assets |
| Deliveries | [04-deliveries-alerts-syncs.md](04-deliveries-alerts-syncs.md) | SMTP sink or worker log access; Google account; Slack workspace |
| Documents | [05-documents.md](05-documents.md) | `documents` flag on |
| Content as code | [06-content-as-code-and-promotion.md](06-content-as-code-and-promotion.md) | The as-code snapshot from the seed; `npm i -g @lightdash/cli@2.603.0` and the branch CLI; an upstream project for promotion |
| Embed and SDKs | [07-embed-and-sdks.md](07-embed-and-sdks.md) | EE licence, embed secret, allowed domains; Node to run the test apps |
| AI, MCP, Slack | [08-ai-agents-mcp-slack.md](08-ai-agents-mcp-slack.md) | EE licence, AI key, Slack app, MCP client, `multi-source-query` flag, content seeded by hand on the old release |
| Data apps | [09-data-apps.md](09-data-apps.md) | EE licence, data apps sandbox |
| API | [10-api-compatibility.md](10-api-compatibility.md) | Ability to run two backend versions on one database for the rolling update tests |
| Performance | [`../perf/`](../perf/) and the Performance section of [`../migration.md`](../migration.md) | Two images (previous release and branch) deployable on one instance; run the A/B method |

## Summary agent

After the area agents report, one agent merges their tables:

```text
Merge the QA reports below into docs/viz-unification/qa/RESULTS.md: one table
per QA doc (ID, status, one-line evidence), then "Confirmed defects" sorted by
severity (data loss, broken for existing content, broken for new content,
degraded, cosmetic) with the test ID, then "Refuted predictions", then
"Blocked tests and what they need". Do not drop any test ID.
```
