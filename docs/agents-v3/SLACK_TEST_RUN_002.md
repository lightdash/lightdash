# Slack agent test run 002

| | |
|---|---|
| Date | 2026-08-07, ~12:20–13:00 UTC |
| Branch / commit | `feature/zap-805` @ `e05b1999f1` ("feat: run Slack agent on v3") |
| Working tree | dirty — four uncommitted fixes under test (see below) |
| Build | `pnpm -F common build` then full dev-server restart; measured on pid 73680 (12:20:13) and pid 84539 (12:56:02) |
| Flags | `ai-agent-v3`, `ai-agent-slack-modern-blocks` ON throughout; `ai-slack-system-agent-fallback` ON except for the G2.2–G2.4 / G3.5 batch |
| Fixtures | [SLACK_TEST_FIXTURES.md](./SLACK_TEST_FIXTURES.md) |
| Matrix | [SLACK_TEST_MATRIX.md](./SLACK_TEST_MATRIX.md) |
| Prior run | [SLACK_TEST_RUN_001.md](./SLACK_TEST_RUN_001.md) |
| Executed by | automated harness driving Slack, psql and backend logs |

**34 PASS · 1 FAIL · 0 BLOCKED · 2 NOT RUN**

All 37 matrix cells are accounted for. Every cell that run 001 recorded as FAIL or
BLOCKED for a product reason now passes.

The nine cells originally deferred to the human-assisted batch were executed on
2026-08-07 ~13:16–13:19 UTC and adjudicated afterwards (see
[Human-assisted batch — results](#human-assisted-batch--results)). Six passed,
**G3.6 failed** — the first time that cell has ever been adjudicated — and two
could not be exercised. G3.6 and the follow-up investigation produced four new
defects: **KI-17, KI-18, KI-19, KI-20**.

## Fixes under test

1. **Channel-link gate ordering** — `resolveAgentForUnmappedSlackChannel`
   (`AiAgentService.ts:14888`) evaluates `require_explicit_slack_channel_linking`
   *before* `resolveSystemAgentForSlack` (`:14925`). KI-01.
2. **Compaction threshold** — `AiAgentV3TokenUsage` envelope at `version: 2`
   carries `contextTokens` (final step only) alongside the cumulative billing
   totals; the trigger reads `contextTokens`. KI-02.
3. **Slack redelivery idempotency + atomicity** — thread + first message created
   in one transaction under `pg_advisory_xact_lock(hashtext(channelId))` on both
   storage versions; root redelivery adopts an existing thread. KI-03.
4. **v1 lock + error-mapping parity** — matching private helpers on
   `AiAgentModel` and `AiAgentV3Model`.

## Results

### G1 — single agent mapped to channel B

| # | Verdict | Observed |
|---|---|---|
| 1.1 | PASS | Thread `5c4a8115`. One streamed message `1786105328.721429` carrying `plan` (title "Answered", per-tool tasks complete) → `header` → `rich_text` answer → `card` (`ai_agent_chart_card_…`, "Open in Lightdash") → `context_actions` feedback buttons. A second message carries `lightdash-results.csv`. Matches the corrected expectation (KI-09), not the matrix text |
| 1.2 | PASS | Follow-up appended as seq 3/4 in the same thread, agent unchanged, no confirmation block |
| 1.3 | PASS | Plain in-thread reply `1786105416.232899` — message count stayed at 4, no reply |
| 1.4 | PASS | Plain root `1786105423.262699` — no `ai_slack_thread` row |
| 1.5 | **PASS** | Hand-typed bare `@HAL9000` → `Hi! 👋 What would you like to know? Ask me a question about your data and I'll take a look.` (`EMPTY_PROMPT_WELCOME`). No prompt row written. The guard at `AiAgentService.ts:17247` is reachable after all — it just needs a message the MCP cannot produce |
| 1.6 | **PASS** | Editing an already-delivered message produced **no bot output at all** — silent, as designed (`AiDuplicateSlackPromptError`). This is the **only** empirical coverage of the redelivery / duplicate-guard path anywhere in runs 001–002: Bolt's early ack (`SlackClient.ts:1614`, no `processBeforeResponse`) makes a true redelivery unreachable from any harness, so the message edit is the sole product path that re-fires `app_mention` on an already-consumed `ts` |
| 1.7 | PASS | Synthetic `storage_version = 1` thread at `1786105481.239579`. First @mention → "This conversation is archived…" at `1786105512.242539`, `archived_notice_sent_at = 12:25:12.014853+00`. Second @mention → **no reply**. Notify-once-then-silent confirmed end to end (run 001 only had circumstantial evidence) |

### G2 — multiple agents, none mapped, B not multi-agent

Channel B was unmapped for this group; `ai_agent_slack_integration` empty.

| # | Verdict | Observed |
|---|---|---|
| 2.1 | **PASS** (was FAIL) | `require_explicit_slack_channel_linking = true`, fallback flag **ON**. `1786106658.598829` → no `ai_slack_thread` row, **no auto-created `Lightdash Assistant`** (`SELECT count(*) FROM ai_agent WHERE is_system` = 0), no channel-visible reply. The 🔒 ephemeral is `chat.postEphemeral` so it cannot be read back through the API; the absence of both a thread and a system agent is what the fix predicts, and `slackChannelLinkStrictMode.test.ts` covers the message text |
| 2.2 | **PASS** (was BLOCKED) | Flag OFF, 2 manageable agents. `1786106751.293659` → `:link: *No agent is linked to this channel yet.* Pick an agent to answer questions here — this links it to <#C0BN96J4763> for everyone.` with a `static_select` `link_channel_agent` listing both agents under the "Jaffle shop" option group. No thread row, no system agent. The **click** half is unclickable from the harness — folded into the human batch |
| 2.3 | **PASS** (was BLOCKED) | Flag OFF, exactly one agent in the org. `1786107213.926089` → `:white_check_mark: Linked *ZAP-805 OpenAI* (Jaffle shop) to <#C0BN96J4763> — it now answers here.` at `+1.5s`, then the answer ("There are *151 orders*") in the same pass, then the CSV. `ai_agent_slack_integration` went 0 → 1 |
| 2.4 | **PASS** (was FAIL) | Flag OFF, zero agents in the org. `1786107282.940619` → `:thinking_face: There are no AI agents in this organization yet. Create one at <https://gio.lightdash.dev/ai-agents> to start answering questions in Slack.` No system agent created |

### G3 — multi-agent channel / router (A)

| # | Verdict | Observed |
|---|---|---|
| 3.1 | PASS | `Agent selected by LLM {"agentName":"ZAP-805 OpenAI","confidence":"high","shouldSkipForwardingQuery":false}`. Slack: `section` "You're now chatting with *ZAP-805 OpenAI*" + description + divider, then answer + card + CSV |
| 3.2 | PASS | Meta-query → `{"agentName":"ZAP-805 Anthropic","confidence":"low","shouldSkipForwardingQuery":true}` → `:robot_face: *Which AI agent would you like to chat with?*` with `static_select` `select_agent`. **No** `ai_slack_thread` row |
| 3.3 | **PASS** (with defects behind it) | `@HAL9000 which agents are available here?` at `1786108600.280039` → picker posted at `1786108604.822399`; clicking `ZAP-805 Anthropic` rewrote that same message in place to `:white_check_mark: You selected: *ZAP-805 Anthropic*` (`chat.update`, `AiAgentService.ts:15950-15963`). The visible contract holds. What happens *next* does not — see KI-18/KI-19 |
| 3.4 | PASS | Candidate set reduced to 1 via `admin_only` + `ai_require_oauth = false`. `1786106626.511399` → blocks were `plan, rich_text, card, context_actions` — **no** "You're now chatting with" section. Auto-selected silently |
| 3.5 | **PASS** (was FAIL) | Flag OFF, both agents `admin_only` under OAuth-off → 0 candidates. `1786106798.908159` → `:warning: No AI agents are available. Please contact your administrator to configure agents.` No system agent created |
| 3.6 | **FAIL** | Hand-typed plain message `how many customers do we have?` at `1786108626.117079` in **A** → no reply, `reply_count` absent, no `ai_slack_thread` row. **Cause: the Slack app is not subscribed to the `message.channels` bot event, so `handleMultiAgentChannelMessage` never runs.** Not a guard, not `channel_type`, not `bot_id` — the handler is unreachable. Confirmed in run 003 probing: **KI-17** |
| 3.7 | PASS | Genuine plain threaded reply `1786107637.451249` in A — thread reply count unchanged at 3 bot messages, no new reply. Non-vacuous this time |
| 3.8 | PASS | Orders/revenue question posted into the Anthropic thread `359db9f7` → seq 5/6 appended, `ai_thread.agent_uuid` still `ZAP-805 Anthropic`, no re-route, no confirmation |
| 3.9 | PASS | `:speech_balloon: *Tip:* To continue this conversation, just tag <@U08GTG2AWF3> in this thread!` posted once, as the last message of the first turn (`1786105589.948509`) |

### G4 — providers

| # | Verdict | Observed log line |
|---|---|---|
| 4.1 | PASS | `AI usage: feature=agent provider=openai keyManagement=lightdash-managed model=gpt-5.4-2026-03-05 inputTokens=4807 …` |
| 4.2 | PASS | `AI usage: feature=agent provider=anthropic keyManagement=lightdash-managed model=claude-sonnet-5 inputTokens=5735 …` |
| 4.3 | PASS | Turn 2 on the same thread stayed `provider=anthropic model=claude-sonnet-5` (`inputTokens=15661`) |
| 4.4 | PASS | Revenue question → `ZAP-805 OpenAI`; customer-count question → `ZAP-805 Anthropic`; both `"confidence":"high"`. The selector itself always runs `feature=agent-selector provider=openai model=gpt-5.4-2026-03-05` |

### G5 / G6 — OAuth and consent

| # | Verdict | Observed |
|---|---|---|
| 5.1 | PASS | The whole run except the two candidate-count cells executed under `ai_require_oauth = t` with `userId=b264d83a-9000-426a-85ec-3f9c20f368ce` attributed on every `AI usage` line |
| 5.2 | PASS | `ai_require_oauth = false` → `Disabling editDbtProject for Slack prompt d45c37a8-… because aiRequireOAuth is off.` Answer still delivered (thread `4aad1212`, assistant `completed`) |
| 5.3 | **NOT RUN** | No second Slack account without a Lightdash identity was available. Unchanged from the plan; not a defect signal either way |
| 6.1 | PASS | Consent on. Two prior plain messages ingested as back-dated `user` rows seq 1 and 2 ahead of the @mention at seq 3; agent answered "The secret build token is **ZEBRA-7741** and the project codename is **ORCHID**." |
| 6.2 | PASS | Consent off. Only the @mention row exists (seq 1); agent answered `NONE` |

### G7 — interactions

| # | Verdict | Observed |
|---|---|---|
| 7.1 | **PASS** | 👍 clicked on a delivered answer; the feedback row was replaced with the "marked this answer helpful" confirmation |
| 7.2 | **PASS** | 👎 opened the downvote modal; the modal submitted and the feedback persisted |
| 7.3 | **PASS** | The SQL approval card rendered and **Approve** resumed the parked run to completion |
| 7.4 | **NOT RUN** | **No follow-up suggestion buttons appeared under any answer in the entire run**, so there was nothing to click. This is structural, not luck — see KI-20. `getFollowUpToolBlocks` (`getSlackBlocks.ts:440-471`) returns `[]` unless the chart artifact's `chartConfig` carries a non-empty `followUpTools` array, and the only tool in the live agent, `generateVisualization`, does not emit that field. `SELECT count(*) FILTER (WHERE chart_config::text LIKE '%followUpTools%'), count(*) FROM ai_artifact_versions` → **0 of 6**. So the answer to "are follow-up buttons expected to appear at all in this configuration?" is **no** |
| 7.5 | PASS | Card `hero_image.image_url` = `https://gio.lightdash.dev/api/v1/slack/card-image/TCyqkVc-70VPSO4-GIbZB` → `200 image/png 47414 bytes`. "Explore in Lightdash" button → `/share/gRq7q5ToGPcw9cQtmfe5Q` → resolves to a `create_saved_chart_version` URL on the `orders` explore, matching the artifact. Same for the `payments` artifact in G3.1 (`/share/KdZxpHcsK_xqqBy1lGJ33` → `payments_total_revenue`) |

### G8 — regression guards

| # | Verdict | Observed |
|---|---|---|
| 8.1 | PASS | An artificial orphan (`ai_thread` + `ai_slack_thread`, zero messages, `1700000000.000001`) was inserted, then a fresh root @mention created thread `0483dc39` and completed normally |
| 8.2 | **PASS**, cell obsolete | The orphan window is closed. Over 14 real `ai_slack_thread` rows created across this run, the v1-aware orphan query returned **0 rows** at every checkpoint. The only orphan that ever existed was the one I inserted by hand. Recorded as "verify no orphans can be created", per the corrected expectation |
| 8.3 | **PASS**, matrix wrong | Two identical posts (`1786106200.062809`, `1786106205.281139`) → two distinct threads `490acb34` and `de5b6c42`, one user message each. Correct: the dedup key is `(slack_channel_id, prompt_slack_ts)`, so distinct posts are never duplicates |

## Fix verification — direct evidence

### Fix 1 (KI-01) — gate ordering

Five cells recovered (G2.1–G2.4, G3.5). The decisive counter-evidence to run 001
is that `SELECT count(*) FROM ai_agent WHERE is_system = true` stayed at **0**
for the whole run, including the `require_explicit_slack_channel_linking = true`
cell run with the fallback flag **ON**. Run 001 created three `Lightdash
Assistant` rows in the same conditions.

### Fix 2 (KI-02) — compaction threshold

The envelope is now `version: 2` and carries both figures:

```json
{"version": 2, "inputTokens": 137891, "totalTokens": 138578,
 "outputTokens": 687, "contextTokens": 35633,
 "reasoningTokens": 267, "cachedInputTokens": 132096}
```

The trigger log prints both. On the Anthropic thread `359db9f7`, turn 3:

```
[AiAgentV3][Compaction] thread=359db9f7-… check assistant=a4aaa16d-…
  contextTokens=75003 billedTotalTokens=221004 contextWindow=200000
  supportsCompaction=true error=none trigger=none
[AiAgentV3][Compaction] thread=359db9f7-… skipped reason=under-threshold
```

`claude-sonnet-5` threshold is `200000 − 16384 = 183616`. The old code compared
`billedTotalTokens = 221004`, which is **over** the threshold and would have
fired a spurious compaction on turn 3 of a three-message thread — exactly run
001's `totalTokens=229371` failure. The new code compares
`contextTokens = 75003` and correctly skips. The same separation shows on the
OpenAI thread (`contextTokens=32496` vs `billedTotalTokens=126344`,
`contextWindow=265000`).

KI-05 was **not** re-triggered: `contextWindow` matched the running model on both
threads (265000 for gpt-5.4, 200000 for claude-sonnet-5) because no agent
switched models mid-thread. The defect is unfixed, just not exercised.

### Fix 3 (KI-03) — redelivery idempotency + atomicity

- **Atomicity**: 14 `ai_slack_thread` rows created across the run, zero orphans
  at every checkpoint (v1-aware query).
- **Redelivery**: could **not** be exercised end to end. See "Redelivery is not
  reachable from the harness" below.
- **Unit coverage**: `slackRootPromptRedelivery.test.ts`,
  `slackLegacyThreadArchive.test.ts`, `slackThreadContext.test.ts`,
  `slackChannelLinkStrictMode.test.ts`, `v3Compaction.test.ts`,
  `AiAgentV3RunPersistence.test.ts` — **6 files, 46 tests, all pass**
  (`SKIP_TEST_SEEDS=true`, per KI-15).

### Fix 4 — v1 lock + error-mapping parity

Exercised indirectly by G1.7: the synthetic v1 thread took the `AiAgentModel`
lock + error-mapping path and produced the archived notice exactly once, then
went silent. No v1-specific failures anywhere in the run.

## Redelivery is not reachable from the harness

The tunnel-drop technique was executed as briefed and **does not produce a
duplicate delivery on this stack**.

Sequence: dropped `cloudflared` (edge returned `530`), posted
`1786106395.825939`, confirmed after 20s that no `ai_slack_thread` row existed —
so the first POST never reached the origin — restored the tunnel, and Slack's
retry landed at **12:41:05**, ~70s after the post. Result: exactly **1**
`ai_slack_thread` row, **1** `ai_slack_message` row, 2 `ai_thread_message` rows,
and **zero** `Ignored duplicate Slack prompt` log lines.

Root cause: `SlackClient.ts:1614` constructs `ExpressReceiver` without
`processBeforeResponse`, so Bolt acks Events API deliveries **before** running
the listener (`ack() call begins` / `ack() response sent` are logged immediately
after `authorize()`). Any request that reaches the origin gets a 200 within
milliseconds, so Slack never times out and never retries a delivery the app
actually saw. The only remaining product path to a duplicate is a **message
edit**, which re-fires `app_mention` on the same `ts` — that is matrix cell
**G1.6**, and it is human-assisted.

This is a harness limitation, not a defect. The technique is still worth keeping
for what it *does* do (deterministically delay a delivery); it is written up in
[SLACK_TEST_FIXTURES.md](./SLACK_TEST_FIXTURES.md#forcing-a-delayed-slack-delivery-tunnel-drop).

## Changes vs run 001

| Cell | Run 001 | Run 002 | Why |
|---|---|---|---|
| G2.1 | FAIL | PASS | Fix 1 — gate now precedes the fallback |
| G2.2 | BLOCKED | PASS | Fix 1 + fallback flag off; run 001 mislabelled it BLOCKED |
| G2.3 | BLOCKED | PASS | Same |
| G2.4 | FAIL | PASS | Fix 1 + fallback flag off |
| G3.5 | FAIL | PASS | Fix 1 + fallback flag off |
| G1.1 | PASS* | PASS | Expectation corrected per KI-09; the `plan` task card, chart card, CSV and feedback row were all captured this time by reading raw blocks instead of rendered text |
| G1.7 | not run | PASS | Executed against a synthetic v1 thread |
| G3.7 | PASS (vacuous) | PASS | Genuine plain threaded reply posted; no longer contingent on G3.6 |
| G7.5 | not run | PASS | Card image and share links resolved |
| G8.2 | NOT REPRODUCED | PASS (cell obsolete) | Fix 3 closed the orphan window; verified no orphans can be created |
| G8.3 | test invalid | PASS | Corrected expectation: distinct posts are distinct threads |
| G3.6 | FAIL (unconfirmed) | **FAIL (confirmed)** | Moved to the human batch, executed hand-typed, then root-caused: the `message` event is never delivered (KI-17) |

Everything run 001 passed still passes. Nothing regressed.

## Defects

**None new from the automated pass.** No existing KNOWN_ISSUES entry needed a
status change beyond the three already marked `fixed-in-tree` (KI-01, KI-02,
KI-03), all of which this run confirms behaviourally.

**Four new from the human-assisted batch** — KI-17, KI-18, KI-19, KI-20. All four
have provenance `main` (every symbol involved is byte-identical on `main` and on
every branch of the stack, including the two new bottom branches). See
[Human-assisted batch — results](#human-assisted-batch--results) for the
evidence and [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) for the entries. KI-04 and
KI-12 were amended rather than duplicated: both asserted that `message` events
reach the app, and KI-17 falsifies that.

One wording amendment to KI-09: with `ai-agent-slack-modern-blocks` on, a chart
result is **not** posted as a separate `lightdash-chart.png` message. `sendFile`
returns a URL that the answer's `card` block embeds as `hero_image` plus an "Open
image" button; only the table branch posts a visible file message
(`lightdash-results.csv`). The XOR in `runQuery.ts:285-323` is real, but the two
branches surface differently in Slack, which is why run 001 saw "CSV absent" on
one turn and present on another. Verified: `defaultVizType: "bar"` →
`hero_image` + no file message; `defaultVizType: "table"` → CSV file message + a
card with no `hero_image`.

## State left behind

Restored and verified:

| Thing | Value |
|---|---|
| `ai_require_oauth` | `t` |
| `ai_thread_access_consent` | `t` |
| `ai_multi_agent_channel_id` | `C08H61KB0LQ` |
| `require_explicit_slack_channel_linking` | `f` |
| `ai_agent.admin_only` | `f` on both agents |
| `.env.development.local` | byte-identical, `md5 a09a7a122015cfe35796cf7708ddeadd` |
| Feature flags | all three back on, verified on the running process env |
| Dev server | running on the fixed build, pid 84539 |
| `cloudflared` tunnel | restored, `https://gio.lightdash.dev/api/v1/health` → 200 |
| Orphaned Slack threads | 0 |
| System agents (`is_system`) | 0 |

Changed and **not** restored:

- The two `ZAP-805 *` agents were deleted for G2.3/G2.4 and **recreated** with
  new UUIDs and identical config. Their pre-G2.3 threads, prompts and artifacts
  cascaded away.
  - `ZAP-805 OpenAI` `14b3305c-fe58-4ea0-a115-59b39c7ce7a8` — openai / `gpt-5.4-2026-03-05`
  - `ZAP-805 Anthropic` `f4f92701-76e5-4829-8a07-fe69865e5f41` — anthropic / `claude-sonnet-5`
  - Both `enableSqlMode = true`, `admin_only = false`
- Channel **B** `C0BN96J4763` is mapped to the recreated `ZAP-805 OpenAI`.
- Channel **A** `C08H61KB0LQ` remains the multi-agent channel, unmapped.
- Test messages remain in `#gio-agent-playground` and `#gio-agent-playground-2`
  only. No other channel was touched.
- No source files were modified. Nothing committed.

`./scripts/reset-db.sh` reseeds if a clean baseline is wanted — but see the
human-assisted batch below, which needs this environment as-is.

## Human-assisted batch — results

**Executed 2026-08-07 ~13:16–13:19 UTC**, hand-typed in the Slack client against
the environment described below. Verdicts are folded into the per-group tables
above; the evidence and the two investigations that came out of it are below the
task list.

The task list as issued (kept for the record):

**The environment is already in the right state — do not change anything first.**
Required state (all verified, see "State left behind"): fallback flag ON,
`ai_require_oauth = t`, `ai_thread_access_consent = t`, channel **B**
`#gio-agent-playground-2` mapped to `ZAP-805 OpenAI`, channel **A**
`#gio-agent-playground` is the multi-agent channel with both agents available,
both agents have `enableSqlMode = true`.

Everything must be **hand-typed in the Slack client** — messages posted through
the MCP carry a `*Sent using* @Claude` attribution block, which is exactly what
makes several of these unreachable from the harness.

1. **G1.5** — in `#gio-agent-playground-2`, type only `@HAL9000` and send.
   Report the bot's reply verbatim (expected: an `EMPTY_PROMPT_WELCOME` message,
   and no new row in the thread list).
2. **G1.6** — in `#gio-agent-playground-2`, find the answered thread rooted at
   the message `R002-G8.1 fresh thread alongside an orphan: how many orders are
   there?`. **Edit your original message** (add a word) and send the edit. Report
   whether the bot posts anything at all (expected: complete silence — the edit
   re-fires `app_mention` on the same `ts` and hits
   `AiDuplicateSlackPromptError`).
3. **G3.3** — in `#gio-agent-playground`, type
   `@HAL9000 which agents are available here?`. The bot posts a
   "Which AI agent would you like to chat with?" dropdown. **Pick
   `ZAP-805 Anthropic`** from it. Report what appears next (expected:
   `✅ You selected: ZAP-805 Anthropic`, then an answer).
4. **G3.6** — in `#gio-agent-playground`, type a plain message with **no**
   `@HAL9000` mention, e.g. `how many customers do we have?`. Report whether the
   bot answers (expected: it does — plain messages are routed only in the
   multi-agent channel). This is the cell run 001 could not adjudicate.
5. **G3.7 cross-check** (30 seconds, optional) — reply to the thread from step 4
   with another plain, unmentioned message. Report whether the bot answers
   (expected: it does **not** — only new threads are routed).
6. **G7.1** — in `#gio-agent-playground-2`, type
   `@HAL9000 how many orders are there by status?`. When the answer arrives,
   click **👍 Good** on it. Report what the feedback row turns into (expected:
   the block is replaced with "marked this answer helpful").
7. **G7.2** — post the same question again, and this time click **👎 Bad**.
   A modal should open — fill it in and submit. Report (a) what the modal asked,
   (b) what the message looks like afterwards.
8. **G7.3** — in `#gio-agent-playground-2`, type
   `@HAL9000 run raw SQL: select count(*) from jaffle.orders`. The bot should
   post a SQL approval card. Click **Approve** on it. Report the card's buttons
   and what happens after approving. If you have time, repeat and try **Reject**
   and **Approve always** on separate messages.
9. **G7.4** — on any answer that shows follow-up suggestion buttons underneath,
   click one. Report whether a new turn runs, and paste the message so we can see
   who it is attributed to (expected: attributed to the **bot** user, not you).
10. **G5.3** — from a **second Slack account that has no Lightdash user**, type
    `@HAL9000 hello` in `#gio-agent-playground-2`. Report the ephemeral message
    that account sees (expected: a "Connect your Slack account" prompt with a
    link). Skip if no second account is available.
11. **G2.2 click half** (optional, do **last** — it changes state). Run
    `direnv exec . psql -c "DELETE FROM ai_agent_integration;"` to unmap channel B, then type
    `@HAL9000 how many orders are there?` in `#gio-agent-playground-2`. Pick
    `ZAP-805 Anthropic` from the "No agent is linked to this channel yet"
    dropdown. Report whether it links and answers in one pass. Afterwards the
    channel is mapped to `ZAP-805 Anthropic` instead of `ZAP-805 OpenAI`.

### Verdicts

| Step | Cell | Verdict | Result |
|---|---|---|---|
| 1 | G1.5 | PASS | `Hi! 👋 What would you like to know? Ask me a question about your data and I'll take a look.` |
| 2 | G1.6 | PASS | Edit of a delivered message → **no bot output at all**. Silent, as designed |
| 3 | G3.3 | PASS | Picker click → `✅ You selected: ZAP-805 Anthropic` → answer |
| 4 | G3.6 | **FAIL** | Plain hand-typed message → **no reply**. Root cause KI-17 |
| 5 | G3.7 cross-check | PASS | Plain threaded reply → still no reply. Vacuous, though: nothing routes plain messages at all (KI-17) |
| 6 | G7.1 | PASS | 👍 → block replaced with the "helpful" confirmation |
| 7 | G7.2 | PASS | 👎 → modal opened, submitted, feedback persisted |
| 8 | G7.3 | PASS | SQL approval card → **Approve** resumed and completed the run |
| 9 | G7.4 | **NOT RUN** | No follow-up buttons appeared on any answer. Structurally impossible here — KI-20 |
| 10 | G5.3 | **NOT RUN** | No second Slack account |
| 11 | G2.2 click half | not run | Optional, state-mutating; skipped to preserve the environment |

### Investigation 1 — why G3.6 fails (KI-17)

Run 001 recorded G3.6 FAIL-unconfirmed and blamed the harness; run 002 deferred
it. The hand-typed message rules out every explanation previously offered.

The failing event, straight from `conversations.history`:

```
ts=1786108626.117079  user=U08D7E4M51N  bot_id=None  subtype=None
thread_ts=None  reply_count=None  text="how many customers do we have?"
```

Every guard in `handleMultiAgentChannelMessage`
(`AiAgentService.ts:15442-15484`) provably passes for it:

| Guard | Value | Passes? |
|---|---|---|
| `event.subtype` | absent | ✅ |
| `'user' / 'text' / 'channel' in event` | all present | ✅ |
| `'bot_id' in event` | absent (hand-typed) | ✅ |
| `'thread_ts' in event` | absent (root post) | ✅ |
| `event.channel_type !== 'channel'` | `#gio-agent-playground` is **public** — `conversations.info` → `is_private: false, is_channel: true, is_group: false` → `channel_type: 'channel'` | ✅ |
| `teamId` | `T0163M87MB9` | ✅ |
| self-mention skip | no `<@U08GTG2AWF3>` in text | ✅ |
| `slackSettings` present | yes | ✅ |
| `aiMultiAgentChannelId === event.channel` | `C08H61KB0LQ` = `C08H61KB0LQ`, verified in `slack_auth_tokens` | ✅ |

So **KI-12 is not the cause** (the channel is public) and **no guard is the
cause**. The handler never runs, because the event never arrives.

Proof, run 003 on a freshly restarted server (pid 42142, 14:20:17), tunnel
healthy (`https://gio.lightdash.dev/api/v1/health` → 200):

1. Posted **three** plain messages — `1786112655.601839` and `1786112765.705379`
   in **A**, `1786112773.249639` in **B**.
2. Posted **one** `@mention` control — `1786112683.246439` in **A**.

Bolt's `App.processEvent` calls `this.authorize(source, bodyArg)`
(`@slack/bolt@3.22.0/dist/App.js:380,411`) at the top of event processing,
**before any listener middleware**, and at `logLevel: DEBUG` that emits
`Starting authorize() execution`. Across the whole run the log contains exactly
**one** such line:

```
[DEBUG]  OAuth:InstallProvider:0 Starting authorize() execution (source: {"userId":"U08D7E4M51N","isEnterpriseInstall":false,"teamId":"T0163M87MB9","conversationId":"C08H61KB0LQ"})
[DEBUG]   ack() call begins (body: undefined)
[DEBUG]   ack() response sent (body: undefined)
2026-08-07 14:24:45 [Lightdash][f0671393eda8a6dd92c2471edfc5ed41] info: Got app_mention event <@U08GTG2AWF3> [ZAP805-R003-control] how many customers do we have in total? …
```

Three plain messages → **zero** `authorize()` calls. The @mention → **one**,
not two: Slack sends `app_mention` **and** `message.channels` for a message that
mentions the bot in a channel it is in, so a single pair proves `message.channels`
is not being delivered either.

`message` events are therefore not reaching the app at all. The bot's **granted**
scopes are complete (`SELECT installation->'bot'->'scopes' FROM slack_auth_tokens`
→ `…,"channels:history","groups:history",…`, exactly as KI-04 found), but an
OAuth scope is not an event subscription. Subscriptions live in the Slack app
configuration; `getSlackOptions()` (`SlackClient.ts:274-290`) sets `scopes` and
nothing else, and the repo carries no Slack manifest, so nothing in the codebase
declares or verifies `message.channels`. Filed as **KI-17**.

Consequence for the catalogue: **KI-12 cannot be reproduced on any install in
this state** — its premise ("the install already holds `groups:history`, so the
events do arrive") is false. It stays open as a latent bug that becomes live the
moment KI-17 is fixed. **KI-11** likewise did not cause G3.6, but it is exactly
why two runs could not tell "guard fired" from "event never arrived".

### Investigation 2 — the duplicate agent-selection message (KI-18, KI-19)

Observed in thread `1786108600.280039`:

```
17:16:40  user   @HAL9000 which agents are available here?
17:16:44  HAL    ✅ You selected: *ZAP-805 Anthropic*        ← ts 1786108604.822399
17:17:38  user   @HAL9000 okay?
17:17:42  HAL    ✅ You selected: *ZAP-805 Anthropic*        ← ts 1786108662.909949
17:18:03  bot    You're now chatting with *ZAP-805 Anthropic*
17:18:08  bot    (answer)
17:18:09  HAL    💬 Tip: To continue this conversation, just tag @HAL9000 in this thread!
```

Verdict: **(a) a real defect**, and the mechanism is the task's hypothesis (c) —
the meta-query path never binds the thread. Two distinct defects, in fact.

`✅ You selected: *…*` appears at exactly **one** call site in the whole
codebase — `AiAgentService.ts:15959`, inside a `chat.update` in the `select_agent`
block-action handler. So each of those two messages **is a picker message that
was clicked and rewritten in place**; the two distinct `ts` values mean two
pickers were posted and two clicks happened. The second picker's `ts`
(`…662.909949`, 4.4 s after `okay?`) matches the ~4 s `feature=agent-selector`
round trip measured elsewhere in this run.

Why a second picker at all: `handleAgentSelection` rewrites the picker, then

```ts
// AiAgentService.ts:15973-15978
if (shouldSkipForwardingQuery) {
    Logger.info(`Skipping query forwarding for meta-query in agent selection`);
    return;
}
```

On a meta-query the click **returns before `createAndScheduleSlackPromptFromAction`**,
so no `ai_thread`, no `ai_slack_thread`, and no `ai_thread.agent_uuid` is ever
written. Nothing anywhere records that this Slack thread is bound to
`ZAP-805 Anthropic`. Run 002's own G3.2 saw the same thing from the other side
("**No** `ai_slack_thread` row"). The confirmation is theatre: it tells the user
a selection was made and then discards it. The next `@mention` in that thread
finds an unbound thread and re-enters selection from scratch. Filed as **KI-18**.

The DB confirms the timing exactly — the thread was created by the **second**
click, not the first:

```
ai_thread 19e514df-f07a-4bb5-ab0d-338670e355a7
  agent_uuid = f4f92701-… (ZAP-805 Anthropic)   created_at = 13:18:03.122051
```

`13:18:03.122` is the same instant as the `You're now chatting with` message.

And a second, independent defect surfaced in the same trace. The thread has only
two message rows, and the stored user prompt is **not** what the user asked:

```
thread_seq | role      | part | payload
1          | user      | text | {"text": "which agents are available here?"}
2          | assistant | text | {"text": "I don't have visibility into other AI agents …"}
```

`ai_slack_message` has exactly one row, `prompt_slack_ts = 1786108600.280039` —
the thread **root**. The user's actual follow-up `okay?`
(`1786108658.474869`) was never persisted, and the agent answered the original
meta-query instead. Cause: `handleAgentSelection` picks the prompt with

```ts
// AiAgentService.ts:15924-15936
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
the predicate is `return true`, so it always resolves to the thread root
regardless of which message triggered the picker. Filed as **KI-19**.

Net effect on the matrix: G3.3 passes on its stated expectation (click → `✅ You
selected: X` → answer) and G3.8 genuinely passes for threads created by the
*normal* LLM-selection path, which does bind `ai_thread.agent_uuid`. The picker
path is the one that leaves the thread unbound, and the matrix has no cell for
"follow-up after a picker selection". Worth adding one.

## Follow-ups

1. KI-01, KI-02, KI-03 are behaviourally confirmed fixed. They still need to be
   relocated to their owning branches per their provenance notes.
2. KI-05 (threshold reads the previous message's model) is still open and was not
   exercised — needs the explicit mid-thread model-switch repro.
3. KI-08 (Anthropic prunes at 120k, below our 183,616 threshold) is unchanged and
   still needs a decision. This run reinforces it: the Anthropic thread reached
   `contextTokens=75003` with `cacheReadTokens=272452` and never approached our
   threshold.
4. **KI-17 is the blocker for the whole plain-message feature.** Until
   `message.channels` is subscribed on the Slack app, G3.6 cannot pass and
   KI-12 cannot be reproduced. Fix that first, then re-run G3.6 and G3.7 — G3.7
   only "passes" today because nothing routes plain messages at all.
5. KI-11 (`handleMultiAgentChannelMessage` logs after every guard) did **not**
   cause G3.6, but it is why two runs could not distinguish "a guard fired" from
   "no event arrived". Diagnosing it needed Bolt's own `authorize()` debug line.
   A one-line `Logger.debug` naming the guard would have saved both runs.
6. KI-18 and KI-19 are both in `handleAgentSelection` and are worth fixing
   together — persist the selection, and forward the message that triggered the
   picker rather than the thread root.
7. KI-20: decide whether follow-up suggestion buttons are meant to survive the
   move to `generateVisualization`. Right now the block builder is live but can
   never produce output.
8. Consider whether `processBeforeResponse` should be set on the
   `ExpressReceiver`. Not doing so is what makes redelivery untestable, and it
   also means a listener crash is invisible to Slack. Behaviour question, not a
   defect. G1.6 is now the only path that exercises the duplicate guard at all.
9. Add a matrix cell for "@mention follow-up in a thread whose agent was chosen
   via the **picker**" — G3.8 only covers the LLM-selection path, which is why
   KI-18 survived two runs.

## Adjudication pass (2026-08-07 14:20–14:30 UTC)

The four probes that root-caused G3.6 ran after the Graphite reorganisation, on a
rebuilt server. Recorded here because they changed the environment slightly.

| Thing | State |
|---|---|
| Branch | `feature/zap-805` @ `110da8f5f3`. The stack gained two branches below `feature/zap-798`: `feature/slack-channel-link-gate-order`, `feature/slack-v1-write-lock` |
| Working tree | clean |
| Build | `pnpm -F common build`, then full restart. pid **42142**, started 14:20:17 |
| Levers | unchanged and re-verified: `ai_require_oauth = t`, `ai_thread_access_consent = t`, `ai_multi_agent_channel_id = C08H61KB0LQ`, `require_explicit_slack_channel_linking = f`, both agents `admin_only = f` |
| Agents | `ZAP-805 OpenAI` `14b3305c-…` and `ZAP-805 Anthropic` `f4f92701-…`, unchanged |
| `cloudflared` | had **died** at `14:09:33Z` (`no more connections active and exiting`) — the edge was returning 530. Restarted; `https://gio.lightdash.dev/api/v1/health` → 200 |
| Messages added | `1786112655.601839`, `1786112683.246439`, `1786112765.705379` in **A**; `1786112773.249639` in **B** |
| Threads added | one, from the @mention control: `908cff40-7c65-4345-a607-a9bd38ff23b5` (`ZAP-805 Anthropic`, answered `101` customers, `provider=anthropic model=claude-sonnet-5`) |
| Source files | none modified |

Two environment notes worth carrying forward:

- **`psql` must go through `direnv exec .`.** A bare `psql` connects to the
  `postgres` database, not `postgres2` (`PGDATABASE` in
  `.env.development.local`). The wrong database looks plausible — it has 96 seed
  agents and all-default Slack levers — and reads as "someone reset the DB".
  `docs/agents-v3/SLACK_TEST_FIXTURES.md` showed bare `psql` at the time of this
  run; it has since been corrected to `direnv exec . psql` throughout, with a
  warning at the top.
- The backend logs `There are more DB migrations than defined in the code …
  Current version: 20260806140000`. That migration,
  `20260806140000_add_ai_message_artifact_references.ts`, is applied to the dev
  DB but exists on **no branch** — only in dangling commit `98330b45d9`
  ("feat: port verified-artifact references to v3 storage"). The
  artifact-references workstream did not survive the Graphite reorganisation.
  Harmless for these tests (an extra table nothing reads), but it will not
  reproduce on a fresh DB.
