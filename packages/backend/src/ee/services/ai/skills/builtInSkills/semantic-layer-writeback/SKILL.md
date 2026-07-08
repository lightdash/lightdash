---
name: semantic-layer-writeback
description: Use for dbt semantic-layer writeback, semantic-layer PRs, changesets, repo read-before-write, impact checks, value correctness checks, post-merge content migration, and proactive PR offers.
---

# Semantic Layer Writeback

Use this skill when the user asks to change the project's dbt or semantic-layer repository, asks for a pull request, works from a changeset, or needs impact analysis for removing, renaming, deduplicating, or refactoring fields.

## Routing

- Use `editDbtProject` for semantic-layer repository changes.
- Do not use it for data questions or saved chart/dashboard edits.
- If intent is ambiguous, ask one short clarifying question.
- If the user already asked you to make the change, do not ask for permission again.
- Before writing, read the repo files you plan to change with read-only repo tools.
- If the code already does what the user asked, say so instead of opening a no-op pull request.
- When you decide to write back, call `editDbtProject` in the same turn. Do not stop after saying you will open a pull request.
- When the tool returns, summarize what changed and which project/repository it targeted. Do not paste the pull request URL or number.

## Writeback Prompt

The edit runs in a fresh sandbox. Write a self-contained prompt:

- Name target files or models when known.
- Spell out exact fields, types, labels, descriptions, SQL, or YAML edits.
- Match surrounding conventions.
- Avoid pleasantries and meta-commentary.

Use `fromActiveChangeset: true` and `prompt: null` when the user asks to write back active changesets.

## Pull Request Routing

- Continue the most recent related pull request by default.
- For separate unrelated work, start a new pull request.
- If several pull requests exist, list workstreams first and target the right PR URL.
- Read PR diffs when deciding how to continue, split, consolidate, or describe existing PRs.
- Keep PRs small and coherent.
- Group edits that belong together into one PR.
- Split genuinely unrelated changes into separate PRs.
- If a broad request has ambiguous natural groupings, ask how to split it before opening PRs.
- To discard a PR this conversation opened, close it by URL only when the user asks.

## Descriptions And AI Hints

- `description` explains what a field is for humans.
- `ai_hint` tells the agent when to choose a field over similar fields.
- Put routing, disambiguation, join recipes, and negative caveats in `ai_hint`, not descriptions.

## Proactive Improvements

When semantic-layer search or data work reveals duplicate metrics, missing descriptions, confusing names, inconsistent modelling, raw-table fallback, or reusable custom metrics, describe the issue and offer a specific pull request to fix it.

Wait for confirmation only when the user did not already ask you to make the change.

When two fields are similar but should both exist, disambiguate with `ai_hint`; do not add "use this, not that" steering to descriptions.

## Impact Checks

For removals and renames, open the pull request first, then run impact analysis for each old field ID. Report:

- Whether the change breaks saved content.
- Counts for charts, dashboards, dependent metrics, and scheduled deliveries.
- A few notable affected items.

Skip impact checks for additions, description-only edits, and SQL-only edits that do not remove or rename fields.

## Value Correctness

Do not call a value-affecting refactor safe without evidence. Prove equivalence when merging duplicate metrics, replacing fields, splitting metrics, or changing SQL while preserving meaning.

Use the cheapest sufficient proof:

- By construction: same aggregation, same rows, true partition, uniqueness/non-null guarantee.
- By data: compare totals and a time series. Equality or reconstruction must hold on every row.

Report both reference impact and value correctness when calling a change safe. If numbers diverge, surface the rows or periods and rework the change or ask how to proceed.

## Post-Merge Content Migration

Merging a semantic-layer PR automatically recompiles the project. Do not offer to sync or make it live manually.

If a merge removed or renamed fields, analyze impacted content and present a concise migration plan. Use saved-content editing only after the user confirms the plan, unless they already asked you to proceed. If a field was removed with no replacement, do not guess a substitute.

If saved-content editing is unavailable, report the impact without offering to repoint charts or dashboards.

For additive merges, there is no content to repoint. The new field becomes available after the automatic recompile.

## Preview Deploys

When asked whether Lightdash preview deploys are configured, check project info. If missing, offer to add the workflow and only set it up after confirmation.
