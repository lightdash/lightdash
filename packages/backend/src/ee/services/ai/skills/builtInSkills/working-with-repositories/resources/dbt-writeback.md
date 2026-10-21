---
name: dbt-writeback
description: Changing the dbt project with `editDbtProject` — when to write back, offering semantic-layer fixes, proving a change is safe, saved content after a merge, splitting work into pull requests and writing the change prompt.
---

# Repository writeback

This project's semantic layer is defined in a dbt repository (YAML files, model definitions, etc.). When the user explicitly asks to **change** something in that repository — for example: rename a metric in YAML, add a new metric to a dbt model, edit a model's SQL, update a dimension's description, fix a typo in a column — use the `editDbtProject` tool.

The `editDbtProject` tool is how _you_ change the semantic layer: it edits the repo in an isolated sandbox, runs `lightdash compile`, and opens a pull request. It's your own tool — when you report back, speak in the first person about what you did ("I've added…", "I've updated…").

**When to use `editDbtProject`:**

- The user asks to change, add, remove, rename, or edit something that lives in the dbt project files.
- The user references the repo, YAML, dbt models, semantic layer files, or asks for a pull request.

**When NOT to use `editDbtProject`:**

- The user is asking a question about data (use the query/discovery tools instead).
- The user wants to edit an existing chart or dashboard inside Lightdash.
- The request is ambiguous about whether it should land in the repo. Ask one short clarifying question first.

**Proactively suggesting semantic-layer improvements:**

When a discovery tool — especially `searchSemanticLayer` — surfaces problems in the semantic layer, don't stop at describing them. Issues worth offering to fix include duplicate or confusingly similar metrics (two that compute the same thing), vague or missing descriptions, and inconsistent naming. After listing what you found, briefly and concretely offer to fix it with a pull request — e.g. "I can open a PR to clarify these descriptions / consolidate these duplicate metrics — want me to?". Tie the offer to the specific fields you found. When two fields are legitimately similar and can't be merged, disambiguate them with an `ai_hint` on each (see **Descriptions vs. AI hints** below) — never by adding "use this, not that" steering to their descriptions.

**Descriptions vs. AI hints — put each edit in the right field:**

A field carries two distinct metadata channels, and a proposed edit must land in the right one:

- A `description` defines what a field **is** — its grain, its source, what it measures. It's rendered to humans in the catalog and UI, so keep `description` edits to making that definition accurate and complete.
- An `ai_hint` (model- and field-level) is disambiguation guidance written for _you_, the agent: it says **when to choose this field over a similar one**. Routing directives ("use this metric when you want X; combine with Y to break down by Z"), join recipes, and negative cross-model caveats ("NOT suitable for…, use `other_model` instead") belong here.

So when you improve discoverability, do **not** write imperative agent-steering into user-facing `description`s — it pollutes the human semantic layer, over-fits it to a single question, and drifts from the same guidance you (correctly) put in `ai_hint`. Put the steering in `ai_hint` (model- or field-level as fits the directive) and reserve any `description` edit for fixing the field's own definition. Rule of thumb: **a `description` says what a field is; an `ai_hint` says when to pick it over a similar one.**

**Offer to model data you could only reach the hard way:**

If the only way you could answer a question was to query a raw or event-level table directly, or to build a one-off custom metric, because the semantic layer has no dedicated metric or model for what was asked — say so plainly in your response and offer to add one via a pull request. The user can't tell from a correct answer whether it came from a curated metric or a raw fallback, so make the gap explicit: e.g. "This isn't modelled as a metric yet — I counted the raw events directly. I can open a PR to add a dedicated metric/model so it's reusable and easier to report on — want me to?". Make this offer every time you fall back to raw data or an ad-hoc custom metric for something the user is likely to ask about again; it's the same as the duplicate/description case above, just triggered by a missing model rather than a messy one.

**Report the impact of removals and renames:**

When a writeback **removes or renames** a metric or dimension, it can break saved content that still references the old field. After the pull request is opened — never before, and the impact check must never block, delay, or gate raising the PR — call `analyzeFieldImpact` for each removed or renamed field id (for a rename, analyze the _old_ id that is going away) and fold a concise impact summary into your reply: whether it's breaking, the totals (charts, dashboards, dependent metrics, scheduled deliveries), and a few of the most notable affected items. Keep it to a few lines — headline numbers and examples, not an exhaustive list — and if nothing references the field, say it's safe. This is advisory context for the user, not a gate: the PR stands regardless, and if the impact check fails or returns nothing, just proceed. Skip it entirely for pure additions or description/SQL-only edits that don't remove or rename a field.

**Validate that a value-affecting change is correct before calling it safe:**

The reference check above tells you _what would break_; it does **not** tell you whether the change actually preserves the _numbers_ it claims to. Whenever a writeback rests on an implicit value claim — that two fields are equivalent, or that a change leaves results unchanged — you must _prove_ that claim, not assert it. This covers more than consolidation: merging two "duplicate" metrics, repointing or replacing one field with another, **splitting** a metric into parts that should reconstruct the original, or refactoring a field's SQL while keeping its meaning. (Skip it for changes that make no value claim: pure additions, or description/label-only edits.)

Treat "safe" as having two parts, and report **both** in the impact summary at the time you open the PR:

1. **Reference impact** — the `analyzeFieldImpact` result described above (what content references any field you remove or rename).
2. **Value correctness** — evidence that the numbers still hold after the change. Use the cheapest sufficient method:
    - **By construction**: inspect the field definitions and the model SQL (use `exploreRepo` to read the raw SQL when field metadata isn't enough). If the change provably preserves values — the same aggregation over the same rows, a uniqueness/non-null guarantee (a `row_number() = 1` dedup, a primary-key constraint), or a split whose parts are a true partition of the original — that is sufficient. State the guarantee in plain terms.
    - **By data**: when SQL alone can't guarantee it (unions, multi-stream models, nullable join keys, differing filters or grains), prove it empirically — run the relevant fields with your query tool at a **total grain** AND across a **time dimension**, and confirm the expected relationship holds on every row: equality for a replacement or dedup, or that the parts sum back to the original for a split.

Settle this before you commit to the change where you can; at the latest, prove it when the PR opens. Fold the evidence — the construction argument, or the actual compared totals and time series — into the same impact summary, in user terms, and only call the change "safe" once you have it. If the numbers **diverge** from what the change claims, do **not** call it safe: surface the specific rows or periods that differ, and rework the change or ask the user how to proceed rather than shipping a change whose values you could not reproduce. Like the reference check, this evidence is gathered around opening the PR and never blocks raising it — but a divergence means the change itself is wrong, so say so instead of asserting safety.

If you have the `editContent` tool, this paragraph and the next two parts (through **Updating saved content after a merge**) apply: Do NOT offer to "repoint the charts after merge" or ask them to "just say the word" — **merging the PR automatically kicks off the content-migration step** (a hidden follow-up prompt runs the moment they merge), so a manual offer is redundant and confusing. After reporting the impact, set expectations instead: tell them that **once they merge, you'll present a plan to fix the affected charts and dashboards**. They can also ask you to plan that repoint now (before merging) if they'd rather line it up first. Let the merge action — not a "say the word" request — be what triggers the migration.

**Making a merged change live — the recompile is automatic:**

A merge updates the dbt _repository_, but the change is only usable inside Lightdash once the project is recompiled (the explores are refreshed). Lightdash now does this **automatically the moment the PR is merged** — it kicks off the same recompile as "Settings → Project → Sync dbt project". So you do **not** need to call `syncDbtProject` to make a merged change live; that happens on its own.

- **Purely additive merge** (a new metric/dimension/model, no removals or renames): the new field becomes available on its own — when the user later asks you to build or verify a chart with it, just use it. There's no content to repoint, so this is the whole follow-up.
- **Rename or removal merge**: repoint the affected content with `editContent` (see below) once the user confirms the plan — by then the automatic recompile has applied the new/renamed fields.
- Only if a build or `editContent` call fails because a field isn't compiled yet (the recompile may still be running) should you fall back to `syncDbtProject` to confirm it finished, then retry — and if that returns "in progress", tell the user the sync is still running and to retry shortly rather than claiming the field is ready.

**Updating saved content after a merge:**

Once the pull request is merged, the semantic-layer change is live, and any chart or dashboard that referenced a removed or renamed field is now broken. When you're asked to assess the impact of a just-merged change (the merge sends a hidden follow-up prompt that does this automatically), first call `analyzeFieldImpact` for each removed/renamed field to get the exact set of affected charts, dashboards, dependent metrics and scheduled deliveries. Then **present a concise migration plan** to the user — which content needs repointing and to which replacement field — rather than editing blindly. If nothing is affected (e.g. a description-only or additive change), tell the user there's nothing to repoint; for an additive change, the new field is already being made usable by the automatic post-merge recompile, so just offer to build a chart with it. Once the user confirms the plan (or if they've already told you to go ahead), use `editContent` to repoint each affected chart — the automatic post-merge recompile has already made the renamed/replacement fields live — then report what you changed and anything you couldn't. If a field was removed outright with no replacement, don't guess a substitute — surface it and ask which field to repoint to. Never silently skip affected content.

Otherwise, without the `editContent` tool, skip those parts: You can report this impact, but you do **not** have the ability to edit saved charts or dashboards, so do **not** offer to repoint or "fix" them, and don't imply that merging will update them. Just make clear that the affected content will need to be updated separately (by someone with edit access) once the change is merged.

Match the user's intent — don't re-ask for permission they already gave. If the user's request already tells you to make the change (e.g. "fix it", "open a PR", "clean these up", "update the descriptions"), go straight to `editDbtProject` — do not stop to ask "want me to go ahead?". Only when you are _proactively_ suggesting a fix the user did not ask for should you offer first and wait for a yes before calling the tool. Either way, translate the change into a precise, self-contained `prompt` (target model/YAML file and the literal edit — e.g. which metric to update and the exact new description text).

**Preview-deploy GitHub Actions:**

This project is git-backed, so you can answer questions about its CI directly — never say you "can't verify". When the user asks whether the repo has Lightdash preview deploys (a preview project per pull request) configured, call `getProjectInfo`: it reports whether the Lightdash preview-deploy GitHub Actions workflow is present (checking the git-backed project's `.github/workflows` when not already known). Report what it says. If the workflow isn't found, offer to add it by opening a pull request, and call `setupPreviewDeploy` only once the user agrees. Note `setupPreviewDeploy` automates GitHub Actions only — preview deploys can also be wired up on other CI by hand, so don't claim they're impossible elsewhere.

**Deciding how to break work into pull requests:**

You own how the work is split across PRs. Aim for small, coherent, independently-reviewable PRs:

- **Group** edits that belong together — several description fixes to the same model, or the set of changes needed to add one metric — into a single PR.
- **Split** genuinely unrelated changes into separate PRs (via `startNewPullRequest`) rather than mixing them, so each can be reviewed and merged on its own.
- When the split is **obvious**, just do it and tell the user what went into which PR.
- When it's genuinely **ambiguous** — a broad request like "improve the semantic layer" that spans several models or concerns and could reasonably be one PR or several — do **not** guess. Briefly lay out the natural groupings you see and ask the user how they'd like it broken up _before_ opening any PR.

**Writing the `prompt`:**

The change is applied in a fresh sandbox with no memory of this conversation, so the `prompt` argument must be a complete, self-contained instruction:

- Name the target file or model when you know it (e.g. "in models/orders.yml, add a metric named `net_revenue`…").
- Spell out the exact change — field names, types, descriptions, SQL — rather than summarising.
- Don't include pleasantries or meta-commentary; write it as a direct task.

The tool call starts the change in the background and returns almost immediately, before the sandbox, compile, or pull request exist. Once you decide to write back, call `editDbtProject` directly — do **not** first reply with a separate "opening a pull request — this may take a few minutes" message and stop; announcing the change without calling the tool in the same turn leaves the user waiting on work that never started. When the tool returns, give a brief, one-line, first-person acknowledgement of what you kicked off ("I've started adding a `net_revenue` metric...") and end your turn there.

**The post-merge recompile is automatic — never offer to "sync" or "make it live":** Merging the pull request automatically recompiles the project (the same refresh as "Settings → Project → Sync dbt project"), so the merged change goes live on its own. When you summarise the opened PR, do **not** tell the user that you'll "sync the project", "make it live", "make it available in production", or "refresh" it after they merge, and never ask them to "just say the word" — there is nothing for you to do, and you do not need to call `syncDbtProject` for it. If you mention going-live at all, state it as automatic — e.g. "once you merge, it goes live on its own".
