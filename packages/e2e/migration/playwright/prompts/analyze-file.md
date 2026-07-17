# Discovery agent contract

You are the sole analyst for one Cypress source file. Produce evidence, not implementation.

## Inputs supplied by the orchestrator

- `SOURCE_FILE`: exactly one Cypress spec.
- `FINDINGS_FILE`: the only file you may create or modify.

## Hard boundaries

1. Read and follow the repository and E2E instructions before analysis.
2. Do not edit tests, application code, configuration, manifests, lockfiles, or other findings.
3. Do not run installs, migrations, seeds, browsers, or destructive commands.
4. Do not stage, commit, branch, push, or use Graphite.
5. You may inspect only the assigned spec, the hooks/commands it invokes, relevant fixtures/configuration, and application code needed to explain behavior or locators.
6. Never read `packages/formula-tests/`.
7. If evidence is unavailable, record an open question instead of guessing.

## Required investigation

- Enumerate every active test and every skipped test, including inherited `describe.skip` state.
- Expand each custom Cypress command used by the file and cite its implementation.
- Identify ordering dependencies, hooks, aliases, shared state, cleanup, and assumptions about prior suites.
- Identify authentication roles, session behavior, permissions, and required storage states.
- Identify all persistent mutations and whether concurrent Cypress/Playwright execution can collide.
- Identify API requests, response assumptions, seed UUIDs/names, duplicate-name risks, and external services.
- Identify nonstandard mechanics: debounce/network waits, custom timeouts, downloads/uploads, popups, iframes, clipboard, canvas/SVG, Monaco, virtualization, drag-and-drop, browser APIs, timezone, and environment variables.
- Trace skip comments and recommend Playwright, API tests, CLI/Node, unit tests, removal, or clarification per test.
- Determine whether shared infrastructure is genuinely required. Never propose a shared helper for one local use.
- Provide an exact target-file plan and exact verification commands.

## Difficulty rubric

Score each from 0 to 3 and total them:

- persistent/shared state
- browser interaction complexity
- environment/external dependencies
- synchronization/flakiness
- authentication/authorization
- cross-file infrastructure

## Required findings shape

Create `FINDINGS_FILE` with these headings:

1. `# <SOURCE_FILE>`
2. `## Classification`
3. `## Test inventory` — table with title, effective status, behavior, mutations, unusual mechanics, recommended target.
4. `## Cypress command expansion`
5. `## State, seed, and environment assumptions`
6. `## Synchronization and timeout requirements`
7. `## Locator and strictness risks`
8. `## Nonstandard or surprising behavior`
9. `## Coordination requirements`
10. `## Exact port plan`
11. `## Verification plan`
12. `## Open questions`
13. `## Port history`

Classification must include:

```text
Recommended runner:
Execution lane:
Active tests:
Skipped tests:
Persistent mutation:
Shared-preview dual-run safe:
Difficulty total:
Coordination keys:
Analysis status: analyzed | clarification-required | coordination-required
```

Use repository-relative path and line evidence throughout. Leave `Port history` as `Not started.` End your terminal response with `DISCOVERY_COMPLETE` and the findings path.
