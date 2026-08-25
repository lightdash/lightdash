# Explore a table

Explore lets a user pick a dbt-modeled table, add dimensions and metrics, run a warehouse query, and see results in the explorer.

## Sub-features

- `explore-list` shows seeded explores on `/tables`.
- `explore-open-orders` opens the Orders explore with a field tree (`Dimensions`).
- `explore-run` runs a query after selecting at least one field and shows result rows.

## How to get to it (user POV)

- Navbar `New` (`data-testid="ExploreMenu/NewButton"`) → menu item titled `Chart`.
- Home `Run a query`.
- Direct URL `${FRONTEND_URL}/projects/${SEED_PROJECT_UUID}/tables`.
- From `/tables`, click explore name `Orders` (also `/tables/orders`).

## Driving it with agent-browser

Preconditions:

- Authenticated as the seed admin.
- Jaffle shop project is compiled (tables list is not empty).

- **Open tables.** `$AB open "${FRONTEND_URL}/projects/${SEED_PROJECT_UUID}/tables"`. `$AB wait --text "Orders"`. `$AB snapshot -i`.
- **Open Orders.** `$AB find text "Orders" click`. `$AB wait --url "**/tables/orders"`. `$AB wait --text "Dimensions"`. `$AB snapshot -i`.
- **Select fields.** `$AB find text "Order id" click` (or another Orders dimension). If the tree is virtualized, `$AB scrollintoview` after `$AB snapshot -i` finds the row.
- **Run.** `$AB find text "Run query" click` (name may include a limit, e.g. `Run query (500)`). `$AB wait --load networkidle`. Confirm `$AB snapshot` no longer shows `Loading results` and a results table has cells.
- **Proof.** `$AB snapshot -i > "${EVIDENCE_DIR}/explore-orders.aria.md"` and `$AB screenshot "${EVIDENCE_DIR}/explore-orders.png"`. `proof.md` lists the field names clicked.

## Gotchas

- Auto-fetch may run a query as soon as a field is selected. Still click `Run query` when asserting `explore-run`, or note auto-fetch in `proof.md` if the button stayed disabled.
- Virtualized explore list: `Orders` may be off-screen. Snapshot, scroll, snapshot again.
- Stay on Orders. Mixing fields from another explore is invalid.
- Empty results after run is a failure for this seed.
- Do not save a chart in this feature. Leftover `My chart` pollutes Browse.
