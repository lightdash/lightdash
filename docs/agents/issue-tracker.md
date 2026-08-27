# Issue tracker: GitHub

Issues and PRDs for this repository live in GitHub Issues. Use the `gh` CLI for all operations against `lightdash/lightdash`.

Linear's GitHub Issues Sync mirrors GitHub issues into the configured Linear team. GitHub remains canonical; assign the synchronized Linear issue to the relevant Linear project for planning.

## Conventions

- Create issues with `gh issue create --repo lightdash/lightdash`.
- Read issues and comments with `gh issue view <number> --repo lightdash/lightdash --comments`.
- List issues with `gh issue list --repo lightdash/lightdash` and structured JSON output.
- Apply or remove labels with `gh issue edit`.
- Close issues with `gh issue close`.
- Link pull requests with `Closes #<number>`.

When a skill says to publish to the issue tracker, create a GitHub issue.
