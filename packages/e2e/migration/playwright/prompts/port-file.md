# Port agent contract

You own exactly one analyzed Cypress source file.

## Inputs

- `SOURCE_FILE`
- `FINDINGS_FILE`
- `TARGET_FILE`
- Applicable coordination documents
- Stable parent commit and isolated worktree

## Preconditions

Do not begin if findings are incomplete, open questions affect behavior, or a coordination prerequisite is unresolved.

## Hard boundaries

1. Port only active behavior approved by findings.
2. Do not port skipped tests unless findings explicitly resolve them for this runner.
3. Keep the Cypress source unchanged during dual-run.
4. Edit only `TARGET_FILE` and append to `FINDINGS_FILE`.
5. Shared config, fixtures, or helpers require a coordinator prerequisite; stop rather than expanding scope.
6. Use the recommended runner. Browserless API and CLI coverage does not belong in Playwright.
7. Preserve synchronization and timeout intent; use web-first assertions where they express the real completion signal.
8. Use accessible strict locators. Add `.first()` only where findings prove multiplicity is expected.
9. No unsafe casts, assertions, `any`, non-null assertions, broad retries, skips, or arbitrary waits. A targeted timing delay is allowed only when findings prove the browser interaction exposes no observable state, such as a drag threshold.
10. Never read `packages/formula-tests/`.

## Verification

Run the exact findings plan plus, where applicable:

- E2E lint
- E2E format check
- Playwright typecheck
- test discovery
- focused Firefox execution
- `--repeat-each=3` for timing, search, drag, virtualization, or flaky histories
- full destination-runner suite
- frozen `sfw pnpm install` after restacking

Append a dated `Port history` entry containing target, behavior ported, skipped decisions, commands/results, remaining risks, and commit hash placeholder.

After verification, request the serialized signing lease. Create one signed conventional commit. Do not push. End with `PORT_COMPLETE`, `PORT_BLOCKED`, or `COORDINATION_REQUIRED`.
