# Slack agent v3 — known issues

Issues found while testing the Slack AI agent on the `feature/zap-798..805` stack.
Run evidence in [SLACK_TEST_RUN_001.md](./SLACK_TEST_RUN_001.md) and
[SLACK_TEST_RUN_002.md](./SLACK_TEST_RUN_002.md) (including its human-assisted
batch, which produced KI-17 through KI-20); scenarios in
[SLACK_TEST_MATRIX.md](./SLACK_TEST_MATRIX.md).

**Provenance** decides where a fix belongs: `main` → its own PR off main;
`zap-80N` → amend into that branch. The stack now has two extra branches below
`feature/zap-798`: `feature/slack-channel-link-gate-order` and
`feature/slack-v1-write-lock`. Line numbers drift (the stack is being edited);
trust the symbol names.

| id | summary | status | severity | provenance |
|---|---|---|---|---|
| KI-01 | System-agent fallback pre-empted the channel-link picker | fixed-in-tree | high | `main` |
| KI-02 | Compaction threshold compared cumulative billing totals | fixed-in-tree | high | `feature/zap-804` |
| KI-03 | Root-mention redelivery orphaned the thread; thread + first message not atomic | fixed-in-tree | medium | `main` (v1), carried into v3 by `feature/zap-805` |
| KI-04 | `getRequiredScopes()` omits `channels:history` / `groups:history` | not-a-bug | — | — |
| KI-05 | Compaction threshold reads the *previous* message's model | open | medium | `feature/zap-804` |
| KI-06 | Awaiting-approval runs stay `status = in_progress` indefinitely | needs-decision | low | `feature/zap-802` + `feature/zap-803` |
| KI-07 | Deep research writes cumulative tokens into v1 `ai_prompt.token_usage` | open | medium | `main` |
| KI-08 | Anthropic prunes tool results at 120k, below our 183,616 threshold | needs-decision | medium | `main` |
| KI-09 | No separate status message and no task card on the first turn | not-a-bug | — | `main` |
| KI-10 | Root `CLAUDE.md` claims PM2 watches and restarts the API | doc-bug | medium | `main` |
| KI-11 | `handleMultiAgentChannelMessage` logs only after 7 silent guards | open | low | `main` |
| KI-12 | `channel_type !== 'channel'` drops plain messages in a private multi-agent channel | open | medium | `main` |
| KI-13 | `AiAgentService.integration.test.ts` — OAuth spy assertion is unsatisfiable | open | low | `main` |
| KI-14 | `AiAgentService.readRoutes.integration.test.ts` — `parts` array asserted one short | open | low | `feature/zap-802` |
| KI-15 | Integration tests need `SKIP_TEST_SEEDS=true`; seeds fail on missing `dbt1.11` | env-bug | medium | environment |
| KI-16 | Thread-only `createSlackThread` primitives survive the atomicity fix | needs-decision | low | `feature/zap-805` (v3), `main` (v1) |
| KI-17 | Slack app is not subscribed to `message.channels`; plain-message routing is dead | open | high | `main` (+ Slack app config) |
| KI-18 | Picker selection on a meta-query is never persisted; the thread stays unbound | open | medium | `main` |
| KI-19 | Picker replays the thread's *first* user message, not the one that opened it | open | medium | `main` |
| KI-20 | Follow-up tool buttons can never render — `generateVisualization` emits no `followUpTools` | open | low | `main` |

---

## KI-01 — system-agent fallback pre-empted the channel-link picker

**Status** fixed-in-tree · **Severity** high · **Provenance** `main`

`handleAppMention` called `resolveSystemAgentForSlack` first and only reached
`showChannelLinkAgentPicker` `if (!fallback)`. The
`require_explicit_slack_channel_linking` gate lived *inside* the picker, so with
`ai-slack-system-agent-fallback` on the setting was dead config, both zero-agent
messages were unreachable, and the bot silently auto-created an org-wide
`Lightdash Assistant` (`is_system = t`) and answered.

**Provenance evidence** — same ordering on `main`:
`git show main:…/AiAgentService.ts` → `resolveSystemAgentForSlack` at `:14359`,
`showChannelLinkAgentPicker` under `if (!fallback)` at `:14372` (and again at
`:14631`/`:14644`); the gate at `:12377` is inside the picker. Not introduced by
any zap-80N branch.

**Repro** — `require_explicit_slack_channel_linking = true`, flag on, @mention in
an unmapped channel. Expected 🔒 ephemeral; got an auto-created assistant
answering. Root cause of run 001 G2.1–G2.4 and G3.5.

**Fix in tree** — new `resolveAgentForUnmappedSlackChannel`
(`AiAgentService.ts` ~`:14888`) evaluates the explicit-linking gate *before* the
fallback and returns `AiAgent | 'handled'`; both call sites go through it.

**Owning branch** — the fix rides on `feature/zap-805` in the tree, but the
defect is `main`'s. Relocate to a standalone PR off main unless the v3 refactor
makes that impractical.

**Confirmed fixed in run 002** — G2.1–G2.4 and G3.5 all pass, and
`count(ai_agent WHERE is_system)` stayed at 0 for the whole run, including the
`require_explicit_slack_channel_linking = true` cell with the fallback flag on.

## KI-02 — compaction threshold compared cumulative billing totals

**Status** fixed-in-tree · **Severity** high · **Provenance** `feature/zap-804`

`getV3CompactionTrigger` compared `tokenUsage.totalTokens` against
`contextWindow - V3_COMPACTION_RESERVE_TOKENS`. `AiAgentV3RunPersistence`
summed `step.usage` over every step of the tool loop and persisted `onFinish`'s
`totalUsage` — both cumulative. Each step re-sends the whole prompt, so the
billed total compounds and crossed 200k on a two-message thread
(`totalTokens=229371`), firing compaction on turn 2 of every cached thread.
v1 never had this: it persists `result.usage` (final step only).

The first diagnosis ("cache tokens are billing tokens, exclude them") was wrong —
in AI SDK v6 `inputTokens` is the whole prompt and cache reads *are* resident
context.

**Provenance evidence** — `git cat-file -e <branch>:…/v3Compaction.ts` is present
only from `feature/zap-804`; `git log --oneline feature/zap-805 -- v3Compaction.ts`
→ `84e356e717 feat: add v3 conversation compaction`. The persistence file dates
to `feature/zap-800`, but the summing was harmless until the trigger read it.

**Fix in tree** — `AiAgentV3TokenUsage` gains `contextTokens` (final step's
prompt + output) at `AI_AGENT_V3_TOKEN_USAGE_VERSION = 2`; the trigger reads
`getAiAgentV3ContextTokens`. Pre-v2 envelopes return `null`, which disables
threshold compaction for that message — the context-overflow trigger stays the
backstop. Touches `v3ThreadTypes.ts`, `AiAgentV3RunPersistence.ts`,
`v3Compaction.ts`, `v3CompactionGenerator.ts`, `AiAgentV1ReadAdapter.ts`,
`AiAgentService.ts`.

**Owning branch** — `feature/zap-804`.

**Confirmed fixed in run 002** — envelope reads `{"version": 2, …
"totalTokens": 138578, "contextTokens": 35633, …}`, and the trigger log prints
both. Decisive case, Anthropic thread turn 3:
`contextTokens=75003 billedTotalTokens=221004 contextWindow=200000 … trigger=none`.
`221004 > 183616` would have fired spurious compaction under the old code.

## KI-03 — root-mention redelivery orphaned the thread

**Status** fixed-in-tree · **Severity** medium · **Provenance** `main` (v1), carried into v3 by `feature/zap-805`

Two coupled problems:

1. `createSlackPrompt` looked up an existing thread only `if (data.slackThreadTs)`,
   which is `undefined` for a **root** mention — so a redelivered root event tried
   to create a second thread and hit the unique constraint.
2. The thread row and the first message committed separately, so a failure
   between them left a thread with no messages.

Narrower than first described: a **reply** carries `thread_ts`, finds the orphan
and appends normally, so the thread self-heals. Run 001 G8.2 confirmed this —
posting into the orphaned thread succeeded.

**Provenance evidence** — `git show main:…/AiAgentService.ts` `:9959`
(`createSlackPrompt`) has both `if (data.slackThreadTs) { … }` and a separate
`createSlackThread` / `createSlackPrompt` pair. Pre-existing. The **fix** symbol
`getSlackThreadWriteContext` is absent on `main`, `feature/zap-803`,
`feature/zap-804` *and* `feature/zap-805` HEAD — it exists only in the working
tree, so it is uncommitted work destined for `feature/zap-805`.

**Fix in tree** — `getSlackThreadWriteContext` is passed
`data.slackThreadTs ?? data.promptSlackTs`, and both storage versions create the
thread and its first message in one call
(`createSlackThreadWithUserMessage` `AiAgentService.ts:12034` /
`createSlackThreadWithPrompt` `:12052`). Also touches `handleSlackAgentError`
(converted to a named-arg signature), `AiAgentV3Model.ts`, `AiAgentModel.ts`.
New coverage: `slackRootPromptRedelivery.test.ts` plus cases in both model
integration test files.

**Owning branch** — `feature/zap-805` (the v3 half only exists there). The pure-v1
one-liner could go to main separately if the branches need to stay clean. See
KI-16 for the leftover primitives.

**Run 002 status** — the *atomicity* half is confirmed: 14 `ai_slack_thread`
rows created, 0 orphans at every checkpoint (v1-aware query). The *redelivery*
half could **not** be exercised end to end — `ExpressReceiver`
(`SlackClient.ts:1614`) is built without `processBeforeResponse`, so Bolt acks
before the listener runs and Slack never retries a delivery the app saw. Dropping
the `cloudflared` tunnel only delays the first delivery (measured: +70s, one
thread, no `Ignored duplicate Slack prompt`). The only product path to a true
duplicate is a message edit — matrix G1.6, human-assisted. Unit coverage
(`slackRootPromptRedelivery.test.ts` et al., 46 tests across 6 files) passes.

## KI-04 — `getRequiredScopes()` omits the history scopes

**Status** not-a-bug · **Provenance** n/a

Reported as: a fresh Slack install cannot receive `message` events, only
`app_mention`. **Not reproduced.** The base
`SlackClient.getRequiredScopes()` (`packages/backend/src/clients/Slack/SlackClient.ts:254-272`)
does omit them, but `CommercialSlackClient`
(`packages/backend/src/ee/clients/Slack/SlackClient.ts:22-28`) overrides it:

```ts
return [...super.getRequiredScopes(), 'channels:history', 'groups:history'];
```

and overrides `getSlackOptions()` so the install requests them. EE registers this
client unconditionally when a license is present
(`packages/backend/src/ee/index.ts:1275`), and the Slack AI agent is EE-only —
so any install that *has* the agent also has the scopes. The local install's
granted bot scopes confirm it
(`SELECT installation->'bot'->'scopes' FROM slack_auth_tokens`): both are present.

Run 001's defect 3 note ("real regardless") is wrong *about `getRequiredScopes()`*.
Note the base class only matters for OSS, which has no AI agent.

**Amended after run 002's human batch — the conclusion was too broad.** This
entry closed the scope question correctly but then implied the wider claim that
`message` events therefore reach the app. They do not. An OAuth scope is not an
event subscription: `channels:history` lets the app *call*
`conversations.history`, while receiving `message` events additionally requires
`message.channels` under the Slack app's **Event Subscriptions**, which nothing
in this repo declares. Measured: three plain messages produced **zero** Bolt
`authorize()` calls. So run 001's *symptom* ("a fresh Slack install cannot
receive `message` events, only `app_mention`") was right; only its attribution to
`getRequiredScopes()` was wrong. The real issue is **KI-17**. This entry stays
`not-a-bug`.

## KI-05 — compaction threshold reads the previous message's model

**Status** open · **Severity** medium · **Provenance** `feature/zap-804`

`maybeCompactV3Thread` (`AiAgentService.ts` ~`:6228-6255`) derives both
`supportsCompaction` and `contextWindowTokens` from
`latestAssistant.metadata.modelConfig` — the model that produced the *previous*
assistant turn — not the model about to run. Switching an agent to a
smaller-window model leaves the threshold silently too generous; switching to a
larger one compacts too eagerly.

**Observed** — logged `contextWindow=265000` (gpt-5.4's window, from a stale
persisted `model_config`) while the run executed on `claude-sonnet-5`, whose
window is 200000 (`presets.ts:110-120`, `:51-63`).

**Repro** — run one turn on a gpt-5.4 agent, change `ai_agent.model_config` to
`claude-sonnet-5`, run a second turn, read
`[AiAgentV3][Compaction] … contextWindow=` in the log.

**Suggested owner** — `feature/zap-804`. Resolve the model for the *upcoming*
run and pass its metadata in; the persisted `modelConfig` should only be used
for the fallback when the upcoming model is unknown.

## KI-06 — awaiting-approval runs stay `in_progress` indefinitely

**Status** needs-decision · **Severity** low · **Provenance** `feature/zap-802` (parking) + `feature/zap-803` (sweeper)

A `runSql`-approval turn leaves its assistant row `status = 'in_progress'` with
`last_heartbeat_at = NULL` until the user decides. `sweepStaleV3Runs` runs every
2 minutes and never clears it.

**This is deliberate, not a leak.** `sweepStaleAssistantMessages`
(`AiAgentV3Model.ts:2359-2440`) explicitly excludes parked rows that have an
`ai_message_part` in `approval-requested` state, a recently decided
`ai_tool_approval`, or a live `slackAiPrompt` graphile job. On
`feature/zap-803` the same exclusion was implicit — the sweeper only matched
`last_heartbeat_at IS NOT NULL`, and `suspendAssistantMessage` nulls it.

**The real gap is observability, not correctness.** `(in_progress, heartbeat
NULL, approval-requested part exists)` is a three-way join, so nothing outside
the sweeper query can distinguish "awaiting approval" from "running" from
"parked and forgotten". Run 001 misread it as a stuck run.

**Repro** — mapped agent with `enableSqlMode = true` and `ai_require_oauth = t`,
ask something answered with `runSql`, never click Approve. Observed on thread
`4a93d322-8554-4de0-9aea-7536a70bf24e` (since resumed and completed, so it no
longer demonstrates the state).

**Decision needed** — either add a distinct status (`awaiting_approval`) or
document the tri-state and expose it in whatever reads run health. There is also
no timeout: an un-actioned approval parks forever.

## KI-07 — deep research writes cumulative tokens into v1 `token_usage`

**Status** open · **Severity** medium · **Provenance** `main`

Same class as KI-02, on the v1 storage path, unfixed. In `deep_research` mode
`agentV2.ts` (`:1632-1646`) accumulates `generatedTokenUsage += stepUsage.totalTokens`
across every step and writes it to `ai_prompt.token_usage.totalTokens`. Every
other mode writes `result.usage.totalTokens` (`:1685`) — the final step only.
The v1 compaction path reads it raw:

```ts
const previousPromptTotalTokens = previousPrompt.token_usage?.totalTokens;
```

`AiAgentService.ts:5548-5556`. So a deep-research thread compacts far earlier
than its real context occupancy warrants.

**Provenance evidence** — `git grep -n generatedTokenUsage main -- …/agentV2.ts`
→ `:1355`, `:1579`, `:1589`. Present on main; the stack only shifted the lines
(`git diff --stat main feature/zap-805 -- agentV2.ts` shows unrelated changes).

**Repro** — run a deep-research thread with several tool steps, compare
`ai_prompt.token_usage->>'totalTokens'` against the provider's final-step
`input_tokens + output_tokens`.

**Suggested owner** — its own PR off `main`. Mirror KI-02: keep the billing sum,
add a separate final-step figure, and have `Compaction.shouldCompactPrompt` read
that.

## KI-08 — Anthropic prunes at 120k, below our compaction threshold

**Status** needs-decision · **Severity** medium · **Provenance** `main`

`getAnthropicModel` (`packages/backend/src/ee/services/ai/models/anthropic-claude.ts:36-54`)
sends `contextManagement.edits` with:

```
{ type: 'clear_tool_uses_20250919',
  trigger: { type: 'input_tokens', value: 120_000 },
  keep: { type: 'tool_uses', value: 3 },
  clearAtLeast: { type: 'input_tokens', value: 5_000 } }
```

`claude-sonnet-5` has `contextWindowTokens: 200000` (`presets.ts:115`) and
`V3_COMPACTION_RESERVE_TOKENS = 16384` (`v3Compaction.ts:11`), so our threshold
is **183,616**. The provider starts dropping tool results at **120,000** — 63k
lower. On Anthropic our threshold compaction plausibly never fires: the provider
keeps input tokens pinned below it by discarding older tool results, silently
and without a summary.

Not obviously a bug — provider pruning is cheaper than a compaction round trip —
but the two mechanisms are uncoordinated and the *v3 compaction feature is
effectively OpenAI-only on Anthropic agents*.

**Decision needed** — pick one: raise the provider trigger above our threshold so
compaction leads; lower our threshold below 120k on Anthropic; or accept
provider pruning as the Anthropic strategy and document that threshold
compaction is OpenAI-only.

## KI-09 — no separate status message and no task card on the first turn

**Status** not-a-bug · **Provenance** `main`

Run 001 G1.1 recorded "no separate status message and no task card" as a
deviation from the matrix's expected `status → task card → answer`. **The matrix
is wrong.** `replyToSlackPromptWithStatus` (`AiAgentService.ts` ~`:12764`) is
explicit:

- the status is `assistant.threads.setStatus` — an ephemeral thread status, *not
  a posted message*, so it never appears in a channel history listing;
- the task card is `chat.startStream`, posted only on the **first tool call**;
- `deliverSlackAnswerWithCard` closes that same stream with `chat.stopStream`,
  converting the card into the answer.

One posted message per turn is the design. Answers with no tool call stay
status-only until the reply posts.

The CSV inconsistency has the same explanation: `runQuery.ts:285-323` is an XOR
on `chartConfig.defaultVizType` (`getRunQueryEchartsConfig.ts:24` — `table`
returns null). Row count is incidental.

**Amended by run 002** — the two branches surface *differently* in Slack, which
is why run 001 saw "CSV absent" on one turn and present on another:

- `defaultVizType: "table"` → a visible file message carrying
  `lightdash-results.csv`, and a `card` block with **no** `hero_image`.
- `defaultVizType: "bar"` (or any chart) → **no** file message at all. `sendFile`
  returns a URL that the answer's `card` block embeds as
  `hero_image.image_url = {siteUrl}/api/v1/slack/card-image/{nanoid}`, plus an
  "Open image" button. Verified 200 `image/png` 47414 bytes.

So a chart result is never a separate `lightdash-chart.png` message under
`ai-agent-slack-modern-blocks`. Absence of a file message is not evidence of a
missing attachment — check the card for `hero_image`.

Neither file is touched by the stack (`git diff --stat main feature/zap-805 --
runQuery.ts SlackClient.ts` is empty), so this is not a zap-805 behaviour
change. **Update the matrix's G1.1 expectation** rather than filing a defect.

## KI-10 — root `CLAUDE.md` claims PM2 watches and restarts the API

**Status** doc-bug · **Severity** medium · **Provenance** `main`

`CLAUDE.md:80` states:

> Assume the dev-server is always running. PM2 watches backend source files and
> restarts the API […] backend and generated-route changes reload the API
> automatically.

False for this setup. Two separate test runs measured stale code because of it.

**Evidence** — the running server is
`node …/tsx/dist/cli.mjs watch --clear-screen=false --inspect=0.0.0.0:9229 src/index.ts`
(pid 56437, started 11:31:54) with child pid 56517 started 11:31:55. No PM2
daemon is running. `AiAgentService.ts` was last modified 11:47:10 and
`AiAgentV3Model.ts` 11:44:12 — both after the child started, and the child pid
had **not** been replaced. `pnpm dev` (root `package.json:105`) fans out to each
package's own `dev`; backend's is `tsx watch` (`packages/backend/package.json:11`).
PM2 only applies to the opt-in `pnpm dev:pm2` / `ecosystem.config.js` path.

**Correct restart procedure** (Herdr pane `wA:p1`, label `dev:fast`, title
`pnpm dev`, cwd `lightdash_2`):

```bash
pnpm -F common build            # only when packages/common changed
herdr pane send-keys wA:p1 ctrl+c
herdr pane run wA:p1 "pnpm dev"
ps -o lstart= -p $(pgrep -f 'src/index.ts' | tail -1)   # confirm a new start time
```

Always confirm the new pid/start time before taking a measurement.

**Suggested owner** — its own doc PR off `main`. Either qualify line 80 with
"when started via `pnpm dev:pm2`" or replace it with the `tsx watch` reality and
the restart recipe above.

## KI-11 — multi-agent message log sits after every guard

**Status** open · **Severity** low · **Provenance** `main`

`handleMultiAgentChannelMessage` (`AiAgentService.ts:15435-15486`; the guard
chain is `:15442-15484`, the log line `:15486`) has seven silent `return`s —
`event.subtype`, missing `user`/`text`/`channel`, `bot_id`, `thread_ts`,
`channel_type !== 'channel'`, missing `teamId`, self-mention, missing
`slackSettings`, not the multi-agent channel — before the only log line,
`Got message event in multi-agent channel`. Its absence proves *a* guard fired,
never *which*, and never that no event arrived. Run 001 G3.6 could not be
adjudicated because of this.

**Adjudicated in run 002's human batch — and the answer was "none of them".**
G3.6's cause is KI-17: the event never arrives, so the handler never runs and no
guard fires. The diagnosis could not come from this log line at all; it came from
Bolt's own `Starting authorize() execution` debug line
(`@slack/bolt@3.22.0/dist/App.js:411`, emitted in `processEvent` before any
listener), which appeared **zero** times for three plain messages and **once**
for an @mention control. That is the discriminator this entry is asking for, and
it only exists because `LIGHTDASH_LOG_LEVEL=debug` maps to `SlackLogLevel.DEBUG`
(`SlackClient.ts:199-213,1570`).

So the severity stands but the framing sharpens: the missing log makes the
handler indistinguishable from *unreachable*. Two full runs mis-attributed G3.6
to a guard because of it.

**Suggested owner** — its own PR off `main`. A single `Logger.debug` naming the
guard that fired would make G3.6 self-diagnosing — and, critically, would have
shown *no line at all*, pointing straight at KI-17.

## KI-12 — private multi-agent channels never route plain messages

**Status** open · **Severity** medium · **Provenance** `main`

The same guard chain drops any event whose `channel_type !== 'channel'`
(`AiAgentService.ts:15449`). Slack sets `channel_type: 'group'` for private
channels, so if `ai_multi_agent_channel_id` points at a **private** channel,
plain non-mention messages are silently ignored there — @mentions still work via
`handleAppMention`.

**Provenance evidence** — identical guard on `main`, and on every branch of the
stack including the two new bottom ones:
`git grep -c "channel_type !== 'channel'" <branch> -- packages/backend/src/ee/services/AiAgentService/AiAgentService.ts`
→ `1` on `main`, `feature/slack-channel-link-gate-order`,
`feature/slack-v1-write-lock`, `feature/zap-798`, `feature/zap-805`.

**Amended after run 002's human batch — this entry is currently unreachable, and
its stated premise is false.** The premise "the install already holds
`groups:history`, so the events do arrive; only this guard rejects them" is
wrong. Per **KI-17** no `message` event of any kind is delivered to this app, in
public or private channels, so this guard is never evaluated. It stays `open` as
a **latent** bug that becomes live the moment KI-17 is fixed.

It is also **not** the cause of G3.6, which was the original suspicion.
`#gio-agent-playground` `C08H61KB0LQ` — the multi-agent channel — is **public**:
`conversations.info` → `is_channel: true, is_group: false, is_private: false`.
Its `channel_type` would be `'channel'` and this guard would pass.

**Repro** — currently **not reproducible**. Once KI-17 is fixed: set
`ai_multi_agent_channel_id` to a private channel, post a plain message. Expected
an answer (matrix G3.6); nothing happens, and per KI-11 no log line either.

**Suggested owner** — its own PR off `main`. Accept `'channel'` and `'group'`.
Best fixed in the same PR as KI-17, since neither is testable without the other.

## KI-13 — OAuth spy assertion is unsatisfiable

**Status** open · **Severity** low · **Provenance** `main`

`AiAgentService.integration.test.ts` — *"lets non-managers connect and
disconnect their own OAuth credential"* — fails:

```ts
expect(startOAuthConnectionSpy.mock.calls[0][0]).not.toHaveProperty(
    'connectionStatusOnAuthorization',
);
```

`startMcpOAuthConnection` always spreads `connectionStatusOnAuthorization:
options?.connectionStatusOnAuthorization` into the call object
(`AiAgentService.ts:4996`), so the key is *present* with value `undefined`, and
`toHaveProperty` matches present-but-undefined keys. The assertion can never
pass; it should be `toHaveProperty(…, undefined)` or check the value.

**Provenance evidence** — the production line is byte-identical on `main`
(`git show main:…/AiAgentService.ts` `:4124-4125`) and the assertion is on main
too (`:887`). Neither is touched by the stack or the dirty tree. Pre-existing,
unrelated to the Slack work.

**Suggested owner** — its own PR off `main`.

## KI-14 — approval-scope test asserts one part too few

**Status** open · **Severity** low · **Provenance** `feature/zap-802`

`AiAgentService.readRoutes.integration.test.ts` — *"keeps approval decisions
scoped, bounded, and idempotent after freeze"* — fails at `:500`. The test
appends **two** tool parts (`decided-call`, `pending-call`) but asserts
`parts: [ … ]` with a single element. `toMatchObject` tolerates extra *object*
keys but compares arrays by length, so the second part fails the match.

Confirmed by running it (`SKIP_TEST_SEEDS=true … -t 'keeps approval decisions
scoped'`): the diff shows the whole second part as unexpected. The extra keys
the failure output highlights are **not** the cause — `approval.{id,signature,
approved,decidedAt}` come from zap-802's `toCanonicalPart` hydration
(`AiAgentV3Model.ts:610-625`) and `artifactVersionUuid` is on canonical parts
at `feature/zap-805` HEAD (`:550`); all are tolerated by `toMatchObject`.

**Provenance evidence** — the file first appears at `feature/zap-801`; this test
case first appears at `feature/zap-802`, already with two appended parts and a
one-element assertion. Nothing in the uncommitted artifact-references workstream
(untracked `20260806140000_add_ai_message_artifact_references.ts`, the new
`ai_message_artifact_references` table, `findArtifactReferencesByMessageUuid` /
`recordArtifactReferences`) contributes.

**Suggested owner** — `feature/zap-802`. Assert both parts, or narrow to
`parts[0]`.

## KI-15 — integration tests only run with `SKIP_TEST_SEEDS=true`

**Status** env-bug · **Severity** medium · **Provenance** environment, not a branch

`vitest.setup.integration.ts:136-142` runs `db.seed.run()` unless
`SKIP_TEST_SEEDS=true`. The development seeds deploy the demo dbt project with
the backend's default dbt version (1.11), which needs a `dbt1.11` binary on
PATH. It is missing here: `venv/bin/` has `dbt`, `dbt1.7`, `dbt1.9`, `dbt1.10`
and no `dbt1.11`, and the shared cache it is shimmed from
(`~/.lightdash/dev-venv-1.11`) does not exist. Seeds fail on `dbt1.11 deps`, so
every integration run needs the flag:

```bash
SKIP_TEST_SEEDS=true direnv exec . pnpm -F backend exec vitest run \
  --config vitest.config.integration.ts <path>
```

`scripts/dev-fast-start.sh:140-158` is the piece that builds
`~/.lightdash/dev-venv-1.11` and links `venv/bin/dbt1.11`; running it once fixes
the environment properly. Recorded alongside KI-10 because both silently make
people measure the wrong thing.

## KI-16 — thread-only `createSlackThread` primitives survive the atomicity fix

**Status** needs-decision · **Severity** low · **Provenance** `feature/zap-805` (v3 primitive), `main` (v1 primitive)

After KI-03, no production caller uses the bare thread-creating primitives —
`AiAgentV3Model.createSlackThread` (`:890`) and `AiAgentModel.createSlackThread`
(`:4936`). `createSlackPrompt` goes exclusively through
`createSlackThreadWithUserMessage` / `createSlackThreadWithPrompt`.

They survive only as fixture setup: 19 call sites in
`AiAgentV3Model.integration.test.ts`, 2 in `AiAgentModel.integration.test.ts`.
`AiAgentV3Model.createSlackThread` first appears on `feature/zap-805`; the v1
one is on `main`.

**Latent footgun** — a future caller reaching for the obvious-looking
`createSlackThread` reintroduces exactly the orphan window KI-03 closed. Nothing
in the type system or a comment says otherwise.

**Decision needed** — make them `private` and give the tests a fixture helper,
delete them in favour of the atomic pair, or leave them with a doc comment
saying "tests only; production must use the atomic variant".

## KI-17 — the Slack app is not subscribed to `message.channels`

**Status** open · **Severity** high · **Provenance** `main` (code gap) + Slack app configuration

`CommercialSlackService.setupEventListeners` registers a listener for the
`message` event (`packages/backend/src/ee/services/SlackService/SlackService.ts:31-33`):

```ts
slackApp.event('message', (m) =>
    this.aiAgentService.handleMultiAgentChannelMessage(m),
);
```

**No `message` event is ever delivered to it.** The whole multi-agent
plain-message feature — matrix G3.6, and the negative half G3.7 — is dead in this
install, and nothing in the codebase would make it live on any other.

Root cause: receiving `message` events requires the Slack app to subscribe to the
`message.channels` (and `message.groups`) **bot event** under Event
Subscriptions. That is app configuration, not an OAuth scope. `getSlackOptions()`
(`packages/backend/src/clients/Slack/SlackClient.ts:274-290`) sets `scopes` and
`installerOptions` and nothing else, and the repo contains no Slack app manifest,
so nothing declares the subscription, nothing verifies it at startup, and nothing
surfaces its absence at runtime. See KI-04: the *scopes* are complete
(`channels:history`, `groups:history` are both granted); scopes are simply not
the mechanism.

**Repro** (measured 2026-08-07 14:24–14:26 UTC, `feature/zap-805` @ `110da8f5f3`,
server pid 42142, tunnel healthy, `ai_multi_agent_channel_id = C08H61KB0LQ`):

1. Post three plain messages with no `@mention` — `1786112655.601839` and
   `1786112765.705379` in `#gio-agent-playground` (the multi-agent channel),
   `1786112773.249639` in `#gio-agent-playground-2`.
2. Post one `@mention` control — `1786112683.246439`.
3. `herdr pane read wA:p1 --source recent-unwrapped --lines 900 | grep -c 'Starting authorize() execution'` → **1**.

Bolt calls `this.authorize(source, bodyArg)` in `App.processEvent`
(`@slack/bolt@3.22.0/dist/App.js:380,411`) **before any listener middleware**,
and at `SlackLogLevel.DEBUG` that emits `Starting authorize() execution`. So the
count is a direct census of events reaching the app, independent of every guard
in `handleMultiAgentChannelMessage`. One line, for the @mention:

```
[DEBUG]  OAuth:InstallProvider:0 Starting authorize() execution (source: {"userId":"U08D7E4M51N","isEnterpriseInstall":false,"teamId":"T0163M87MB9","conversationId":"C08H61KB0LQ"})
[DEBUG]   ack() call begins (body: undefined)
2026-08-07 14:24:45 [Lightdash][f0671393eda8a6dd92c2471edfc5ed41] info: Got app_mention event <@U08GTG2AWF3> [ZAP805-R003-control] …
```

Two independent confirmations in that one number:

- Three plain messages produced **zero** events.
- The @mention produced **one**, not two. Slack fires `app_mention` *and*
  `message.channels` for a message that mentions the bot in a channel it is in,
  so a single pair proves `message.channels` is not subscribed either.

Everything else was ruled out first. For the original hand-typed G3.6 failure
(`1786108626.117079`, `text: "how many customers do we have?"`), every guard in
`handleMultiAgentChannelMessage` (`AiAgentService.ts:15442-15484`) provably
passes: no `subtype`, no `bot_id`, no `thread_ts`, `user`/`text`/`channel` all
present, `teamId = T0163M87MB9`, no self-mention, `slackSettings` resolves, and
`aiMultiAgentChannelId === event.channel` (`C08H61KB0LQ`, verified in
`slack_auth_tokens`). `channel_type` is `'channel'`, not `'group'` —
`conversations.info` on `C08H61KB0LQ` returns
`is_channel: true, is_group: false, is_private: false` — so **KI-12 is not the
cause**. The `bot_id` / `*Sent using* @Claude` theory from run 001 is also dead:
the message was hand-typed and carries neither.

**Fix** — two halves, and the code half is the one that belongs in this repo:

1. Add `message.channels` and `message.groups` to the Slack app's subscribed bot
   events (app config / manifest for the shared Lightdash Slack app; the dev
   `gio` app needs it too).
2. Make the dependency legible in code, so this cannot silently regress: check
   the subscription at startup and warn, or at minimum document next to
   `slackApp.event('message', …)` that it is inert without the subscription.
   Right now `getRequiredScopes()` is the only thing that looks like it governs
   event delivery, and it does not — which is exactly the trap KI-04 fell into.

**Suggested owner** — its own PR off `main`. Nothing in the `zap-79x/80x` stack
touches it: `git grep -c "slackApp.event('message'" <branch> -- packages/backend/src/ee/services/SlackService/SlackService.ts`
→ `1` on `main`, `feature/slack-channel-link-gate-order` and
`feature/zap-805` alike.

**Blocks** — matrix G3.6 (cannot pass), G3.7 (passes vacuously — nothing routes
plain messages at all), and KI-12 (cannot be reproduced).

## KI-18 — picker selection on a meta-query is never persisted

**Status** open · **Severity** medium · **Provenance** `main`

`handleAgentSelection` (`AiAgentService.ts:15805`) rewrites the picker message in
place to `✅ You selected: *X*` (`chat.update`, `:15950-15963`) and then, for a
meta-query, returns before writing anything:

```ts
// AiAgentService.ts:15973-15978
if (shouldSkipForwardingQuery) {
    Logger.info(`Skipping query forwarding for meta-query in agent selection`);
    return;
}
```

`createAndScheduleSlackPromptFromAction` (`:15980`) is the only thing on this
path that creates a thread, so on the meta-query branch **no `ai_thread`, no
`ai_slack_thread` and no `ai_thread.agent_uuid` is ever written**. The
confirmation the user sees is not backed by any state. The next `@mention` in
that Slack thread finds no `ai_slack_thread` row, treats the thread as unbound,
and re-enters agent selection from scratch — showing a second picker and, after
a second click, a second `✅ You selected: *X*` plus a `You're now chatting with
*X*`.

This is the defect behind the "duplicate agent-selection message". The two
confirmations are not a double-post of one event: `✅ You selected: *…*` occurs
at exactly one call site in the codebase (`AiAgentService.ts:15959`, inside the
`select_agent` `chat.update`), so two messages with distinct `ts` mean two
pickers were posted and clicked.

**Repro** — in the multi-agent channel:

1. `@HAL9000 which agents are available here?` → low confidence,
   `shouldSkipForwardingQuery: true` → agent picker.
2. Pick an agent → `✅ You selected: *X*`.
3. `direnv exec . psql -c "SELECT count(*) FROM ai_slack_thread WHERE slack_thread_ts = '<root ts>';"` → **0**.
4. `@HAL9000 <anything>` in the same thread → selection runs again.

Observed on thread `1786108600.280039` in `C08H61KB0LQ`:

```
17:16:40 user  @HAL9000 which agents are available here?
17:16:44 HAL   ✅ You selected: *ZAP-805 Anthropic*     ts 1786108604.822399
17:17:38 user  @HAL9000 okay?
17:17:42 HAL   ✅ You selected: *ZAP-805 Anthropic*     ts 1786108662.909949
17:18:03 bot   You're now chatting with *ZAP-805 Anthropic*
```

`ai_thread 19e514df-f07a-4bb5-ab0d-338670e355a7` has
`created_at = 13:18:03.122051` — the same instant as `You're now chatting with`,
i.e. the thread was created by the **second** click, 83 seconds after the first.
Run 002's G3.2 saw the same hole from the other side ("**No** `ai_slack_thread`
row").

**Provenance evidence** — unchanged across the stack:
`git grep -c 'You selected' <branch> -- packages/backend/src/ee/services/AiAgentService/AiAgentService.ts`
→ `1`, and `shouldSkipForwardingQuery` → `19`, on `main`,
`feature/slack-channel-link-gate-order`, `feature/slack-v1-write-lock`,
`feature/zap-798` and `feature/zap-805` alike.

**Suggested owner** — its own PR off `main`, together with KI-19 (same handler).
Create the thread and bind `agent_uuid` on the meta-query branch too, before
returning — the user *did* make a choice, and skipping the query forward is not a
reason to discard it. Note the matrix has no cell for "@mention follow-up after a
**picker** selection"; G3.8 only covers the LLM-selection path, which does bind
correctly. That gap is why this survived two runs.

## KI-19 — the picker replays the thread's first user message

**Status** open · **Severity** medium · **Provenance** `main`

`handleAgentSelection` reconstructs the prompt to forward by scanning the thread
(`AiAgentService.ts:15924-15936`):

```ts
const originalMessage = conversationHistory.messages?.find((msg) => {
    if (msg.user !== body.user.id) return false;
    if (!msg.text) return false;
    if (isMultiAgentChannel) {
        return true;          // ← any message by this user
    }
    return msg.text.includes(`<@${context.botUserId}>`);
});
```

`Array.prototype.find` returns the **first** match, and in a multi-agent channel
the predicate is an unconditional `return true`, so it always resolves to the
thread **root** — regardless of which message actually caused the picker to be
shown. The result is forwarded as both the prompt text and the dedup key
(`promptText: originalMessage.text`, `promptSlackTs: originalMessage.ts`,
`:15991-15992`), so the user's real question is answered with the wrong text and
is never recorded at all.

In a regular channel the `@mention` predicate narrows it, but not enough: it
still returns the *first* mention in the thread, not the latest.

**Repro** — reach a picker on a follow-up turn (KI-18 makes this easy: do the
KI-18 repro, then `@HAL9000 okay?`), pick an agent, and compare the answer and
the stored prompt against what was actually asked.

Observed on the same thread as KI-18. The user's follow-up was `okay?`
(`1786108658.474869`); what got stored and answered was the root meta-query:

```
thread_seq | role      | part | payload
1          | user      | text | {"text": "which agents are available here?"}
2          | assistant | text | {"text": "I don't have visibility into other AI agents …"}
```

`ai_slack_message` holds exactly one row for that thread,
`prompt_slack_ts = 1786108600.280039` — the root. `1786108658.474869` has no row
anywhere.

**Provenance evidence** — the `find` predicate is byte-identical on `main` and
every branch of the stack (see KI-18's counts; the whole `handleAgentSelection`
body is untouched by `zap-798..805`).

**Suggested owner** — its own PR off `main`, with KI-18. Carry the triggering
message's `ts` through the `select_agent` action `value` (it already carries
`agentUuid`, `channelId` and `shouldSkipForwardingQuery`) instead of
re-deriving it from thread history — the handler already parses that JSON at
`:15825-15830`.

## KI-20 — follow-up tool buttons can never render

**Status** open · **Severity** low · **Provenance** `main`

`getFollowUpToolBlocks`
(`packages/backend/src/ee/services/ai/utils/getSlackBlocks.ts:440-471`) is called
on every Slack answer (`AiAgentService.ts:12248`) but returns `[]` unless the
turn's chart artifact carries a non-empty `followUpTools` array in its
`chartConfig`:

```ts
if (!artifacts || artifacts.length === 0) return [];
const chartArtifact = artifacts.find((artifact) => artifact.chartConfig);
if (!chartArtifact || !chartArtifact.chartConfig) return [];
// … 'followUpTools' in chartArtifact.chartConfig …
if (!activeSavedFollowUpTools.length) return [];
```

`followUpTools` is declared only by the **legacy** visualization tool arg
schemas — `toolVerticalBarArgs.ts`, `toolTimeSeriesArgs.ts`, `toolTableVizArgs.ts`
and `toolDashboardArgs.ts` (which hardcodes `[]`). None of them is registered any
more: `grep -rn 'toolVerticalBarArgs\|toolTimeSeriesArgs\|toolTableVizArgs'
packages/backend/src | grep -v '\.test\.'` returns **nothing**. The live agent
registers a single visualization tool, `generateVisualization`
(`agentV2.ts:51,789,1053`), whose args contain no `followUpTools` field —
confirmed against a real tool call logged in run 003:

```
generateVisualization (ARGS: {"title":…,"description":…,"queryConfig":{…},
 "chartConfig":{"defaultVizType":"table","xAxisDimension":null,"yAxisMetrics":[…],
  "groupBy":null,"xAxisType":null,"stackBars":null,"lineType":null,
  "xAxisLabel":"","yAxisLabel":"Customers",
  "secondaryYAxisMetric":null,"secondaryYAxisLabel":null}})
```

So the block builder, `activeFollowUpTools`, `followUpToolsText` and the
`execute_follow_up_tool.*` action handlers (`AiAgentService.ts:14441-14470`) are
all live code that can never be reached.

**Repro** — ask any chart-producing question in Slack and look for the
`❓ What would you like me to do next?` context block. It never appears.
Corroborating query:

```sql
SELECT count(*) FILTER (WHERE chart_config::text LIKE '%followUpTools%'),
       count(*) FROM ai_artifact_versions;
```

→ `0 | 6` across every artifact produced by runs 001–003.

**Consequence for testing** — matrix cell **G7.4** ("follow-up tool button →
new prompt attributed to the bot user") is not merely unrun, it is
**unreachable**. It should be marked blocked-on-KI-20 rather than deferred to a
human again.

**Decision needed** — either re-emit `followUpTools` from
`generateVisualization` (or derive the follow-ups from the artifact's result
type), or delete the follow-up-tool block builder, its action handlers and G7.4
together. Leaving it half-wired means every future run re-discovers this.

**Provenance evidence** — `git diff main feature/zap-805 --
packages/backend/src/ee/services/ai/tools/generateVisualization.ts` is empty. The
stack does touch `getSlackBlocks.ts`, but only to extract
`isAnswerProducingTool` out of `getFeedbackBlocks` (`+4 −1`);
`getFollowUpToolBlocks` is byte-identical to `main`. Pre-existing.

**Suggested owner** — its own PR off `main`.

---

## Notes from run 001 not filed above

- **G8.3 was an invalid test.** The dedup key is
  `(slack_channel_id, prompt_slack_ts)` (`AiAgentV3Model.ts:986-991`), so two
  identical *posts* have different `ts` and are correctly two threads. Dedup only
  guards redelivery and message edits, which is G1.6's cell. Fix the matrix.
- **"3 poisoned threads" was a miscount** — the query counted only v3
  `ai_thread_message` rows, so v1 threads (which store `ai_prompt` rows) looked
  empty. Exactly one thread was orphaned.
- **`AiDuplicateSlackPromptError` is still silent in Slack** by design (a
  redelivery or edit already has an answer), but is no longer undiagnosable: the
  handler now logs `Ignored duplicate Slack prompt: channel=… promptTs=… threadTs=…`
  (`AiAgentService.ts:15387-15393`). The matrix's "known-bad going in" entry can
  be closed.
- **G1.7 notify-once-then-silent is intended.** `claimLegacySlackArchivedNotice`
  claims the notice atomically and `LegacySlackThreadArchivedError` carries
  `shouldNotify`, so later replies to an archived v1 thread are silent on purpose.
