# GitHub

Render [canonical JSON](json.md) as a PR description: what the change does, its diff and how it was verified.
It describes the change and never judges it: no verdict, findings, gaps, rating or impact signal.
The description is public: check the block against [lenses/README.md](../lenses/README.md), Public by default, before writing it.

## Block

Yoda owns one block of the body, between markers; everything outside them belongs to people and is never touched.

```md
<!-- yoda:start head=e78c7aa -->
Closes: [SPK-1234](https://linear.app/lightdash/issue/SPK-1234)

### Summary
People can attach screenshots to AI chat threads. …

### Diff · 9
| Lens | What |
|---|---|
| 🔸 Config | `+` `ai-thread-images` · off · kept off in previews |

### Testing · 2
| What | How |
|---|---|
| upload and replay in the browser | browser |

<sub>Described by yoda at e78c7aa; edits inside this block are replaced on the next sync.</sub>
<!-- yoda:end -->
```

- **Closes:** the first line, as `ld-describe` writes it: `Closes: <link>` to the Linear ticket (a GitHub issue only when it has no Linear twin), so Linear and GitHub auto-link; left out when there is no ticket.
- **Summary:** `### Summary`, then one paragraph of three to five sentences, product words first: what changes, who notices (users, admins, API callers or nobody) and why, from the claim and the Linear ticket. No headings, lists or file names.
- **Diff:** `### Diff · N` and the table exactly as [text.md](text.md)'s Diff renders it, every row, schema order.
- **Testing:** `### Testing · N` with verification rows only, as `| What | How |`; gaps never appear. Omit the section when there are no verification rows.
- **Footer:** the `<sub>` line naming the head the block describes; `head=` in the start marker repeats it as the short sha for sync.

## Write

- **A PR:** read the body (`gh pr view <pr> --json body,author`), replace the block between the markers, or put it at the top of the body when there is none so `Closes:` is the body's first line, and save with `gh pr edit <pr> --body-file <file>`.
  On a PR the user didn't author, show the block and ask before writing it.
- **No PR yet** (branch or local diff): output the block, ready to be the body of `gh pr create`.
- **A stack:** each PR gets its own block from its own diff; the description may name the PR below or above it.

## Sync

A body holding `<!-- yoda:start` was written by yoda and stays current:

- Whenever yoda reviews or describes that PR, in any mode or format, and the PR head doesn't start with the marker's `head=`, it re-renders the block from the new review and writes it back, then says so in one line ("PR description synced to `<sha>`").
- A re-review after new commits ([review.md](../review.md#re-review)) always syncs.
- Text outside the markers stays byte for byte; a body whose markers were removed is no longer synced.
