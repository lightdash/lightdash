# Experimental E2E Tests

This folder contains experimental E2E tests that are **excluded from CI** by default.

These tests are for features that are still in development (PoC stage) and are expected to have failures until the feature is stabilized.

## Running Experimental Tests

### Open Cypress UI (interactive mode)

```bash
# From repo root
pnpm -F e2e cypress:open:experimental

# Or from packages/e2e
pnpm cypress:open:experimental
```

### Run in headless mode

```bash
# From repo root
pnpm -F e2e cypress:run:experimental

# Or from packages/e2e
pnpm cypress:run:experimental
```

### Run a specific experimental test file

```bash
pnpm -F e2e cypress run --spec 'cypress/e2e/experimental/nestedSpacePermissions.api.cy.ts'
```

## Current Experimental Tests

### Nested Space Permissions (`nestedSpacePermissions.*.cy.ts`)

Tests for the nested space permissions feature where:

- Nested spaces can inherit permissions from parent (default)
- Nested spaces can break inheritance and define explicit permissions
- Permissions are additive through the ancestry chain

**Prerequisites:**

- Feature flag `nested-spaces-permissions` must be enabled
- Dev server running with seed data

**Files:**

- `nestedSpacePermissions.api.cy.ts` - API-level tests (15/16 passing)
- `nestedSpacePermissions.ui.cy.ts` - UI interaction tests
- `NESTED_SPACE_PERMISSIONS_E2E_STRATEGY.md` - Full test strategy document

**Known Failing Tests:**

- `should copy permissions when setting inheritParentPermissions=false` - The permission copy logic when breaking inheritance may not be fully implemented yet. Check `SpaceService.updateSpace()` for the implementation.

## Moving Tests to CI

Once a feature is stable and tests are passing consistently:

1. Move the test files from `experimental/` to the appropriate folder (`api/` or `app/`)
2. The tests will automatically be included in CI runs
3. Update the strategy document or remove it if no longer needed
