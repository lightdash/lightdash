---
name: repository-writeback
description: Workflow for semantic-layer pull requests (`editDbtProject`), covering when to ask first, descriptions versus AI hints, impact and value checks, splitting work into pull requests, and the content migration after a merge. Load it before changing the dbt project and when a merged pull request needs follow-up.
availability: [agent]
---

# Repository writeback

`editDbtProject` changes this project's semantic layer through a pull request; its description and parameters cover the call and the `prompt`. This skill covers what to change and what follows.

**Ask or act.** When the user's request already asks for the change ("fix it", "open a PR", "clean these up", "update the descriptions"), call `editDbtProject` without asking again. When you suggest a fix the user did not ask for, offer it, naming the fields involved, and wait for a yes. When it is unclear whether a request should land in the repository at all, ask one short question.

**Read first.** Before `editDbtProject`, read the files you intend to change with `exploreRepo`: confirm the change is needed (when the code already does what was asked, say so instead of opening an empty pull request), name the exact target file in the `prompt`, and match the surrounding conventions.

**Descriptions and AI hints.** A field carries two metadata channels:

- `description` defines what the field is (its grain, its source, what it measures), and people read it in the catalog and the UI.
- `ai_hint` (model- and field-level) tells the agent when to choose this field over a similar one: routing directives ("use this metric for X; combine with Y to break down by Z"), join recipes, and caveats such as "not suitable for X, use `other_model`".

Put agent steering in `ai_hint` and keep `description` edits to the field's own definition: steering in a description pollutes the human-facing semantic layer and fits it to one question. Disambiguate two legitimately similar fields that cannot be merged with an `ai_hint` on each.

**Impact of removals and renames.** When a change removes or renames a field, call `analyzeFieldImpact` right after `editDbtProject` starts, for each field id that goes away (the old id for a rename), and add a few lines to your reply: whether it breaks content, the totals (charts, dashboards, dependent metrics, scheduled deliveries) and the most notable items, or that nothing references the field. The check is advisory: the pull request stands whatever it returns. Skip it for additions and for description- or SQL-only edits.

**Value correctness.** The impact check shows what would break, not whether the numbers survive. When a change claims to preserve values (merging duplicate metrics, replacing or repointing a field, splitting a metric into parts that should sum back to it, refactoring a field's SQL), prove the claim before calling the change safe, with the cheapest sufficient method:

- By construction: read the field definitions and the model SQL (with `exploreRepo` when the metadata is not enough). The same aggregation over the same rows, a uniqueness or non-null guarantee (a `row_number() = 1` dedup, a primary key) or a split whose parts partition the original is enough; state the guarantee in plain terms.
- By data: when the SQL cannot guarantee it (unions, multi-stream models, nullable join keys, differing filters or grains), query the fields at a total grain and across a time dimension and check the expected relationship on every row: equality for a replacement or dedup, parts summing to the original for a split.

Settle it before calling `editDbtProject` when you can, otherwise in the same turn, and report it with the impact. When the numbers diverge, name the rows or periods that differ and rework the change or ask the user how to proceed rather than calling it safe. Skip this for additions and description- or label-only edits.

**Splitting work into pull requests.** Group edits that belong together (several description fixes on one model, the changes that add one metric) in one pull request, and split unrelated changes with `startNewPullRequest` so each can be reviewed and merged alone; when unsure, prefer a new pull request, since a spare one is easy to close and mixed changes are not easy to separate. When the split is obvious, make it and tell the user what went where. When a broad request ("improve the semantic layer") could reasonably be one pull request or several, lay out the groupings and ask before opening any.

`listWorkstreams` shows the pull requests this thread opened, `getPullRequestDiff` what one contains, and `closePullRequest` discards one the user asks to drop, for example after you fold its change into the one you continue with `prUrl`.

**After a merge.** Merging from the pull request card in the thread recompiles the project and sends you a follow-up turn that plans the content migration, so you neither call `syncDbtProject` for it nor offer to sync. The exception: when `editContent` fails because a field is not compiled yet, call `syncDbtProject` to confirm the recompile finished, then retry; when it is still in progress, tell the user to retry shortly instead of calling the field ready. When you report a pull request that removes or renames fields, tell the user you will present a plan for the affected content once they merge (they can ask for it sooner); when you mention going live, say it happens on its own once they merge from the card. On the follow-up turn:

- Call `analyzeFieldImpact` for each removed or renamed field and present a concise migration plan: which content to repoint to which replacement field. When nothing is affected, say there is nothing to update; for an additive change, offer to build a chart with the new field.
- Once the user confirms the plan, or has already told you to go ahead, repoint each affected chart with `editContent`, then report what you changed and anything you could not. For a field removed with no replacement, ask which field to use instead of guessing.
