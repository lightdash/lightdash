# Graphite CLI/MCP Research Summary

## Overview

**Graphite** is a tool for managing **stacked pull requests** - breaking large engineering tasks into sequences of small, incremental code changes that can be tested, reviewed, and merged independently. The CLI tool (`gt`) is a Git wrapper that simplifies trunk-based development workflows.

**GT MCP** is Graphite's Model Context Protocol server, built into the CLI (v1.6.7+), that allows AI agents like Claude Code to automatically create stacked PRs.

## Key Concepts

### Stacked Pull Requests
- A **stack** is a sequence of PRs, each building off its parent
- Each PR should be **atomic** - self-contained and CI-green independently
- Stacks are visualized with **trunk at the BOTTOM**:
  - **Upstack/Up** = away from trunk toward leaves
  - **Downstack/Down** = toward trunk/main

### Mental Model
```
PR #4 (top of stack)
   ↑
PR #3
   ↑
PR #2
   ↑
PR #1
   ↑
main (trunk)
```

## Installation

### Homebrew (Recommended)
```bash
brew install withgraphite/tap/graphite
gt --version
```

### NPM
```bash
npm install -g @withgraphite/graphite-cli@stable
gt --version
```

### Requirements
- Git 2.38.0+
- Graphite CLI v1.6.7+ (for MCP support)

### Authentication
```bash
# Visit https://app.graphite.dev/activate to get token
gt auth --token <YOUR_AUTH_TOKEN>
```

### Repository Initialization
```bash
cd ~/my-project
gt init  # Select trunk branch (usually main)
```

## GT MCP Setup

### For Claude Code
```bash
claude mcp add graphite gt mcp
```

### For Cursor
Add to `~/.cursor/mcp.json` or via Settings → Tools & Integrations → Add Custom MCP:
```json
{
  "mcpServers": {
    "graphite": {
      "command": "gt",
      "args": ["mcp"]
    }
  }
}
```

## CLI Command Reference

### Branch Navigation
| Command | Description |
|---------|-------------|
| `gt checkout [branch]` | Switch branches (interactive picker if no arg) |
| `gt checkout main` | Switch to trunk |
| `gt up [steps]` | Navigate to child branch |
| `gt down [steps]` | Navigate to parent branch |
| `gt top` | Jump to top of stack |
| `gt bottom` | Jump to trunk-closest branch |
| `gt parent` | Show current branch's parent |
| `gt children` | Show current branch's descendants |

### Creating & Modifying Branches
| Command | Description |
|---------|-------------|
| `gt create [name]` | Create new branch stacked on current |
| `gt create -a -m "message"` | Create with staged changes and commit |
| `gt modify` | Amend current commit |
| `gt modify -a` | Amend with staged changes, then restack |
| `gt modify --commit -a -m "msg"` | Create explicit commit (for feedback) |
| `gt delete [name]` | Delete branch and metadata |
| `gt rename [name]` | Rename branch |

### Stack Operations
| Command | Description |
|---------|-------------|
| `gt restack` | Rebase dependent branches after changes |
| `gt sync` | Pull latest from main, delete merged branches, rebase stacks |
| `gt fold` | Merge branch into its parent |
| `gt split` | Break branch into multiple branches |
| `gt squash` | Consolidate commits in branch |
| `gt reorder` | Interactively reorder branches |
| `gt move --onto <branch>` | Move branch to different parent |

### Submitting PRs
| Command | Description |
|---------|-------------|
| `gt submit` | Push and create/update PR for current branch |
| `gt submit --stack` | Submit current + all descendant branches |
| `gt submit --no-interactive` | Submit current + all downstack (no prompts) |
| `gt ss` | Alias for `gt submit --stack` |
| `gt submit --ai` | Auto-generate PR title/description with AI |
| `gt submit --reviewers alice,bob` | Assign reviewers |

### Viewing & Utilities
| Command | Description |
|---------|-------------|
| `gt log` / `gt l` | Show stack visualization |
| `gt log short` / `gt ls` | Abbreviated stack view |
| `gt pr [branch]` | Open PR in browser |
| `gt info [branch]` | Display branch details |
| `gt get [branch]` | Fetch teammate's stack |

### Recovery Commands
| Command | Description |
|---------|-------------|
| `gt continue` | Resume halted operation (after conflict resolution) |
| `gt abort` | Cancel current operation |
| `gt undo` | Revert last operation |

## Typical Workflows

### Creating a Stack
```bash
# Start from trunk
gt checkout main

# Create first PR
# ... make changes ...
gt create -a -m "feat: add API interface"

# Create second PR on top
# ... make changes ...
gt create -a -m "feat: implement server logic"

# Create third PR
# ... make changes ...
gt create -a -m "feat: add frontend components"

# Submit entire stack
gt submit --stack
```

### Addressing Review Feedback
```bash
# Navigate to the PR that needs changes
gt checkout branch-name

# Make changes
# ... edit files ...

# Amend and restack all branches above
gt modify -a

# Push updates
gt submit --stack
```

### Syncing with Main
```bash
# Pull latest main and rebase all stacks
gt sync
```

### Handling Conflicts
```bash
# During restack, if conflicts occur:
# 1. Resolve conflicts in files
# 2. Stage resolved files
git add <resolved-files>
# 3. Continue
gt continue
```

## AI Agent Best Practices

### Stack Planning
Before writing code, plan the stack structure:
1. Map tasks to individual PRs
2. Order by dependency (schema → API → UI)
3. Keep stacks shallow (3-5 PRs max)
4. Each PR should be one logical change

### Example Stack Plan
```
Task: Add user authentication

Stack:
1. PR #1: Add user model and database schema
2. PR #2: Implement authentication API endpoints
3. PR #3: Add login/signup frontend components
4. PR #4: Add session management and middleware
```

### Verify-Then-Commit Pattern
1. Write code
2. Run tests locally
3. Verify linting passes
4. Then commit/create branch

### Command Translations from Git
| Instead of... | Use... |
|---------------|--------|
| `git checkout -b branch` | `gt create branch` |
| `git push` | `gt submit` |
| `git rebase main` | `gt restack` |
| `git commit --amend` | `gt modify` |

## Skill Trigger Keywords

A Graphite skill should trigger on:
- graphite, stacked PRs, dependent PRs, chained PRs, PR stack
- gt create, gt modify, gt submit, gt sync, gt restack
- gt log, gt checkout, gt up, gt down
- rebase my stack, fix stack conflicts, split PR
- land my stack, merge stack, sync with main/trunk
- reorder branches, fold commits, amend stack
- move branch to different parent, stack out of date

## Detection

Graphite-initialized repos have:
- `.git/.graphite_repo_config` file

## Key Files for Skill Implementation

### SKILL.md Structure
```yaml
---
name: graphite
description: |
  Manage stacked PRs with Graphite CLI (gt) instead of git for branch/PR operations.
  Auto-detects Graphite repos via .git/.graphite_repo_config.
triggers:
  - graphite
  - stacked PRs
  - gt create
  - gt submit
  - gt sync
  - gt restack
  - PR stack
---

# Graphite Stacked PRs Skill

[Instructions for Claude...]
```

### Session Start Hook
Detect Graphite repos on session start:
```bash
if [ -f ".git/.graphite_repo_config" ]; then
  echo "Graphite repo detected - use gt commands for stacks"
fi
```

## Lightdash Team Workflow (from @owlas)

A practical Graphite workflow used by the team:

### Conflicts
- Inspect and fix conflicts, ask for help if needed

### WIP (Work in Progress)
- WIP should always be in git + GitHub
- Mark clearly as WIP and as a **draft PR** assigned to `owlas`

### Staging (use `git add`)
1. Check if working tree is dirty (`git diff`)
2. **Never mix** different fixes/features/WIP together
3. Stage only **one set of related** changes

### Branch Selection Decision Tree
Use the Graphite CLI:

| Situation | Action |
|-----------|--------|
| On main? | **Never commit to main.** Create new branch: `gt c --no-interactive -m 'message'` |
| On a branch + staged files are related WIP? | Amend in place: `gt m --no-interactive` |
| On unrelated branch + independent changes? | `gt co main` → create new branch with staged changes |
| On a branch + staged changes depend on it? | Create stacked branch: `gt c --no-interactive -m 'message'` |

### Key Commands
```bash
gt c --no-interactive -m 'feat: description'  # Create new branch
gt m --no-interactive                          # Modify/amend existing branch
gt co main                                     # Checkout main
gt sync --no-interactive                       # Update main
gt s --draft --no-interactive                  # Submit as draft PR
```

### Pushing
- Always push PRs as **drafts** if WIP
- Tag WIP PRs appropriately
- Use **semantic commit names** (feat:, fix:, chore:, etc.)

### Completion Criteria
- Working tree must be **clean** (no unstaged/untracked changes)

## Sources

- [Graphite CLI Quick Start](https://graphite.com/docs/cli-quick-start)
- [GT MCP Documentation](https://graphite.com/docs/gt-mcp)
- [Command Reference](https://www.graphite.com/docs/command-reference)
- [Building AI Agents with Graphite](https://graphite.com/guides/building-ai-agents-with-graphite)
- [How I Got Claude to Write Better Code](https://graphite.com/blog/how-i-got-claude-to-write-better-code)
- [Graphite CLI GitHub Docs](https://github.com/withgraphite/docs)
- [georgeguimaraes/claude-code-graphite](https://github.com/georgeguimaraes/claude-code-graphite)
- [PulseMCP Graphite CLI Server](https://www.pulsemcp.com/servers/graphite-cli)
