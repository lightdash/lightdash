# Slack agent test fixtures

Reusable setup for exercising the Slack AI agent flows against the local dev
stack. Scenario list lives in [SLACK_TEST_MATRIX.md](./SLACK_TEST_MATRIX.md);
results per run in `SLACK_TEST_RUN_*.md`.

## Environment

| Thing | Value |
|---|---|
| Organization | `172a2270-000f-42be-9c68-c4752c23ae51` |
| Slack team | `T0163M87MB9` |
| Project (the only one) | Jaffle shop `3675b69e-8324-4110-bdca-059031aa8da3` |
| Channel **A** | `#gio-agent-playground` `C08H61KB0LQ` |
| Channel **B** | `#gio-agent-playground-2` `C0BN96J4763` |
| Bot | `@HAL9000` user `U08GTG2AWF3`, bot `B08GTG2ATRP` |
| Test user | `demo@lightdash.com`, Slack `U08D7E4M51N` |
| API | `$LIGHTDASH_URL` = `http://localhost:3022`, auth `Authorization: ApiKey $LDPAT` |
| DB | `direnv exec . psql …` from the repo root — **never bare `psql`** |
| Logs | `herdr pane read wA:p1 --source recent-unwrapped --lines 400` |

> **Always prefix `psql` with `direnv exec .`.** Bare `psql` connects to database
> `postgres`, not the dev DB `postgres2` (`PGDATABASE` in
> `.env.development.local`). It does not error — the wrong DB answers plausibly,
> with ~96 seed agents and all-default Slack levers, which reads as a
> freshly-reset environment. A run can silently draw its conclusions from seed
> data. Every snippet below assumes the prefix.

Required feature flags (already in `LIGHTDASH_ENABLE_FEATURE_FLAGS`):
`ai-agent-v3`, `ai-slack-system-agent-fallback`, `ai-agent-slack-modern-blocks`.

> `ai-slack-system-agent-fallback` materially changes routing — it pre-empts the
> channel-link picker and both zero-agent messages. Turn it **off** to test those.
> See defect 1 in `SLACK_TEST_RUN_001.md`.

## Baseline

The dev DB does not sit at a clean baseline after a matrix run — agent deletion
cascades into threads, prompts and artifacts. Reseed before a fresh run:

```bash
./scripts/reset-db.sh
```

Verify:

```bash
direnv exec . psql -c "SELECT count(*) FROM ai_agent;"
direnv exec . psql -c "SELECT channel_id, a.name FROM ai_agent_slack_integration si
         JOIN ai_agent_integration ii USING (ai_agent_integration_uuid)
         JOIN ai_agent a ON a.ai_agent_uuid = ii.ai_agent_uuid;"
```

## Test agents

Two agents, one per provider, with descriptions distinct enough that the LLM
router's choice is predictable.

| Name | modelProvider | modelName | Owns |
|---|---|---|---|
| `ZAP-805 OpenAI` | `openai` | `gpt-5.4-2026-03-05` | orders, revenue, sales |
| `ZAP-805 Anthropic` | `anthropic` | `claude-sonnet-5` | customers, marketing |

`ai_agent.model_config` shape:

```json
{ "modelName": "gpt-5.4-2026-03-05", "modelProvider": "openai", "reasoning": false }
```

Valid ids come from `packages/backend/src/ee/services/ai/models/presets.ts`
(`openai` | `anthropic` | `bedrock`). Create via the REST API so slugs and
defaults are correct; direct INSERT only as a fallback.

Agents with no `model_config` inherit `ai_organization_settings.default_ai_agent_model_config`,
which is `NULL` here — so everything falls back to lightdash-managed
`gpt-5.4-2026-03-05`. **Provider tests are meaningless without an explicit
`model_config`.**

## Levers

| Lever | Location |
|---|---|
| multi-agent channel | `slack_auth_tokens.ai_multi_agent_channel_id` |
| OAuth required | `slack_auth_tokens.ai_require_oauth` |
| thread consent | `slack_auth_tokens.ai_thread_access_consent` |
| explicit channel linking | `ai_organization_settings.require_explicit_slack_channel_linking` |
| channel→agent map | `ai_agent_integration` + `ai_agent_slack_integration` |
| candidate-set size | delete agents, or `ai_agent.admin_only` (see below) |

Read them all:

```sql
SELECT ai_require_oauth, ai_thread_access_consent, ai_multi_agent_channel_id
  FROM slack_auth_tokens;
SELECT require_explicit_slack_channel_linking FROM ai_organization_settings;
```

Always confirm a lever took effect with a SELECT before posting to Slack.

### Controlling the candidate set

`selectAgentForSlack` branches on 0 / 1 / N candidates, so several scenarios need
a specific count.

**Preferred: delete agents.** Gives the right count under
`ai_require_oauth = true`, which is the realistic production config.

**Alternative: `admin_only`.** `getAvailableAgents`
(`AiAgentService.ts:14636-14640`) drops admin-only agents **only when OAuth is
off**, because without OAuth there is no per-user identity to evaluate. Reversible
and non-destructive, but it forces `ai_require_oauth = false`, which also disables
`runSql` / `editDbtProject` / `editRepo` and makes the installer the acting user.
Use it only when you must preserve agents.

The project filter (`slack_auth_tokens.ai_router_project_uuids`, surfaced as
`aiMultiAgentProjectUuids`) cannot narrow anything here — every agent lives in the
single project.

## Async runs

Slack replies are produced by a graphile job, not the HTTP request. Poll, do not
sleep:

```sql
SELECT thread_seq, role, status FROM ai_thread_message
 WHERE ai_thread_uuid = '<uuid>' ORDER BY thread_seq;
```

Terminal states are `completed` / `error`; typical run 5–40s. Find the thread by
Slack ts:

```sql
SELECT ai_thread_uuid FROM ai_slack_thread
 WHERE slack_channel_id = 'C0BN96J4763' AND slack_thread_ts = '<ts>';
```

Provider assertions come from the log line
`AI usage: feature=agent provider=… model=… ` — `feature=agent-selector` is the
router's own call and always runs on openai, regardless of agent config.

### Forcing a delayed Slack delivery (tunnel drop)

Slack events arrive over HTTP through `cloudflared` (pane `wA:pC`, command
`cloudflared tunnel run --url http://localhost:3022 gio`), not socket mode. Drop
the tunnel and Slack's POST fails at the Cloudflare edge; Slack retries the
failed delivery ~60s later.

```bash
herdr pane send-keys wA:pC ctrl+c
curl -s -o /dev/null -w '%{http_code}\n' --max-time 10 https://gio.lightdash.dev/api/v1/health   # expect 530
# …post to Slack…
direnv exec . psql -At -c "SELECT count(*) FROM ai_slack_thread WHERE slack_thread_ts='<ts>';"   # expect 0
herdr pane run wA:pC "cloudflared tunnel run --url http://localhost:3022 gio"
```

Then poll for the delivery instead of sleeping:

```bash
until [ "$(direnv exec . psql -At -c "SELECT count(*) FROM ai_slack_message WHERE prompt_slack_ts='<ts>';")" != "0" ]; do sleep 5; done
```

Measured in run 002: post at 12:39:55, tunnel restored ~12:40:30, delivery landed
**12:41:05**. This takes the tunnel down for all other traffic — the dev server
itself is unaffected, but anything reaching it through `gio.lightdash.dev`
(including Slack card images and share links) is dead for the duration.

**This does not produce a duplicate delivery.** `SlackClient.ts:1614` builds the
`ExpressReceiver` without `processBeforeResponse`, so Bolt acks Events API
deliveries *before* running the listener — any request that reaches the origin
returns 200 within milliseconds, and Slack never retries a delivery the app
actually saw. What the tunnel drop gives you is a **deterministically delayed
first delivery**, which is useful for testing what happens while the app is
unreachable and for confirming the event is not lost. The only product path to a
true duplicate is a **message edit** re-firing `app_mention` on the same `ts` —
matrix cell G1.6, which stays human-assisted.

## Teardown

```sql
UPDATE slack_auth_tokens SET ai_require_oauth = true,
       ai_thread_access_consent = true,
       ai_multi_agent_channel_id = 'C08H61KB0LQ';
UPDATE ai_organization_settings SET require_explicit_slack_channel_linking = false;
UPDATE ai_agent SET admin_only = false;
```

Then drop the `ZAP-805 *` agents and any channel mappings created for B. Deleted
agents are not restorable — `./scripts/reset-db.sh` reseeds.

Note: the system-agent fallback recreates a `Lightdash Assistant`
(`is_system = t`) on any mention in an unmapped channel, so one may reappear
after teardown. Harmless.

## Execution order

**Run every automatable cell first. Do the human-assisted cells last, in one
batch, and ask for help at that point** — never pause mid-run. These runs mutate
global state (org settings, feature flags, agent counts), so a long stall leaves
the environment half-configured.

Before delegating anything to a human, check it is *genuinely* human-only. A cell
blocked by a product defect or by a missing lever is not a human-assisted cell —
unblock it. Run 001 mislabelled G2.2 and G2.3 as BLOCKED when they were only
unreachable because `ai-slack-system-agent-fallback` was on.

### Human-assisted cells

Present these as concrete numbered actions ("post X in #channel, tell me what the
bot replies"), collect the answers, then record verdicts.

| Case | Why a human is needed |
|---|---|
| Agent-picker click (G3.3) | Nothing can click a Block Kit button |
| Feedback thumbs + downvote modal (G7.1, G7.2) | Same, plus modal submit |
| SQL approval buttons (G7.3) | Same |
| Follow-up tool buttons (G7.4) | Same |
| Message-edit dedup (G1.6) | No message-edit tool; an edit re-fires `app_mention` on the same `ts`, which is what `existsSlackPromptAcrossStorageVersions` guards |
| Bare `@HAL9000` (G1.5) | The Slack MCP appends `*Sent using* @Claude`, so `stripSlackMentions` never yields empty and the guard at `AiAgentService.ts:17247` is unreachable |
| Plain non-mention message (G3.6) | MCP-posted messages may carry `bot_id`, dropped at `:15418`. Must be hand-typed — a synthetic event would prove the handler works, not that Slack delivers it |
| Unlinked-user OAuth prompt (G5.3) | Needs a second Slack account with no Lightdash identity |

Note on G3.6: `handleMultiAgentChannelMessage` logs **only after** all its guards
(`AiAgentService.ts:15456`). Absence of `Got message event in multi-agent channel`
proves a guard fired, not which one — and not that the event never arrived.
