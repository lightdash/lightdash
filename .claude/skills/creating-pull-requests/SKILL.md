---
name: creating-pull-requests
metadata:
  internal: true
description: Use when creating, opening, or writing the title/description of a pull request, or writing PR bodies via `gh pr create` or `gt submit`. Covers what must go in the PR description (a ticket — GitHub issue or Linear) and what must never appear (client/customer names or their data).
invocation: user
---

# Creating Pull Requests

Conventions for every PR body in this repo. Applies regardless of whether the PR is opened via `gh pr create` or `gt submit`.

## Rules

0. **PR titles must be conventional commits** — `<type>[optional scope]: <description>`, with a type from build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test (e.g. `fix(dashboards): remove infinite loop during login`). The `Validate PR Title` check blocks merging otherwise, and the title becomes the squash-merge commit that drives semantic-release — use `feat`/`fix` only for user-facing value.
1. **Never mention client/customer names or their data examples** anywhere in the PR title, description, or commit messages. Redact to generic terms ("a customer", "an org", "example values") even when a Linear ticket or issue references the customer by name.
2. **Never quote, summarize, or attribute Slack messages or other internal-communication content** anywhere in the PR title, description, or commit messages — even when Slack/internal chatter was used as an investigation or evidence source. Cite only that the signal was checked and what it showed, in generic terms (no channel names, no quoted text, no who-said-what).
3. **Always close or reference a ticket — GitHub issue or Linear ticket, either one is enough.** Use `Closes: #XXXXX` / `Closes: PROD-XXXX` to close it, or `Relates:` if it shouldn't auto-close. A GitHub issue automatically creates a Linear counterpart (the reverse is not true), so a GitHub issue alone fully satisfies this rule — do not ask for a Linear ticket when a GitHub issue is already referenced. **If neither exists, do not fabricate one and do not silently omit it** — flag it to the developer and ask. Only open the PR without a ticket once they explicitly confirm there isn't one.
4. **Subticket → parent's GitHub issue is `Relates`, not `Closes`.** A subticket's PR should not close the parent's tracking issue; add it as related.

## Footer Format

PR closing a GitHub issue (its Linear counterpart is created and closed automatically):

```
Closes: #22801
```

PR closing a Linear ticket only (no GitHub issue exists):

```
Closes: PROD-7478
```

Subticket (closes the Linear subticket; the GitHub issue belongs to the parent, so relate it):

```
Closes: PROD-7478
Relates: #22801
```

## Checklist Before Opening

- [ ] The PR title is a valid conventional commit (`type(scope): description`)
- [ ] No client/customer name or their data anywhere in the title, body, or commits
- [ ] No quoted/summarized Slack or internal-communication content anywhere in the title, body, or commits
- [ ] A `Closes:`/`Relates:` line for a ticket (GitHub issue or Linear) is present, OR the developer explicitly confirmed there's no ticket
- [ ] Subtickets relate (not close) the parent's GitHub issue
