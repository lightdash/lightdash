---
name: lightdash-release-review
description: Use when reviewing what shipped in Lightdash, preparing a release digest, or summarizing product changes over a date range. Reads public GitHub releases and PRs to explain new features, meaningful updates, and customer-relevant bug fixes. Defaults to the last fourteen days unless another period is requested.
---

# Lightdash release review

Produce a concise review of what shipped and why it matters to technical customers. Research the public repository at https://github.com/lightdash/lightdash directly. A local checkout, Lightdash credentials, internal Linear/Slack access, and GitHub CLI are not prerequisites.

## Scope

**Use this when** a customer wants to keep up with Lightdash releases, either on demand or through a scheduled prompt.

**Don't use this for** reviewing a customer's analytics project, developing Lightdash itself, or deciding whether a self-hosted upgrade is safe. Release inclusion alone does not establish upgrade safety.

## Review period

- Default to a fortnightly review: the last fourteen days ending at the current run time. Here, “bi-weekly” means every two weeks. Use another period only when the user explicitly requests it; requested durations or date ranges take precedence over the default. Support optional feature-area interests.
- Resolve relative dates at execution time, including on scheduled runs. For date-only ranges, include both named calendar dates.
- Record the resolved start and end before retrieval.
- A focus request changes emphasis. Unless the user explicitly asks for an exclusive filter, retain material breaking changes and required actions elsewhere in the product.

## Research

Read [GitHub retrieval](./resources/github-retrieval.md) for endpoints, pagination, and fallback guidance.

1. Identify published releases in the period using `published_at`. Exclude drafts and prereleases by default. A merge into `main` or a Git tag without a published release is insufficient evidence of shipping.
2. Collect release notes, release tags, and linked PRs across the whole period. Keep a compact working list of candidate changes and their sources; do not put the raw list in the digest.
3. Start with the release notes. Read PR descriptions for likely inclusions. Inspect relevant diffs or files at a release tag when needed to explain behavior, determine availability, or resolve an ambiguous title.
4. Use comparisons between relevant release tags where notes are missing, unclear, or appear to omit meaningful changes. Establish that the candidate is in a published release within the period. Do not use unrelated merged-PR search results as a substitute.
5. Consolidate related changes into a single customer outcome. Deduplicate repeated references and account for fixes or reversions later in the period. If a capability was added and reverted, do not describe it as available at the end of the review.

Use public Lightdash documentation or its product changelog as supporting context when useful. Keep GitHub as the source for release inclusion. Current documentation can describe later behavior, so check that it applies to the reviewed version. Do not infer a feature's release date from a documentation publication date.

## Selection

Include changes that affect what customers can do, how existing workflows behave, or the correctness and reliability of the product:

- **New features:** new usable capabilities.
- **Updates:** meaningful changes to existing workflows, configuration, APIs, integrations, performance, or usability.
- **Bug fixes:** customer-relevant fixes, especially incorrect results, permissions, authentication, reliability, or common workflow failures.
- **Required actions:** supported breaking changes, deprecations, migrations, and security or compatibility actions. Surface these prominently when present.

Exclude routine refactors, tests, CI/build changes, internal product analytics, and dependency updates without meaningful customer impact. Include dependency changes that address a relevant security issue or alter supported behavior. Do not treat commit prefixes such as `feat` and `fix` as customer-impact classifications.

Omit clearly experimental, unfinished, or disabled work by default. Use explicit PR, release, documentation, or code evidence; a feature flag alone does not mean experimental. Established enterprise, opt-in, or limited-availability features can still be relevant. Include experiments only when requested, and identify them as such.

GitHub release inclusion does not prove deployment or activation in every Cloud workspace. Mention known edition, configuration, warehouse, opt-in, or version restrictions when useful and supported. When availability is uncertain, qualify the claim or omit it; do not invent a rollout status or a way to enable it.

## Write the review

Aim for a quick scan, roughly 250–450 words for a busy period and shorter when little changed. Treat this as a guide, not a quota. Prioritize meaningful outcomes and group related changes. Keep the overview to one short sentence.

Use this structure, omitting empty sections:

1. **Lightdash release review — [exact period and timezone]**. Give a short overview of the main changes.
2. **New features**.
3. **Updates to existing features**.
4. **Bug fixes**.
5. **Actions for affected users**, when applicable; put urgent or breaking changes near the top instead.

Use different levels of detail for each section:

- **New features and updates:** a short bold title followed by one concise sentence explaining the capability or practical benefit, usually 20–35 words. Avoid repeating the title, background explanations, and implementation details. Include only availability or configuration qualifiers that materially affect use. Link the title to the supporting PR or release; add another source only when needed to support a grouped claim.
- **Bug fixes:** a bullet containing only a short, descriptive bold title linked to its source. No explanatory sentence, before/after description, or technical detail. Make the title specific enough to convey the fix, such as “Dashboard tiles refresh after agent edits”. For a grouped fix, add another source link only if needed.
- **Required actions:** give the affected audience and the action concisely. Put essential security, compatibility, or upgrade instructions here rather than expanding a bug-fix bullet. Do not drop important action details merely to meet the length guide.

Example formatting:

```markdown
- **[Optional SQL auto-approval per agent](https://github.com/lightdash/lightdash/pull/31065).** Agents can skip SQL approval prompts when this capability is enabled; it defaults off and retains existing permission checks.
- **[Dashboard tiles refresh after agent edits](https://github.com/lightdash/lightdash/pull/31015)**
```

Add documentation or a release version only when it helps the reader take action. Grouped claims need sources covering the group.

Distinguish facts from inference. Do not claim exhaustive coverage of every code change. If complete retrieval found no relevant changes, say so briefly rather than filling sections with internal work.

If release pages, PRs, comparisons, or timestamps could not be retrieved sufficiently, label the review **Partial review**, explain the missing coverage and its effect, and summarize only supported findings. A failed fetch is not evidence that nothing shipped. Do not substitute model memory or search snippets for verified findings.

## Scheduled use

Generate the same review on a scheduled run, resolving dates afresh. Delivery belongs to the assistant or automation platform running the skill. Only send to a user or Slack channel when explicitly authorized and supported by that environment; otherwise return the digest in the conversation.

This skill does not create an in-app Lightdash scheduler.
