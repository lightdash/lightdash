---
name: graphite
description: |
  Manage stacked PRs with Graphite CLI (gt) instead of git for branch/PR operations.
  Auto-detects Graphite repos via .git/.graphite_repo_config.
  Use when: creating stacked PRs, navigating branches, submitting PRs, syncing with main,
  restacking after changes, or any gt command usage.
triggers:
  - graphite
  - stacked PRs
  - dependent PRs
  - chained PRs
  - PR stack
  - gt create
  - gt modify
  - gt submit
  - gt sync
  - gt restack
  - gt log
  - gt checkout
  - rebase my stack
  - fix stack conflicts
  - split PR
  - land my stack
  - merge stack
  - sync with main
  - sync with trunk
  - reorder branches
  - fold commits
  - amend stack
  - move branch to different parent
  - stack out of date
invocation: user
---

# Graphite Stacked PRs

Use **Graphite CLI (`gt`)** instead of raw git for all branch and PR operations in Graphite-initialized repos.

## Detection

A repo is Graphite-initialized if `.git/.graphite_repo_config` exists. When detected, prefer `gt` over `git` for branch/PR workflows.

## MCP Tools

The Graphite MCP server (`gt mcp`) is available. Use the `learn_gt` and `run_gt_cmd` tools when available:
- `learn_gt` — look up gt command documentation
- `run_gt_cmd` — execute gt commands directly

## Key Concepts

- A **stack** is a sequence of PRs, each building on its parent
- Each PR must be **atomic** — self-contained and CI-green independently
- Stacks are visualized with **trunk at the BOTTOM**:
  - **Up/Upstack** = away from trunk toward leaves
  - **Down/Downstack** = toward trunk/main

```
PR #3 (top)
   |
PR #2
   |
PR #1
   |
main (trunk)
```

## Command Reference

### Branch Navigation

| Command | Description |
|---------|-------------|
| `gt checkout [branch]` | Switch branches (interactive picker if no arg) |
| `gt co main` | Switch to trunk |
| `gt up [steps]` | Navigate to child branch |
| `gt down [steps]` | Navigate to parent branch |
| `gt top` | Jump to top of stack |
| `gt bottom` | Jump to trunk-closest branch |

### Creating & Modifying Branches

| Command | Description |
|---------|-------------|
| `gt create -a -m "message"` | Create new branch with staged changes |
| `gt c --no-interactive -m "message"` | Create new branch (non-interactive) |
| `gt modify --no-interactive` | Amend current commit |
| `gt m --no-interactive` | Short form: amend current commit |
| `gt modify -a` | Amend with staged changes, then restack |
| `gt modify --commit -a -m "msg"` | Add explicit commit (for review feedback) |
| `gt delete [name]` | Delete branch and metadata |
| `gt rename [name]` | Rename branch |

### Stack Operations

| Command | Description |
|---------|-------------|
| `gt restack` | Rebase dependent branches after changes |
| `gt sync --no-interactive` | Pull latest main, delete merged branches, rebase |
| `gt fold` | Merge branch into its parent |
| `gt split` | Break branch into multiple branches |
| `gt squash` | Consolidate commits in branch |
| `gt reorder` | Reorder branches in stack |
| `gt move --onto <branch>` | Move branch to different parent |

### Submitting PRs

| Command | Description |
|---------|-------------|
| `gt submit --no-interactive` | Push and create/update PR for current branch |
| `gt s --no-interactive` | Short form: submit current branch |
| `gt s --stack --no-interactive` | Submit current + all descendant branches |
| `gt ss` | Alias for `gt submit --stack` |
| `gt s --draft --no-interactive` | Submit as draft PR |
| `gt submit --reviewers alice,bob` | Assign reviewers |

### Viewing

| Command | Description |
|---------|-------------|
| `gt log` / `gt l` | Show stack visualization |
| `gt log short` / `gt ls` | Abbreviated stack view |
| `gt pr [branch]` | Open PR in browser |
| `gt info [branch]` | Display branch details |

### Recovery

| Command | Description |
|---------|-------------|
| `gt continue` | Resume halted operation (after conflict resolution) |
| `gt abort` | Cancel current operation |
| `gt undo` | Revert last operation |

## Git-to-Graphite Translation

| Instead of... | Use... |
|---------------|--------|
| `git checkout -b branch` | `gt c --no-interactive -m 'message'` |
| `git push` | `gt s --no-interactive` |
| `git rebase main` | `gt restack` |
| `git commit --amend` | `gt m --no-interactive` |
| `git pull origin main` | `gt sync --no-interactive` |

## Workflow Rules

### Branch Selection Decision Tree

| Situation | Action |
|-----------|--------|
| On main? | **Never commit to main.** Create new branch: `gt c --no-interactive -m 'message'` |
| On a branch + changes are related WIP? | Amend in place: `gt m --no-interactive` |
| On unrelated branch + independent changes? | `gt co main` then create new branch |
| On a branch + changes depend on it? | Create stacked branch: `gt c --no-interactive -m 'message'` |

### Always Use `--no-interactive`

All `gt` commands that support it should use `--no-interactive` to avoid blocking on prompts. Key commands:
- `gt c --no-interactive -m 'message'`
- `gt m --no-interactive`
- `gt s --no-interactive` or `gt s --stack --no-interactive`
- `gt sync --no-interactive`

### Staging Rules

1. Check if working tree is dirty (`git diff`)
2. **Never mix** different fixes/features/WIP together
3. Stage only **one set of related** changes using `git add <specific-files>`

### Commit Messages

Use **semantic commit names**: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`

### Submitting

- Submit WIP as **draft**: `gt s --draft --no-interactive`
- Submit final work: `gt s --no-interactive`
- Submit entire stack: `gt s --stack --no-interactive`

### Handling Conflicts

```bash
# During restack, if conflicts occur:
# 1. Resolve conflicts in the files
# 2. Stage resolved files
git add <resolved-files>
# 3. Continue the operation
gt continue
```

### Completion Criteria

- Working tree must be **clean** (no unstaged/untracked changes)
- All branches in the stack are submitted
- `gt log` shows the correct stack structure

## Creating a Stack (Typical Flow)

```bash
# Start from trunk
gt co main
gt sync --no-interactive

# Create first PR
# ... make changes ...
git add <specific-files>
gt c --no-interactive -m 'feat: add database migration'

# Create second PR on top
# ... make changes ...
git add <specific-files>
gt c --no-interactive -m 'feat: add backend service'

# Create third PR on top
# ... make changes ...
git add <specific-files>
gt c --no-interactive -m 'feat: add frontend components'

# Submit entire stack
gt s --stack --no-interactive

# Verify
gt log
```

## Addressing Review Feedback

```bash
# Navigate to the PR that needs changes
gt checkout branch-name

# Make changes, stage them
git add <specific-files>

# Amend and restack all branches above
gt m --no-interactive

# Push updates for the whole stack
gt s --stack --no-interactive
```
