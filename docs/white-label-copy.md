# White-label copy: no "Lightdash" in errors or embeddable UI

Customers embed Lightdash in their own product (iframe and SDK). Errors from
any service can surface inside an embed, so they must not name "Lightdash"
when they mean "this app".

## Scope

- **Error messages, everywhere.** Messages passed to any `*Error(...)`, API
  and validation errors, error toasts, error states and fallbacks, warnings
  about missing configuration, and errors returned to external clients
  (Slack, the postgres wire protocol). An error written for an admin flow
  today is thrown by a shared service tomorrow and shown in an embedded
  dashboard.
- **Labels in embeddable pages and components.** Any string a user can see
  in an embed: dashboards, charts, Explore, the metrics catalog, data apps,
  the AI agent, filters, and every shared component they render (labels,
  tooltips, placeholders, aria-labels, empty states, app-wide toasts).

Labels on pages that cannot be embedded (settings, project connection,
onboarding, admin) and delivery copy (emails, Slack/Teams/Google Chat
deliveries) are out of scope for now.

## Rule

When an in-scope string says "Lightdash" to mean the app, server, instance,
project, user, explore or API the user is already in, rewrite it neutrally.
Do not introduce a brand variable; rewrite the sentence.

| Before | After |
|---|---|
| `Unexpected error in Lightdash database.` | `Unexpected error in the application database.` |
| `We are currently unable to reach the Lightdash server.` | `We are currently unable to reach the server.` |
| `"x" does not belong to this Lightdash instance` | `"x" does not belong to this instance` |
| `Lightdash does not support adapter X` | `dbt adapter X is not supported` |
| `already connected to another Lightdash user` | `already connected to another user` |
| `The Lightdash Slack app isn't a member of this channel` | `The Slack app isn't a member of this channel` |
| `Install the Lightdash GitHub App` | `Install the GitHub App` |

## Exceptions

Keep "Lightdash" when it names something the user must recognise by that name:

- Lightdash the company: support, sales, trial, billing, licensing, roadmap.
- The CLI and its commands (`lightdash deploy`, "Lightdash CLI"), file formats
  ("Native Lightdash YAML", `meta.lightdash`).
- Identifiers, header names, user agents, URLs and env vars.

Logs, code comments, tests, AI system prompts and tool descriptions are not
user-facing copy.

Vendor references and Lightdash URLs in embeddable components must still be
hidden with `useIsEmbedded()`. See the "Embeds are white-label" section of
`packages/frontend/CLAUDE.md`.

## Checking a change

```bash
git diff origin/main... | grep '^+' | grep -n 'Lightdash'
```

For each hit inside an in-scope string, decide whether it is an exception
above. If not, rewrite it.
