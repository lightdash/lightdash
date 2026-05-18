---
name: renovate-pr
description: Test and assess an open Renovate dependency-bump PR. Picks the first open Renovate PR, checks out the branch, starts the app, exercises code paths affected by the upgraded package, reviews the changelog and (if needed) the upstream source diff, and reports whether the bump is safe to merge. Use when asked to "test a renovate PR", "triage renovate", "assess a renovate bump", or "check a dependency upgrade".
---

# Renovate PR Triage

Pick the first open Renovate PR, run the app against it, exercise the affected code paths, and tell the user whether the bump is safe.

## Iron Law

**The recommendation MUST be evidence-backed.** "Looks fine" is not a recommendation. Each verdict must cite: changelog read, codebase usage grepped, and at least one runtime check (page loaded / endpoint hit / log inspected). If you can't gather evidence for an area, say so — never paper over it.

---

## Phase 0: Pick the PR

Find open Renovate PRs and take the first one:

```bash
gh pr list --state open --json number,title,headRefName,author,createdAt --limit 100 \
  | python3 -c "
import json, sys
prs = json.load(sys.stdin)
renovate = [p for p in prs if p['author']['login'] == 'app/lightdash-renovate-bot' or p['headRefName'].startswith('renovate/')]
renovate.sort(key=lambda p: p['createdAt'])
if not renovate:
    print('NONE')
else:
    p = renovate[0]
    print(f\"{p['number']}\t{p['headRefName']}\t{p['title']}\")
"
```

If `NONE`, stop and tell the user there are no open Renovate PRs.

Otherwise, take the first one as `$PR_NUMBER` and report to the user:

```
Triaging Renovate PR #<number>: <title>
Branch: <branch>
```

## Phase 1: Identify the dependency change

```bash
gh pr view $PR_NUMBER --json title,body,headRefName,additions,deletions,files,labels
gh pr diff $PR_NUMBER
```

Renovate PR bodies always contain a markdown table that looks like:

```
| Package | Change | Age | Confidence |
|---|---|---|---|
| [pkgname](homepage) ([source](https://github.com/owner/repo)) | [`1.2.3` → `2.0.0`](renovatebot.com/diffs/...) | ... | ... |
```

Parse this to extract for **each** package:
- **Name** (e.g. `nodemailer`)
- **Old version** → **New version**
- **Bump type**: patch (z), minor (y), major (x) — derive from semver
- **Source repo URL** (the `[source]` link, e.g. `github.com/owner/repo`) — needed for changelog & source-diff lookup
- **Is this a security advisory?** (label `security` on the PR, or `[security]` in the title)

Show the user the parsed list before proceeding:

```
Dependencies in PR #<number>:
  1. nodemailer  7.0.13 → 8.0.5  (MAJOR, security)  github.com/nodemailer/nodemailer
  2. ...
```

## Phase 2: Look up changelog & release notes

For each package, fetch the upstream release notes spanning `oldVersion..newVersion`. Try in order, stop at the first that yields useful content:

1. **GitHub Releases** (best for most JS packages):
   ```bash
   gh api "repos/<owner>/<repo>/releases?per_page=100" --jq '.[] | select(.tag_name | test("<oldVersion>|<newVersion>")) | {tag: .tag_name, name: .name, body: .body}'
   ```
   Or list releases between the two tags:
   ```bash
   gh api "repos/<owner>/<repo>/compare/v<oldVersion>...v<newVersion>" --jq '{commits: .commits | length, ahead_by: .ahead_by}'
   ```
2. **CHANGELOG.md in the repo** via WebFetch:
   ```
   https://raw.githubusercontent.com/<owner>/<repo>/<default-branch>/CHANGELOG.md
   ```
3. **Renovate's own diff page** (linked in the PR body):
   ```
   https://renovatebot.com/diffs/npm/<pkg>/<oldVersion>/<newVersion>
   ```
4. **WebSearch** as last resort: `"<package-name> <oldVersion> <newVersion> breaking changes"`

For **each** package, extract:
- **Breaking changes** — explicit `BREAKING:` entries, removed APIs, behavior changes
- **Security fix details** (if security advisory) — what CVE, what attack vector
- **New required configuration** — env vars, options that must be set
- **Deprecations** that may affect us soon

Skip noise (typo fixes, internal refactors, doc-only changes).

## Phase 3: Map upgraded package → our usage

For each package, find every place we use it in this monorepo:

```bash
# Direct imports / requires
grep -rEn "(from ['\"]<pkg-name>['\"]|require\(['\"]<pkg-name>['\"]\))" packages/ --include='*.ts' --include='*.tsx' --include='*.js'

# Where the package is declared
grep -rEn "\"<pkg-name>\":" packages/*/package.json
```

Categorise hits:
- **Direct API consumers** — code that calls into the package
- **Transitive only** — appears in lockfile but no direct imports (much lower risk surface, but still worth confirming)
- **Type-only imports** — `import type { ... }` (compile-time only)
- **Test fixtures** — usage only inside `*.test.ts` / `*.spec.ts`

Hold this list — Phase 6 will exercise the user-facing flows that touch these files.

## Phase 4: Upstream source diff (only if needed)

If Phase 2's changelog is **vague**, **missing**, or **claims "no breaking changes"** but a major version was bumped, drop down to the source diff:

```bash
gh api "repos/<owner>/<repo>/compare/<oldTag>...<newTag>" \
  --jq '.files[] | select(.filename | test("^(src|lib|index)") and (test("test|spec") | not)) | {filename, status, additions, deletions}'
```

For files that look load-bearing for our usage in Phase 3, fetch the patch:

```bash
gh api "repos/<owner>/<repo>/compare/<oldTag>...<newTag>" --jq '.files[] | select(.filename == "<file>") | .patch'
```

Read the diff and check whether any API our codebase calls has changed signature, behavior, or default values.

**Don't read the entire upstream diff blindly.** Use the codebase-usage list from Phase 3 to target only files that match the APIs we actually call.

## Phase 5: Start the app on the PR branch

### 5a. Decide: worktree or in-place checkout?

Before checking out, check whether the user prefers worktrees for Lightdash work. Search **both**:

```bash
# User-level memory (per-project)
grep -ril "worktree" /Users/charlie/.claude/projects/-Users-charlie-projects-lightdash/memory/ 2>/dev/null

# Global instructions
grep -n "worktree" /Users/charlie/.claude/CLAUDE.md 2>/dev/null | head -20
```

**If a worktree preference is found** (e.g. global CLAUDE.md says "ALWAYS create a fresh worktree first" or memory has a feedback entry pinning the same):

```bash
# Get the PR branch name (extracted in Phase 0)
BRANCH=$(gh pr view $PR_NUMBER --json headRefName -q .headRefName)

# Create/enter the worktree from ~/projects (where `w` must be run)
cd ~/projects
w lightdash "$BRANCH" pwd   # `w ... <command>` runs in the worktree and returns
```

The `w` command auto-detects `origin/<branch>` and creates the worktree tracking it. Then `cd` into the worktree path for the remaining phases:

```bash
cd ~/projects/worktrees/lightdash/"$BRANCH"
```

Note: Renovate branches contain a `/` (e.g. `renovate/npm-nodemailer-vulnerability`). The `w` command handles this by creating a nested subdirectory under `~/projects/worktrees/lightdash/`. That's expected — don't try to sanitize the name.

**If no worktree preference is found**, stay in the current directory and check out the branch in place:

```bash
gh pr checkout $PR_NUMBER
```

Report to the user which mode you picked and why — e.g. `"Using worktree (preference found in ~/.claude/CLAUDE.md)"` or `"Checking out in place (no worktree preference)"`.

### 5b. Regenerate lockfile if missing

```bash
git status pnpm-lock.yaml
# If missing or stale:
sfw pnpm install
```

### 5c. Start the dev stack

The running app is what we're testing against, not just the diff:

```
/docker-dev start
```

Wait for the State Detection to report all `OK:` lines and PM2 processes to be `online`. If the build or PM2 startup fails, that's the first signal — the bump may have broken the install or runtime resolution. Report this immediately and stop.

When using a worktree, `/docker-dev start` claims a fresh port slot for this instance (per the docker-dev port-allocation flow), so it won't conflict with another running Lightdash instance in the main checkout or another worktree.

## Phase 6: Test the change with /debug-local tooling

Use the `/debug-local` skill workflow — but inverted. Instead of investigating a known symptom, we're **fishing for symptoms** in the code paths that touch the upgraded package.

For each package, design 1–3 focused checks based on what the package actually does. Examples:

| Package category | What to exercise |
|------------------|------------------|
| Email (e.g. `nodemailer`) | Trigger an invite or password reset; verify the email lands in Mailpit (`http://localhost:8025`) |
| Auth / OAuth (e.g. `@node-oauth/oauth2-server`) | Login flow via `demo@lightdash.com` / `demo_password!`; OAuth client flow if applicable |
| HTML sanitization (e.g. `sanitize-html`) | Render a markdown tile / dashboard description containing rich content |
| Rich text editor (e.g. `@tiptap/*`) | Open a page that uses the editor (dashboard tile description, comment) and type into it |
| Translation / i18n (e.g. `i18next-locize-backend`) | Switch language; verify strings render and no console errors |
| Warehouse drivers (`pg`, `snowflake-sdk`, etc.) | Run a query via `curl -H "Authorization: ApiKey $LDPAT" "$LIGHTDASH_API_URL/api/v1/projects/<uuid>/explores"` and against the SQL runner |
| Frontend UI library (`@mantine/*`, `react-*`) | Open the dashboard view; check for console errors and visual regressions |

For each check, use these tools in parallel:

- **PM2 logs** — `pnpm exec pm2 logs lightdash-api --lines 50 --nostream` after exercising the flow
- **Spotlight** — `mcp__spotlight__search_errors {"timeWindow": 300}` for recent runtime errors; `mcp__spotlight__search_traces {"timeWindow": 300}` to confirm requests completed without warnings
- **Chrome DevTools MCP** — for UI checks: `mcp__chrome-devtools__new_page`, `mcp__chrome-devtools__take_snapshot`, `mcp__chrome-devtools__list_console_messages`
- **curl + LDPAT** — for API-only checks (faster than browser):
  ```bash
  source .env.development.local
  curl -s -H "Authorization: ApiKey $LDPAT" "$LIGHTDASH_API_URL/api/v1/health" | jq
  ```

**What counts as a failure signal:**
- Stack traces or unhandled rejections in PM2 logs
- Spotlight errors with timestamps after we triggered the flow
- HTTP 500s on previously-working endpoints
- Console errors in the browser that weren't there on `main`
- Behavior change visible to the user (e.g. an email body now missing headers, an editor that won't accept input)

**What is NOT a failure:**
- Pre-existing errors unrelated to the bumped package
- Deprecation warnings that don't affect behavior
- Successful response with different but valid output shape (note it, but don't fail on it)

If a test fails: stop, capture evidence (log lines, trace ID, screenshot), and move that finding to the report. Continue testing the other packages — one failure doesn't invalidate triage of unrelated bumps.

## Phase 7: Verdict

Score each package independently using this rubric, then roll up to an overall PR verdict.

| Verdict | Criteria |
|---------|----------|
| 🟢 **SAFE** | Patch or minor bump, no breaking changes in changelog, no usage requires changes, runtime checks pass cleanly |
| 🟡 **LIKELY SAFE** | Minor/major bump, changelog has breaking changes but none touch APIs we use, runtime checks pass, recommend a quick human glance at the affected area |
| 🟠 **NEEDS CODE CHANGES** | Breaking changes affect our usage — list the call sites that must be updated before merge |
| 🔴 **UNSAFE / BLOCKED** | Runtime check failed, install failed, or the change clearly breaks a flow |
| ⚪ **CANNOT ASSESS** | Couldn't run the app, no test path for this package, or changelog missing and source diff too large to read meaningfully — escalate to user with what blocked you |

Output to the user (and only to the user — do NOT post a PR comment unless they explicitly ask):

```
RENOVATE PR TRIAGE — #<number>
════════════════════════════════════════
Title:      <PR title>
Branch:     <branch>
Bump type:  <patch|minor|major> [security]

Packages
────────
1. <pkg>  <old> → <new>   Verdict: 🟢|🟡|🟠|🔴|⚪
   Changelog: <link or summary>
   Our usage: <count> direct imports across <N> files
   Tested:    <what flow you exercised>
   Evidence:  <log line, trace ID, or screenshot path>
   Notes:     <breaking changes that mattered, or "none">

2. ...

Overall verdict: 🟢|🟡|🟠|🔴|⚪
Recommendation:  <merge / merge with quick review / fix code first / do not merge>
════════════════════════════════════════
```

## Phase 8: Cleanup

Leave the app running unless the user asks otherwise — they may want to poke at it further.

- **If you used a worktree** (Phase 5a): leave it in place. The user can return to it with `w lightdash <branch>` or remove it later via `w --rm lightdash <branch>`. Do not delete it automatically — that destroys evidence the user may want to inspect.
- **If you checked out in place**: return to the original branch with `git checkout -`.

If you regenerated `pnpm-lock.yaml` and committed it during Phase 5, note that in the final report so the user knows there's a new commit on the PR branch.

---

## Notes

- **Never approve or merge the PR.** This skill triages only.
- **Don't post a PR comment unless asked.** The output above is for the user in this conversation. If they want it on the PR, copy it via `gh pr comment $PR_NUMBER --body "..."`.
- **First PR only.** The user said "pick the first one". If they want a specific PR, they'll pass a number — accept `$ARGUMENTS` as a PR number override:
  ```
  if [ -n "$ARGUMENTS" ]; then PR_NUMBER="$ARGUMENTS"; fi
  ```
- **Don't read every line of every changelog.** Focus on `BREAKING`, `removed`, `deprecated`, and security advisory entries.
- **Stale `pnpm-lock.yaml` is a common Renovate failure mode** — if `sfw pnpm install` modifies the lockfile, commit it on the PR branch and push (`git push`).
- For monorepo-wide impact (e.g. `@types/node`), grepping usage isn't meaningful — fall back to running `pnpm -F backend typecheck` and `pnpm -F frontend typecheck` and treating typecheck failures as the runtime check.
- For Lightdash specifically, watch for the cross-service file pattern (`packages/backend/src/clients/FileStorage/`) and the warehouse adapter layer when warehouse SDKs are bumped — these are common bump-breakage sites.
