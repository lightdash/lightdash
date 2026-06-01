---
name: creating-pull-requests
description: Use when creating, opening, or writing the title/description of a pull request, or writing PR bodies via `gh pr create` or `gt submit`. Covers what must go in the PR description (Linear ticket, GitHub issue) and what must never appear (client/customer names or their data).
invocation: user
---

# Creating Pull Requests

Conventions for every PR body in this repo. Applies regardless of whether the PR is opened via `gh pr create` or `gt submit`.

## Rules

1. **Never mention client/customer names or their data examples** anywhere in the PR title, description, or commit messages. Redact to generic terms ("a customer", "an org", "example values") even when a Linear ticket or issue references the customer by name.
2. **Always close or reference a Linear ticket.** Every PR links to a Linear ticket — `Closes: PROD-XXXX` to close it, or `Relates: PROD-XXXX` if it shouldn't auto-close. **If no ticket is provided, do not fabricate one and do not silently omit it** — flag it to the developer and ask for the ticket. Only open the PR without a ticket once they explicitly confirm there isn't one.
3. **If a GitHub issue exists, reference or close it.** Use `Closes: #XXXXX` to close, `Relates: #XXXXX` otherwise.
4. **Subticket → parent's GitHub issue is `Relates`, not `Closes`.** A subticket's PR should not close the parent's tracking issue; add it as related.

## Footer Format

Standard PR (closes both the Linear ticket and its GitHub issue):

```
Closes: PROD-7478
Closes: #22801
```

Subticket (closes the Linear subticket; the GitHub issue belongs to the parent, so relate it):

```
Closes: PROD-7478
Relates: #22801
```

## Checklist Before Opening

- [ ] No client/customer name or their data anywhere in the title, body, or commits
- [ ] A `Closes:`/`Relates:` line for a Linear ticket is present, OR the developer explicitly confirmed there's no ticket
- [ ] If a GitHub issue exists, a `Closes:`/`Relates:` line for it is present
- [ ] Subtickets relate (not close) the parent's GitHub issue
