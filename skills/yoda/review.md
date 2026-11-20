# Review

## Gather

Read only what the claims need.

- PR: `gh pr view <pr> --json title,body,url,author,headRefOid,files,commits,comments`, `gh pr diff <pr>`, `gh pr checks <pr>`.
  Review the head.
  Several PRs (a stack): review each on its own at its own head, bottom first, reading the PRs below as existing code; each gets its own verdict and saved file.
- Local: include committed, staged, unstaged and untracked changes against the base, not just `<base>...HEAD`.
  Record base and head, with a working-tree diff checksum when uncommitted.
- Yoda: `version` from SKILL.md's frontmatter.
- Claim: PR description and Linear ticket found in title, branch or body; find the Linear twin of a mirrored GitHub issue.
  A commit subject suffices if it names the change.
  Record material ambiguity for Verdict.
- Read relevant tests/inputs and release-safety evidence under [lenses/README.md](lenses/README.md); file/line exclusions follow [triage.md](triage.md).

## Select

Apply triage.md at the requested depth, or select explicit lens names.
Read lenses/README.md and the selected `lenses/<tag>.md` files (lowercase, spaces become hyphens).
Triage owns selection, Size and skips.
Keep skipped lenses' Diff instructions when their rows are needed.

## Assess

Run every applicable check of every selected lens under lenses/README.md; the step is done when each check has passed silently, become a finding or been marked n/a.
Open changed files and callers in execution order; trace saves through persistence.

- **quick:** one agent, one pass; no subagents, browser or second pass.
- **deep:** one subagent per lens, given claim, base/diff, lens, shared policy and [JSON finding fields](formats/json.md).
  Merge findings under shared ownership policy.
  Verify once by trying to disprove every finding; drop unsupported ones and reread for uncovered changes.
  Run changed packages' `pnpm -F <pkg> typecheck`, `lint` and tests; each is a Testing verification row (`ran, pass` or `ran, fail`).

After all lenses, apply [testing.md](testing.md), including its rating and coverage-drop diffs.

## Render

Write each lens's Diff rows using opened code.
**json mode skips checks, never reading:** inspect the defining route, task, flag, migration or other code for every field;
omit unsettled fields rather than guess.

Keep [coverage-drop diffs](testing.md#coverage-drop-diff) in standalone json mode too.

Build the canonical [review JSON](formats/json.md), then render with [text](formats/text.md), [HTML](formats/html.md) or [GitHub](formats/github.md) if requested.
The schema defines all review fields and ordering.

Each finding is at most 25 words and two sentences, naming at most three identifiers: the problem with its concrete case, then the fix.
Keep the strongest evidence and drop the rest.

```md
A drafted join shows in Fields but not Joins, because `JoinDiagram` reads the published explore. Pass it the draft's explore.
```

## Verdict

Request changes if the claim is unclear, any Fix remains, or triage's Too big condition is paired with an unverified Fix-level risk.
Approve with notes for Heads-ups alone; approve otherwise.
Name the reviewed head sha.

## Save

Save every review's JSON, whatever the format, to `~/.yoda/reviews/<repo>-<target>-<head>.json` in the user's home directory, wherever yoda runs.

- `<repo>`: the repository name without its owner (`lightdash`).
- `<target>`: `pr-<number>` or `branch-<branch name>` with `/` as `-`.
- `<head>`: the 7-character head sha, plus `-dirty-<first 4 of the diff checksum>` when uncommitted.

Before reviewing, look for the file: an existing one is that exact code's review, so reuse it unless a new review is asked for.
Explain and triage are not saved.

## Re-review

A code change invalidates the verdict.
Review changed areas, callers and seams again with the touched lenses and issue a fresh verdict for that content.
