# Autopilot context evaluation

## Decision

Keep the current context strategy pending full maintenance evaluations. The four
synthetic intake runs below finished without context/token-limit errors, but they
do not establish that a 120-step run fits the smallest supported model window.
No compaction, caps, model qualification, or rollout configuration changed.

The assumption that every tool result is bounded is incorrect:
`get_broken_content` returns **all root-cause groups**. Only each group's sample
(10 items), detail list (100 items), and errors per detail item (10) are capped.
The number of groups and the length of individual strings can still grow.

## Reproduce

Load development provider credentials without logging them, then run:

```sh
AUTOPILOT_EVAL_PROVIDER=openai \
AUTOPILOT_EVAL_MODEL=gpt-5.4 \
AUTOPILOT_EVAL_SCENARIO=context \
AUTOPILOT_EVAL_OUTPUT_DIR=/tmp/autopilot-context \
pnpm -F backend test:autopilot-provider
```

Use `anthropic` / `claude-sonnet-5` for the other recorded provider. Azure and
Bedrock accept their existing provider configuration but were not run here.
This makes paid model calls. Each case uses at most 12 steps, a 90-second
deadline, and no provider retries. It makes no application or warehouse writes.
Omit `AUTOPILOT_EVAL_SCENARIO` to run the original empty-project smoke instead.

The fixture has 350 broken charts and 12 stale dashboards:

- `shared-model`: 12 errors per chart on one model; hits the group sample,
  detail item, and per-item error caps.
- `many-models`: one error per chart across 350 models; exercises the uncapped
  group list separately from detail size.

It uses the real validation grouping and detail serialization helpers. Group
output is shaped like the service with every synthetic item visible. This is
not a seeded database, permission test, or live chart repair evaluation. The
runner receives a narrowed intake checklist: group summary, one model's detail,
stale dashboards, then a Slack summary. Model summaries must contain the chart
and dashboard counts, but are not a full semantic-quality evaluation.

## Observations — 2026-09-14

| Provider / model | Fixture | Steps | Peak input tokens | Cumulative input tokens | Largest tool result (UTF-8 bytes) | Time |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| anthropic / `claude-sonnet-5` | many-models | 4 | 86,887 | 264,987 | 200,317 | 17.4s |
| anthropic / `claude-sonnet-5` | shared-model | 4 | 87,168 | 195,191 | 209,567 | 14.2s |
| openai / `gpt-5.4-2026-03-05` | many-models | 5 | 52,959 | 212,983 | 200,317 | 9.6s |
| openai / `gpt-5.4-2026-03-05` | shared-model | 5 | 49,936 | 160,921 | 209,567 | 9.6s |

[Per-step JSON reports](evals/autopilot-context/2026-09-14) record model ID,
termination, elapsed time, input/output tokens, cumulative input tokens, and
result sizes. They contain synthetic summaries and tool names, not tool payloads
or provider request bodies. All four completed successfully with reported usage.

Peak per-call input usage measures the observed prompt footprint. Cumulative
input usage sums all calls and must not be compared with a context-window limit.
UTF-8 tool-result bytes are not tokens or the serialized HTTP request size.
Missing usage remains unknown; a real zero remains zero.

The runner regression injects a non-retryable HTTP 400 context-overflow error
after an action and summary. It verifies exactly one failed model attempt, an
error outcome, and preservation of that completed action and summary.

## Remaining evidence

Run the unmodified maintenance checklist on disposable, representative content,
including chart creation/repair, long histories, long validation messages, many
root causes, and multiple models' detail lists. Measure each promised provider
and the smallest relevant preset window with headroom for output/reasoning.
Azure/Bedrock live testing remains deferred.

Only then decide between smaller/paginated tool responses, a sliding window, or
summary compaction. A bounded intake pass is not a no-compaction-needed verdict
for long runs and does not qualify any model for cleanup.
