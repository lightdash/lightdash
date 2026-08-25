# Lightdash verification map

This directory is the maintained source for verifying user-facing Lightdash web behavior. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch or attach with `.cursor/skills/verify-lightdash/scripts/launch.sh`.
- `eval "$(.cursor/skills/verify-lightdash/scripts/resolve-env.sh)"`.
- `.cursor/skills/verify-lightdash/scripts/doctor.sh` prints `READY:`.
- Seeded org **Jaffle Shop**, project **Jaffle shop**, user **David Attenborough** (`demo@lightdash.com` / `demo_password!`).
- `export AGENT_BROWSER_SESSION="ld-verify-${VERIFY_RUN_ID}"`.
- Drive the Vite UI at `$FRONTEND_URL` with `.cursor/skills/verify-lightdash/scripts/ab.sh` (agent-browser). Do not use Playwright MCP, Cypress, or curl as the user path.
- Do not start a second stack on the same `LD_INSTANCE_ID`.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer `ab.sh snapshot -i` plus `@eN` refs, then `find role|text|label|testid`. Treat quoted names as literal.
- Re-snapshot after every navigation or submit. Refs go stale immediately.
- After mutations, restore seeded data if you created extra charts/dashboards. Keep proof artifacts.
- Record the feature ID and entry point with every artifact under `.cursor/skills/verify-lightdash/evidence/<VERIFY_RUN_ID>/`.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an `ab.sh snapshot -i` dump and an `ab.sh screenshot` with the Lightdash navbar or login card visible.
- Mutation proof includes a second user-facing view of the stored value.
- Report an unreachable path with the attempted URL and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features`
2. `How to get to it (user POV)`
3. `Driving it with agent-browser`
4. `Gotchas`

`AB` means `.cursor/skills/verify-lightdash/scripts/ab.sh` with `AGENT_BROWSER_SESSION` set.

## Features

- [Log in](./login.md) covers email precheck, password sign-in, already-authenticated redirect, and logout.
- [Home](./home.md) covers the project home welcome and jumping into tables.
- [Explore a table](./explore.md) covers the tables list, opening Orders, selecting fields, and running a query.
- [Saved charts](./saved-charts.md) covers Browse → All saved charts and opening a seeded chart.
- [Dashboards](./dashboards.md) covers Browse → All dashboards and opening Jaffle dashboard.
