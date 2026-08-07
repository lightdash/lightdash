# Slack v3 test matrix (ZAP-805)

Scenario list. Environment, test agents, levers, async-polling and teardown live in
[SLACK_TEST_FIXTURES.md](./SLACK_TEST_FIXTURES.md). Results per run in
`SLACK_TEST_RUN_*.md`.

Channel **A** = `#gio-agent-playground` `C08H61KB0LQ` (the multi-agent channel).
Channel **B** = `#gio-agent-playground-2` `C0BN96J4763`.

## Matrix

### G1 — single agent mapped to a channel (B, not multi-agent) — P0

| # | Trigger | Expected |
|---|---|---|
| 1.1 | root @mention + question | **one** posted message per turn: `plan` task card (opened by `chat.startStream` on the first tool call) converted in place into header + answer + chart `card` + feedback row. Status is `assistant.threads.setStatus`, ephemeral, never a message. Chart vs CSV is an XOR on `chartConfig.defaultVizType` — see KI-09 |
| 1.2 | threaded @mention follow-up | same agent, **no** re-routing, no confirmation |
| 1.3 | plain reply in thread (no @) | **ignored**, zero Slack output |
| 1.4 | plain root message in B | **ignored** |
| 1.5 | bare `@HAL9000` | `EMPTY_PROMPT_WELCOME`, no prompt row written |
| 1.6 | edit a delivered message | silent (`AiDuplicateSlackPromptError`) |
| 1.7 | follow-up in a v1 thread | archived notice **once**, silent thereafter — P2 |

### G2 — multiple agents, none mapped, B not multi-agent — P1

| # | Precondition | Expected |
|---|---|---|
| 2.1 | `require_explicit_slack_channel_linking = true` | ephemeral 🔒 "ask an admin" |
| 2.2 | linking off, N manageable | dropdown "pick one to answer here"; click → links + answers |
| 2.3 | exactly 1 manageable | auto-links, `✅ Linked X`, answers in the same pass |
| 2.4 | 0 agents visible | "🤔 There are no AI agents in this organization yet" |

### G3 — multi-agent channel / router (A) — P0

| # | Trigger | Expected |
|---|---|---|
| 3.1 | N candidates, clear question | LLM picks, `You're now chatting with *X*`, then answer |
| 3.2 | meta-query ("which agents are available?") | low confidence → agent picker UI, **no** prompt row |
| 3.3 | click picker | `✅ You selected: X` then answer |
| 3.4 | exactly 1 candidate | auto-select, **no** confirmation message |
| 3.5 | 0 candidates | `⚠️ No AI agents are available…` |
| 3.6 | plain message, no @mention | answered (multi-agent channel only) |
| 3.7 | plain threaded reply | ignored |
| 3.8 | @mention follow-up in existing thread | thread's agent, no re-route |
| 3.9 | first message in thread | one-time 💬 continue-tip |

### G4 — providers — P0

| # | Trigger | Expected log line |
|---|---|---|
| 4.1 | route to `ZAP-805 OpenAI` | `AI usage: … provider=openai model=gpt-5.4-2026-03-05` |
| 4.2 | route to `ZAP-805 Anthropic` | `AI usage: … provider=anthropic model=claude-sonnet-5` |
| 4.3 | follow-up on the Anthropic thread | stays anthropic |
| 4.4 | both candidates in A, steer each way | selector picks by topic; provider follows the agent |

### G5 — OAuth — P1

| # | Setting | Expected |
|---|---|---|
| 5.1 | `ai_require_oauth = true` (current) | works for the linked user |
| 5.2 | `ai_require_oauth = false` | works, but log shows `Disabling runSql for Slack prompt …` |
| 5.3 | unlinked Slack user | ephemeral "Connect your Slack account" — **manual, needs a 2nd user** |

### G6 — thread access consent — P1

| # | Setting | Expected |
|---|---|---|
| 6.1 | consent on, prior human msgs in thread | ingested as back-dated messages before the prompt |
| 6.2 | consent off | not ingested |

### G7 — interactions — P1/P2

| # | Trigger | Expected |
|---|---|---|
| 7.1 | 👍 / 👎 | block replaced with "marked this answer helpful/unhelpful" |
| 7.2 | 👎 → modal submit | feedback persisted |
| 7.3 | SQL approval card (OAuth on + `manage SqlRunner`) | approve / reject / approve-always |
| 7.4 | follow-up tool button | new prompt attributed to the **bot** user |
| 7.5 | artifact / explore link buttons | open correct Lightdash URLs |

### G8 — regression guards for the bug found today — P0

| # | Case | Expected |
|---|---|---|
| 8.1 | fresh thread after a poisoned one exists | works (poison is per-thread) |
| 8.2 | orphan window | **no orphans can be created** — the v1-aware orphan query returns 0 rows after a run (KI-03 closed this) |
| 8.3 | double-post identical text | **two distinct threads** — the dedup key is `(slack_channel_id, prompt_slack_ts)`, so distinct posts are never duplicates. Dedup only guards redelivery and edits (G1.6) |

## Known-bad going in

All three entries here are closed. The orphan window and the root-redelivery
constraint hit are fixed (KI-03, confirmed in run 002); `AiDuplicateSlackPromptError`
is still silent in Slack by design but now logs
`Ignored duplicate Slack prompt: channel=… promptTs=… threadTs=…`.

Defects found by run 001 — the system-agent fallback pre-empting the channel-link
picker (KI-01) and the compaction threshold reading cumulative billing totals
(KI-02) — are fixed and re-verified in
[SLACK_TEST_RUN_002.md](./SLACK_TEST_RUN_002.md). Full catalogue in
[KNOWN_ISSUES.md](./KNOWN_ISSUES.md).
