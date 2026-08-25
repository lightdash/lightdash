# Dashboards

Dashboards is the project list of dashboards and the view of a seeded dashboard with its tiles.

## Sub-features

- `dash-list` shows `Jaffle dashboard` on `/dashboards`.
- `dash-open` opens that dashboard and shows tiles (including the revenue chart) after load.

## How to get to it (user POV)

- Navbar `Browse` → `All dashboards`.
- Direct URL `${FRONTEND_URL}/projects/${SEED_PROJECT_UUID}/dashboards`.
- Click the `Jaffle dashboard` link in that list (view URL under `/dashboards/:uuidOrSlug`).

## Driving it with agent-browser

Preconditions:

- Authenticated as the seed admin.
- Seed includes `Jaffle dashboard`.

- **Open list.** `$AB find role button click --name "Browse"`. `$AB snapshot -i`. `$AB find text "All dashboards" click`. `$AB wait --url "**/dashboards"`. `$AB wait --text "Jaffle dashboard"`.
- **Open dashboard.** `$AB find text "Jaffle dashboard" click`. `$AB wait --load networkidle`. `$AB snapshot -i` includes `How much revenue` or other seeded tile titles and navbar `Browse`.
- **Proof.** List artifacts (`dash-list.aria.md`, `dash-list.png`) and opened dashboard (`dash-open.aria.md`, `dash-open.png`) with at least one tile readable.

## Gotchas

- Minimal/embed routes (`/minimal/projects/.../dashboards/...`) are not this feature.
- Do not apply dashboard filters unless asserting filter behavior in a later map file.
- Do not create a dashboard from `New` during a read-only verify.
