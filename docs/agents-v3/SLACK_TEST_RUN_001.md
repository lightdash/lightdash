# Slack agent test run 001

| | |
|---|---|
| Date | 2026-08-07, ~09:45–10:35 UTC |
| Branch / commit | `feature/zap-805` @ `397ec2e89c` ("feat: run Slack agent on v3") |
| Working tree | dirty — uncommitted v3 Slack changes included |
| Flags | `ai-agent-v3`, `ai-slack-system-agent-fallback`, `ai-agent-slack-modern-blocks` all ON |
| Fixtures | [SLACK_TEST_FIXTURES.md](./SLACK_TEST_FIXTURES.md) |
| Matrix | [SLACK_TEST_MATRIX.md](./SLACK_TEST_MATRIX.md) |
| Executed by | automated harness driving Slack, psql and backend logs |

**20 PASS · 4 FAIL · 6 BLOCKED · 4 skipped**

All 4 FAILs share one root cause (defect 1).

## Results

### G1 — single agent mapped to channel B

| # | Verdict | Observed |
|---|---|---|
| 1.1 | PASS* | Answer + chart card ("Orders by Status / orders chart / Open in Lightdash"). **No separate status message and no task card**; CSV absent on a 5-row result but present elsewhere (`lightdash-results.csv` F0BPK24CNTS in G3.1) |
| 1.2 | PASS | Follow-up stayed on the same agent, no confirmation block, thread `agent_uuid` unchanged |
| 1.3 | PASS | Plain in-thread reply ignored — zero replies, message count unchanged |
| 1.4 | PASS | Plain root message in B ignored, no `ai_slack_thread` row |
| 1.5 | BLOCKED | Empty-prompt guard unreachable from the harness |
| 1.6 | BLOCKED | No message-edit tool |
| 1.7 | not run (P2) | Pre-existing evidence: notice at 06:03:13Z, `archived_notice_sent_at` set, two later replies got nothing — consistent with notify-once-then-silent |

### G2 — multiple agents, none mapped

| # | Verdict | Observed |
|---|---|---|
| 2.1 | **FAIL** | With `require_explicit_slack_channel_linking = true`, expected the 🔒 ephemeral. Got a new `Lightdash Assistant` (`is_system=t`) auto-created, which answered "There are *4 returned orders*." |
| 2.2 | BLOCKED | `showChannelLinkAgentPicker` unreachable (defect 1) |
| 2.3 | BLOCKED | Same |
| 2.4 | **FAIL** | With 0 agents, expected "🤔 There are no AI agents in this organization yet". Got another auto-created `Lightdash Assistant` answering a content search |

### G3 — multi-agent channel / router

| # | Verdict | Observed |
|---|---|---|
| 3.1 | PASS | "You're now chatting with *ZAP-805 OpenAI*" → answer + chart + CSV. Log: `Agent selected by LLM {"confidence":"high"}` |
| 3.2 | PASS | Meta-query → `confidence":"low","shouldSkipForwardingQuery":true` → picker UI, **no** `ai_slack_thread` row |
| 3.3 | BLOCKED | Cannot click a Block Kit button |
| 3.4 | PASS | Single candidate auto-selected, **no** confirmation block, **no** `agent-selector` call in the log |
| 3.5 | **FAIL** | 0 agents → expected `⚠️ No AI agents are available…`; got an auto-created `Lightdash Assistant` |
| 3.6 | **FAIL (unconfirmed)** | Plain root message in A produced no reply, no DB row, **no log line at all**. See caveat below — likely harness artifact |
| 3.7 | PASS (vacuous) | Ignored, but passes for the wrong reason given 3.6 |
| 3.8 | PASS | Orders question inside the Anthropic thread stayed on `ZAP-805 Anthropic`, no re-route |
| 3.9 | PASS | 💬 continue-tip posted once, after the first turn only |

### G4 — providers

| # | Verdict | Observed |
|---|---|---|
| 4.1 | PASS | `provider=openai keyManagement=lightdash-managed model=gpt-5.4-2026-03-05 inputTokens=19873` |
| 4.2 | PASS | `provider=anthropic keyManagement=lightdash-managed model=claude-sonnet-5 inputTokens=9737` |
| 4.3 | PASS | Follow-up stayed anthropic (`inputTokens=5463`) |
| 4.4 | PASS | Orders Q → OpenAI agent; customers Q → Anthropic agent; both `confidence":"high"`, providers followed the agent. The selector itself always runs openai/gpt-5.4 (`feature=agent-selector`) |

### G5 / G6 — OAuth and consent

| # | Verdict | Observed |
|---|---|---|
| 5.1 | PASS | Whole run executed under `ai_require_oauth = t` with the real user attributed |
| 5.2 | PASS | `Disabling runSql for Slack prompt … because aiRequireOAuth is off.` (also `editDbtProject`, repo discovery). Answer still delivered |
| 5.3 | SKIPPED | Needs a second unlinked Slack user |
| 6.1 | PASS | Consent on: prior plain messages ingested as back-dated user rows before the prompt; agent recalled the planted token |
| 6.2 | PASS | Consent off: only the @mention row present; agent answered "NONE" |

### G7 — interactions

7.1, 7.2 BLOCKED (no button/modal automation). 7.3–7.5 skipped (P2).

### G8 — regression guards

| # | Verdict | Observed |
|---|---|---|
| 8.1 | PASS (partial) | Fresh threads worked alongside the orphan |
| 8.2 | **NOT REPRODUCED** | Posting into the orphaned thread **succeeded** — job completed, agent replied, 2 message rows written, no `Slack prompt already exists` in the log. The orphan was adopted, not rejected |
| 8.3 | test invalid | Two identical posts → two threads, two answers. Correct: dedup key is `(slack_channel_id, prompt_slack_ts)` (`AiAgentV3Model.ts:986-991`), so distinct posts are never duplicates |

## Defects

### 1. System-agent fallback pre-empts the channel-link picker — verified in code

`handleAppMention` calls `resolveSystemAgentForSlack` at `AiAgentService.ts:17185`,
and only reaches `showChannelLinkAgentPicker` (`:17198`) `if (!fallback)`. The
`require_explicit_slack_channel_linking` gate lives *inside* the picker
(`:14732` → `AiOrganizationSettingsService.ts:302`). Same ordering at `:16884`/`:16897`.

With `ai-slack-system-agent-fallback` on:
- `require_explicit_slack_channel_linking` is dead config
- `⚠️ No AI agents are available…` and `🤔 There are no AI agents…` are unreachable
- the bot silently creates an org-wide `Lightdash Assistant` and answers (3 created during this run)

Root cause of G2.1, G2.2, G2.3, G2.4, G3.5.

### 2. Spurious compaction on turn 2 of Anthropic threads — FIXED, original diagnosis was wrong

`getV3CompactionTrigger` (`v3Compaction.ts`) compared
`latestAssistant.metadata.tokenUsage.totalTokens` against
`contextWindowTokens - V3_COMPACTION_RESERVE_TOKENS`.

The first diagnosis here — "cache tokens are cumulative billing tokens, exclude
them" — was **wrong**. In AI SDK v6 `usage.inputTokens` is the *whole* prompt:
`@ai-sdk/anthropic` sets `inputTokens.total = input_tokens +
cache_creation_input_tokens + cache_read_input_tokens`, and `noCacheTokens` is
the uncached remainder. The captured line reads `noCache 565 + cacheRead 4864 =
5429 prompt`, `+ 87 output = 5516 totalTokens`. Cache reads *are* resident
context; excluding them would suppress compaction exactly when it is needed.

The real cause: `AiAgentV3RunPersistence` summed `step.usage` over every step of
the tool loop (`recordUsage`) and persisted `onFinish`'s `totalUsage` — both
cumulative across steps. Each step re-sends the whole prompt, so the billed
total compounds and passed 200k on a two-message thread (`totalTokens=229371`).
v1 never had this: it persists `result.usage` / `onFinish`'s `usage`, which is
the *final step* only.

Fix: the envelope now carries `contextTokens` (final step's prompt + output)
alongside the cumulative billing totals, and the threshold reads that.

### 3. Plain messages in the multi-agent channel — UNCONFIRMED

Zero `Got message event in multi-agent channel` lines during the run. But that
log statement sits at the **end** of the guard chain
(`AiAgentService.ts:15456`) and every guard above returns silently, so its absence
proves a guard fired — not which one, and not that no event arrived.

Most likely a harness artifact: MCP-posted messages carry
`*Sent using* @Claude` attribution and may include `bot_id`, which `:15418`
drops. **Needs one hand-typed plain message in `#gio-agent-playground` to
settle.** Do not treat as a product bug until then.

Adjacent, and real regardless: `SlackClient.getRequiredScopes()`
(`SlackClient.ts:253-271`) omits `channels:history` and `groups:history`, so a
*fresh* install cannot receive `message` events at all.

## Corrections to earlier analysis

**The orphaned-thread bug is narrower than first described.** It was called
"permanently poisoned". It is not: `getSlackThreadWriteContext` skips the lookup
only when `slackThreadTs` is `undefined`, which is true for a **root** mention.
A **reply** carries `thread_ts`, finds the orphan via `ai_slack_thread`, and
appends normally. The failure is confined to redelivery of the original root
event; the thread self-heals as soon as a human replies. Still worth fixing as a
redelivery-idempotency bug — pass `data.slackThreadTs ?? data.promptSlackTs` at
`AiAgentService.ts:11976` — but it is not a dead-thread class of bug.

**The "3 poisoned threads" count was wrong.** The query counted only
`ai_thread_message` (v3) rows, so v1 threads — which store `ai_prompt` rows —
appeared empty. Exactly 1 thread was genuinely orphaned.

## State left behind

Settings restored and verified against snapshot: `ai_require_oauth = t`,
`ai_thread_access_consent = t`, `ai_multi_agent_channel_id = C08H61KB0LQ`,
`require_explicit_slack_channel_linking = f`.

Not restored:
- **all 21 original agents deleted** (authorised — they were test data), with
  threads, prompts and artifacts cascaded away
- both `ZAP-805 *` test agents deleted
- `ai_agent_slack_integration` / `ai_agent_integration` now empty (`hal`'s
  mapping cascaded)
- one auto-created `Lightdash Assistant` (`3d16ad7f-8c5b-4782-a9cf-c1514ab3c5aa`,
  `is_system = t`) remains; the fallback recreates it on any mention

`./scripts/reset-db.sh` reseeds. No source files were modified. Posts went only
to `#gio-agent-playground` and `#gio-agent-playground-2`.

## Follow-ups

1. Fix defect 1 — order the explicit-linking gate ahead of the system-agent fallback.
2. ~~Fix defect 2~~ — done; threshold now reads `tokenUsage.contextTokens`.
3. Fix the redelivery idempotency at `:11976`.
4. Re-run G2.1–G2.4 and G3.5 with `ai-slack-system-agent-fallback` **off**. These
   were recorded as FAIL/BLOCKED only because the fallback pre-empted the path —
   they are not tooling-limited and should not have been labelled BLOCKED.
5. Human-assisted batch, run last per
   [SLACK_TEST_FIXTURES.md](./SLACK_TEST_FIXTURES.md#execution-order): G1.5, G1.6,
   G3.3, G3.6, G5.3, G7.1–G7.4.

Signed synthetic Slack payloads were considered as a way to automate the button
and edit cells and **rejected** — those stay in the human-assisted batch.
