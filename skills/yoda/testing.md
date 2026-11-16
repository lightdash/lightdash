# Testing

Apply after all lenses, on every review, even with explicit lens names.
Test infrastructure belongs to Tooling; this file judges coverage and produces Testing rows/rating and coverage-drop diffs.
Findings follow [shared ownership and evidence policy](lenses/README.md).

Worst case: a main-path bug ships because no test fails, or mocks hide it.
For each serious path, find the test, its kind and whether PR CI selects it; file counts prove nothing.

## Scope

A **risky path** is a changed main path owned by Schema, Access, Core, Embed, Sandbox, Jobs, Integrations, Live data sources, Config, Warehouse or API;
in-product AI tool code;
or any change starting/stopping a flow or changing results/saved content.
Embed covers viewer-reachable behaviour; API covers external contracts, including wire protocols, but an optional field/enum addition alone isn't risky.
Prompt, description and model evidence follows the AI Agent/MCP checks.

These criteria also apply to UI, CLI, tooling and dev scripts.
Different steps to the same working outcome aren't risky by themselves.
Cosmetic changes affect no flow, result or saved content (copy, layout, styling or display states).
Missing tests off risky paths cause only a Gap and at most `thin`, never a finding or `missing`.

## Checks

- **fails without:** a risky path has a test failing when the change is reverted; otherwise Heads-up.
  Behaviour-preserving refactors pass if existing tests reach the moved path.
  Stated deletions need absence tests only if restoring behaviour harms an identified retained flow.
- **main path:** test the changed decision as callers run it, not only helpers.
  Missing coverage on a risky path is Heads-up.
  Tests of helpers don't cover changed wiring between them.
- **right kind:** each kind of change has its place:
  - API behaviour and denied roles: `packages/api-tests`.
  - Rendered UI: `packages/e2e` Playwright.
  - Chart drawing: visualization regression tests.
  - Formula: its tier.
  - AI: integration tests or evals.
  - Migrations: a real database (CI applying them counts).
  - Focused error-conversion unit tests suffice when status and message propagation is unchanged.
  - A mock is a gap only if it hides specific changed behaviour or a contract the assertions miss; identify it.
    On risky paths this is Heads-up, elsewhere a Gap (`mocked`).
  - Mocking unchanged collaborators alone is no gap.
- **external contract:** request-only assertions don't cover a changed provider/model/warehouse contract: Heads-up on risky paths, Gap elsewhere; name the required real run/manual check.
  Unchanged-contract wrappers follow right kind.
  An entry-point regression checking request and returned result can cover a focused fix, subject to right kind.
- **variants:** cover every touched flag state, warehouse and feature combination, including flag removals and scope widening.
- **load and bad input:** changed provider/warehouse call frequency says how it was counted; new user config has an API test asserting bad input returns 4xx.
- **exercised:** check PR CI selects risky-path tests.
  Known exclusions, weekly suites or manual evals without reported runs produce `unverified` Gaps, with finding eligibility under shared States.
  A reported run supports its covered cases; no independent rerun alone creates no gap.
- **coverage kept:** no suite, warehouse or assertion dropped to silence a flake without its cause and a way back.
  Timeout mocks keep the test's claimed coverage.
- **hygiene:** no `.only`, `.skip`, `xit` or commented-out tests; no clock, timezone, randomness or order dependence.
  Bounded real timers are fine.
  Snapshots suit large stable output with intended diffs.
  Stray `.only`/`.skip` is Fix.

## Rows

- **Gap:** an uncovered serious worst case (main path or user-touching behaviour), a specific mock gap, or an unverified check under shared States.
  Use logical areas (“replay against real S3”), never test names.
  Don't repeat a gap already explained by a finding; it still affects the rating.
- **Verification:** reviewer testing beyond the PR's own: live run, browser check, query.
  Omit if none; never invent it.
- **How:** one or two words: gaps `mocked`, `none`, `unverified`; verification `live`, `browser`, `ran, pass`.

## Rating

Rate each changed flow's serious worst cases, then take the weakest.
Tests of another flow don't cover this one.

- **enough:** every serious case has a test/run, or none exist (docs, tests-only, cosmetic changes).
  Existing tests reaching a refactored path suffice.
  Non-serious Gaps don't lower it; `unverified` lowers it only if it is the main path's sole evidence.
  Unavailable run results alone don't lower it.
- **thin:** when missing doesn't apply: a mock hides a serious case, a serious case is uncovered beside a tested main path, or a non-cosmetic main path off risky paths lacks tests.
- **missing:** a risky main path has neither test nor run.
  Helper tests don't cover changed wiring.

## Coverage-drop Diff

Coverage loss for retained behaviour is minor; new coverage gets no row.
Removing obsolete assertions for an intended behaviour change isn't coverage loss.
Testing rows describe this change's gaps, so retain separate diffs for dropped suites,
warehouses, variants or assertions, including skipped/non-blocking coverage.
These are Testing records, not a lens; sort under the [canonical schema](formats/json.md).

Extends [Diff](lenses/README.md#base-diff):

```ts
type CoverageDiff = Diff & {
    kind: string;  // unit, mocked, integration, api-tests, Playwright, visualization, formula tier or eval
};
```

Use `lens: "Testing"`, `change: "deleted" | "modified"`, `impact: "minor"`.
Name the area reviewers know.
One diff per area: deleted for removed tests; modified for skipped, narrowed or non-blocking coverage.
Note how and any stated reason.

```json
{ "lens": "Testing", "change": "deleted", "impact": "minor", "name": "Trino query results", "kind": "api-tests", "note": "removed to silence a flake" }
```
