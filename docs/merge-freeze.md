# Merge freeze

`release.yml` fires on every push to `main`, so the release that goes out is whatever `main` contains at that moment. When something needs to reach a release on its own — a fix someone is waiting on — hold merges rather than asking people in Slack not to merge:

-   **Freeze**: `gh workflow run merge-freeze.yml -f action=freeze`. This adds a `merge-freeze` required status check to the `main` ruleset. Nothing ever reports that check, so merges into `main` are blocked for everyone without a ruleset bypass.
-   **Unfreeze**: the same workflow with `action=unfreeze`. Do it as soon as the release is cut — a freeze left on blocks the whole team, and there is no auto-expiry. Repeat unfreeze to refresh stale PR checks even when the ruleset is already open. In `#engineering`, ask `@Cloudy unfreeze merges to lightdash`.
-   **Any verified Lightdash employee can unfreeze through Cloudy in Slack.** Direct Actions dispatch remains available to the recorded owner. A repo admin can remove the `merge-freeze` check from the `main` ruleset by hand.
-   **There is no free-text reason, deliberately** — this repo is public, and a reason box invites someone to name a customer in it. Blocked PRs show who froze it so people know who to ask, and `#engineering` gets the same on both directions. Say why in Slack.
-   **Only `main` is affected.** Stacked PRs merging into their parent branch are untouched.
-   **Check the current state**: the `MERGE_FREEZE` repo variable (`true`/`false`), and `MERGE_FREEZE_ACTOR` for who froze it — `gh variable list -R lightdash/lightdash`. The authority is the ruleset itself: `merge-freeze` in the `main` ruleset's required status checks (`gh api repos/lightdash/lightdash/rulesets`). The variables are a mirror, so trust the ruleset if they ever disagree.
-   **Agents: never freeze or unfreeze on your own initiative.** It blocks every engineer in the repo. Ask, and let a human dispatch it.

Freezing analytics/customer *deployments* is a different mechanism in a different repo — see the `lightdash-cloud` CLAUDE.md.
