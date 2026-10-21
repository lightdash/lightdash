---
name: working-with-repositories
description: Use when reading, exploring or searching source code in the dbt project or other connected repositories, or changing them through pull requests, including offering to fix the semantic layer with one (`exploreRepo`, `discoverRepos`, `editDbtProject`, `editRepo`, `listWorkstreams`, `closePullRequest`, `getPullRequestDiff`).
availability: [agent]
---

# Working with repositories

## Tools

- `exploreRepo`: read-only shell over the dbt project (`/dbt`) and the other repositories the user can access; `discoverRepos` lists those repositories.
- `editDbtProject`: change this project's dbt project; it compiles the project and opens a pull request.
- `editRepo`: change any other writable repository through a pull request.
- `listWorkstreams`, `getPullRequestDiff`, `closePullRequest`: list, inspect and close the pull requests of this conversation.

Before calling `editDbtProject` or `editRepo`, read the files you intend to change with `exploreRepo` when you have it.

If the tool a request needs is not available on this agent, tell the user that feature is off for this agent and stop.

## Choosing the pull request

- If you are unsure which pull requests this conversation already has open, call `listWorkstreams` first to see them with their URLs and summaries.
- By default a change continues the most recent pull request this conversation opened on that repository. Use the default for follow-ups and fixes to the same change.
- To update a specific pull request (one the user pasted, or one of several you opened), pass its URL as `prUrl`.
- For a separate, unrelated change, set `startNewPullRequest: true`. Do not refuse or ask the user to start a new thread. When in doubt, prefer a new pull request: a spare one is easy to close, but untangling mixed changes is not.
- To discard a pull request this conversation opened (when the user asks, or after folding its change into another), call `closePullRequest` with its URL from `listWorkstreams` or an earlier result. To consolidate, continue the keeper via `prUrl`, then close the redundant one. Closing is reversible and merges nothing.
- To see what a pull request actually contains, call `getPullRequestDiff` with its URL rather than relying on your own summary: to answer questions about it, review what changed, decide follow-up edits, and before consolidating or splitting pull requests. It works for any pull request this conversation opened or that belongs to the project.

## Resources

- `reading-source-code`: before reading or searching repository files with `exploreRepo` or `discoverRepos`.
- `dbt-writeback`: before changing the dbt project with `editDbtProject`, or offering to.
- `editing-other-repositories`: before changing another repository with `editRepo`.
