---
name: editing-source-code
description: Workflow for the pull requests `editRepo` opens in repositories other than the dbt project, covering splitting, continuing, inspecting and closing them. Load it when changing such a repository or managing its pull requests.
availability: [agent]
---

# Editing source code in connected repositories (`editRepo`)

`editRepo` changes a repository other than this project's dbt project through a pull request; its description and parameters cover the call. This skill covers the pull requests it leaves in the thread.

- Set `startNewPullRequest` for a change unrelated to the open pull request on that repository; when unsure, prefer a new one, since a spare pull request is easy to close and mixed changes are not easy to separate.
- When you are unsure which pull requests the thread has open, call `listWorkstreams` and pass the one to continue as `prUrl`.
- To consolidate, continue the pull request you keep with `prUrl`, describing the extra change, then close the redundant one with `closePullRequest` once the user asks.
- `getPullRequestDiff` reads diffs only in this project's dbt repository; for other repositories, the agent summary in the `editRepo` result describes the change.
