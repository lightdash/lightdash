# What predicts an accepted agent answer (fleet spike, 2026-09-03)

Second spike, second angle: not what customers ask, but what makes the agent's
answer get used. Ninety days of agent telemetry across the whole cloud fleet,
aggregate only, no customer identified.

## Short version

Acceptance is predicted by how the agent worked, not by how big or tidy the
semantic layer is. Four things move it, and they hold after removing internal
organisations and capping heavy ones: pinned context roughly doubles it, a
follow-up prompt in a thread converts more than twice as often as the first,
short trajectories beat long ones, and answers that reuse existing charts or
start by searching fields beat answers that start from metadata or fall back
to SQL. Semantic-layer size, formatting, group labels, agent scoping and agent
memory show no consistent effect. Labels themselves are the biggest gap: only
1% of prompts get a thumb and 4% a chart action, so the product cannot yet see
most of its own successes.

## Data

| | |
|---|---|
| Window | 90 days to 2026-09-03 |
| Source | `analytics.ai_agent_usage` (prompts, tool calls, feedback, chart actions, memory, agent lifecycle), `ai_token_usage` (model, provider, tokens), raw `project_compiled` (semantic-layer counts), `projects`, `organizations` |
| Unit | one prompt, keyed by the tool-call `prompt_id`; feedback and chart actions join on `message_id` (786 of 867 feedback, 3,293 of 3,367 chart actions) |
| Size | 67,345 prompts, 37,379 threads, 250 organisations, 885 agents, 2,994 users; 3% from internal orgs, excluded from the modelling |
| Outcome A | chart action: the person opened the answer in the explorer or saved it as a chart. Web only, only after a visualisation. 7.3% of visualisation prompts |
| Outcome B | thumbs: explicit score. 636 prompts, 62% up. Used as the second opinion |
| Concentration | the ten largest organisations produce 51% of prompts; 84 organisations have 100 or more |

Tool sequences per prompt were reduced to flags: searched fields (grep,
discover, semantic search), read metadata, searched values, ran SQL or listed
warehouse tables, reused content (find, read, run saved chart), read a
knowledge document, regenerated the visualisation, and the number of tool
calls. Logistic regressions cluster standard errors by organisation.

## What moves acceptance

Chart-action rate on visualisation prompts, external organisations, with the
odds ratio from the full model (and from the model with each organisation
capped at 300 prompts).

| Lever | Without | With | Odds ratio (capped) |
|---|---|---|---|
| Pinned context on the thread | 6.5% | 16.1% | 1.92 (1.67) |
| Follow-up prompt vs first prompt in thread | 4.7% first | 11.1% follow-up | first: 0.45 (0.63) |
| Reused existing content | 7.0% | 12.4% | 1.71 (1.40) |
| Started by searching fields | | | 1.46 (1.25) |
| Fell back to SQL / warehouse tables | 7.5% | 2.3% | 0.46 (0.62) |
| Each doubling of tool calls | | | 0.79 (0.75) |

Trajectory length is the cleanest curve: one-tool answers get acted on 10.5%
of the time, three to eleven tools sit around 6 to 7%, twelve or more fall to
5%. The thumbs agree more strongly: 67 to 74% up at one to three tools, 31 to
35% at twelve or more (odds ratio 0.48 per doubling, p < 0.001).

Tool order matters as well as count. Patterns that start with
`discoverFields` or `grepFields` and go through `searchFieldValues` reach 9 to
11%; patterns that start with `getMetadata` reach 3.5 to 4.3%. The agent that
looks around before it commits does better, which is the same lesson
AfterQuery reports from terminal agents.

Pinned context holds inside every tier: Pro 13.6% pinned vs 4.2% not,
Enterprise 24.9% vs 11.7%, Starter 13.2% vs 4.1%.

## What does not

| Feature | Result |
|---|---|
| Metrics count, models count, metrics per model | no consistent effect after controls (odds ratios 1.06 and 1.11, not significant) |
| Formatted-field share, URLs, group labels, compile errors | bucket differences are org confounds; nothing survives the model |
| Agent scoped to tags | none (1.06 / 1.21, not significant) |
| Agent memory generated | none (0.86 / 1.10) |
| Reasoning tokens | none |
| Knowledge documents | negative in the uncapped model (0.48), gone when capped; used by few organisations, so an org effect |
| Regenerating the visualisation | mildly negative, not significant once tool count is in |

Two segment effects are real but are not levers: Enterprise-tier and
self-hosted organisations act on answers about twice as often as Pro and cloud
(13.7% vs 4.8%; 14.1% vs 6.7%), and paying organisations act less per prompt
than trials (heavier, more routine use). Compare within segment.

Model and provider cannot be separated from organisation with this data.
OpenAI-served prompts have a higher chart-action rate (odds ratio for Anthropic
0.56 uncapped, 0.75 capped) but thumbs are equal (0.93, not significant).
One number worth a look on its own: prompts served by claude-sonnet-5 were
thumbed up 42% of the time (n=115) against 72% for claude-sonnet-4-6 and
claude-opus-4-7 (n=92, 57).

## Adoption

| | |
|---|---|
| Weekly active organisations | 79 in the second week of June to 118 in the last week of August |
| Weekly active users | 358 to 774 |
| Users with 2+ active weeks | 51%; 4+ weeks: 21% |
| Organisations with 4+ active weeks | 49% |
| Organisations with prompts but none in the last 30 days | 28% |
| Agents with 50+ visualisation prompts | 107; median chart-action rate 7.4%; 17 have zero |

August volume doubled while active organisations grew 10%, and the
chart-action rate halved (10.4% in June and July to 5.0%); thumbs-up share
stayed at 61 to 65%. The dilution comes from a few high-volume organisations,
not from answers getting worse.

At organisation level, SQL fallback is the one project-side signal tied to
retention: the five organisations where more than a quarter of prompts hit
SQL have a median of 4 active weeks against 9 for the rest, and SQL share
correlates negatively with active weeks (r = −0.25) and with semantic-layer
size (r = −0.20). When the agent cannot find it in the semantic layer, people
leave.

## What this implies

1. **Pin context by default.** The single largest lever, consistent in every
   tier. Suggest pinning the dashboard or chart the person came from, and
   start threads from content rather than from a blank prompt.
2. **Ask before you act.** First prompts convert at less than half the rate of
   follow-ups, and long trajectories lose. An agent that asks one clarifying
   question early, or proposes the explore and fields before running, would
   turn first prompts into second prompts.
3. **Search fields first, metadata second.** Encode the tool order that wins
   into the default instructions. It costs nothing.
4. **Prefer existing charts.** Answers built from saved content are acted on
   nearly twice as often. Search content before building from scratch.
5. **Treat SQL fallback as a semantic-layer gap, not an answer.** Log it per
   project, surface it to the project owner as "questions the model could not
   answer", and feed it to the verticals work. It is the one signal tied to
   churn.
6. **Capture acceptance.** Thumbs cover 1% of prompts. Cheap signals exist
   already: opened in explorer, saved, added to a dashboard, copied, thread
   continued versus abandoned, and steer or interrupt. Make them the outcome
   label and this analysis becomes a live readiness score instead of a spike.
7. **Stop selling semantic-layer size as AI readiness.** Nothing about model
   or metric counts predicted acceptance. Coverage of the questions people
   ask does, and that is measured by SQL fallback, not by counts.

## Caveats

- Chart action is a proxy for "used", not "correct". A wrong chart can be
  explored; a correct number can be read and left.
- Labels are sparse and web-only for chart actions; Slack acceptance is only
  visible through thumbs.
- Model choice, tier and organisation are entangled; the capped model reduces
  but does not remove this.
- Trajectory length is partly caused by hard questions, not only by a poorly
  set-up agent.
- Project features come from the latest compile event and may lag the state at
  prompt time.

## Reproduce

Queries and scripts are in this directory's `ai-success/` folder: `prep.py`
builds the prompt table from the analytics warehouse via `bq`, `analyse.py`
and `analyse2.py` produce every table above. Aggregate output only; the
prompt-level extract is not committed.
