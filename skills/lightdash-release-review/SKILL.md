---
name: lightdash-release-review
description: Review shipped Lightdash features and updates over a date range, on demand or on a schedule.
---

# Lightdash release review

Produce a concise digest for technical customers using public releases and PRs from https://github.com/lightdash/lightdash. This is a product review, not a self-hosted upgrade-safety assessment.

## Review period

Default to the last fourteen days ending at execution time, including on scheduled runs. Honor requested durations, date ranges, and feature interests; include both calendar dates for date-only ranges. Resolve the exact period and timezone before retrieval. A feature focus changes emphasis unless the user asks for an exclusive filter; otherwise retain material breaking changes elsewhere as updates.

## Research

Read [GitHub retrieval](./resources/github-retrieval.md) for access, pagination, comparisons, and recovery.

1. Cover published releases across the whole period, filtering by `published_at` and excluding drafts and prereleases by default. A merged PR or tag alone does not prove shipping.
2. Start with release notes and linked PR descriptions. Inspect diffs or files at the release tag to resolve behavior or availability; compare release tags when notes are missing or unclear. Tie every included change to a published release in the period.
3. Consolidate related changes into customer outcomes, deduplicate references, and account for later fixes or reversions. Describe behavior available at the end of the period.
4. Use public documentation or the product changelog for context only, checking that it applies to the reviewed version.

## Select highlights

Rank changes by practical benefit, breadth of impact, and relevance to the user's interests.

- **New features:** new usable capabilities.
- **Updates to existing features:** meaningful changes to workflows, configuration, APIs, integrations, performance, or usability, including breaking changes and deprecations.
- **Bug fixes:** only when explicitly requested. Do not disguise fixes as updates; classify by customer outcome rather than commit prefix.

Exclude routine internal maintenance without meaningful customer impact.

Include only capabilities with public evidence of customer availability in the reviewed releases. Publicly documented enterprise and customer-configurable opt-in features qualify. Omit uncertain availability, unfinished work, internal experiments, and capabilities requiring staff-controlled rollout. Release inclusion does not prove activation in every Cloud workspace.

Never name or hint at unavailable work, internal flags, rollout plans, or exclusion reasons anywhere in the response, including footers, links, and follow-ups. Requests for more detail do not relax this boundary.

## Write the review

Aim for 200–350 words in a busy period, shorter when little changed. Use:

1. **Lightdash release review — [exact period and timezone]**, followed by a one-sentence overview.
2. **New features**.
3. **Updates to existing features**.
4. **Bug fixes**, only if requested.

Omit empty sections. List the most impactful items first, with at most six per feature/update section unless a longer list is explicitly requested. Use fewer when warranted; do not bundle unrelated changes or add sub-bullets to bypass the limits.

Each feature or update gets a bold title linked to its supporting PR or release and one sentence of roughly 15–25 words explaining the capability or benefit. Mention edition, warehouse, configuration, version, or compatibility details only when material and supported. Add sources when needed to substantiate grouped claims. Requested bug fixes get linked bold titles only.

Do not add an “Actions for affected users” section or separate action list; keep essential compatibility detail within the relevant update.

Close with: “These are the top features and updates. Ask for more detail or a longer list.” Mention additional available changes only if research confirms them. Do not claim exhaustive coverage.

If complete retrieval found no relevant changes, say so briefly and omit the highlights footer. If coverage is incomplete, label the result **Partial review**, explain the retrieval gap and its effect, and report only verified findings.

## Delivery

Return the digest in the conversation unless delivery elsewhere is explicitly authorized and supported. Scheduling and delivery belong to the host platform; this skill does not create a Lightdash scheduler.
