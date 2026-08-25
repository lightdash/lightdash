# Home

Home is the project landing after login. It greets the signed-in user and is the hub for Browse, New, and recent content.

## Sub-features

- `home-welcome` shows a David greeting on `/projects/:projectUuid/home` (classic `Welcome, David!` or custom `Good morning, David.` / time-of-day equivalent).
- `home-tables` opens the tables list. Classic homepage uses `Run a query`. Custom homepage uses navbar `New` → `Chart` (do not flip the homepage mode).
- `home-logo` returns to home from the navbar control named `Home`.

## How to get to it (user POV)

- Finish log in (see [login](./login.md)); the app routes to project home.
- Click the Lightdash logo in the top-left navbar (`Home`).
- Open `${FRONTEND_URL}/projects/3675b69e-8324-4110-bdca-059031aa8da3/home`.

## Driving it with agent-browser

Preconditions:

- Authenticated as `demo@lightdash.com` in this `AGENT_BROWSER_SESSION`.
- Doctor is `READY:`.

- **Open home.** `$AB open "${FRONTEND_URL}/projects/${SEED_PROJECT_UUID}/home"`. `$AB wait --text "David"`. `$AB snapshot -i`. Navbar includes `Browse` and `New`. Project switcher includes `Jaffle shop`.
- **Jump to tables.** If `$AB snapshot -i` shows `Run a query`, `$AB find role button click --name "Run a query"`. Otherwise `$AB find testid "ExploreMenu/NewButton" click`, `$AB snapshot -i`, `$AB find text "Chart" click`. `$AB wait --url "**/tables"`. `$AB wait --text "Orders"`.
- **Return via logo.** `$AB find role link click --name "Home"` (or button named `Home`). `$AB wait --url "**/home"`. `$AB wait --text "David"`.
- **Proof.** `$AB snapshot -i > "${EVIDENCE_DIR}/home.aria.md"` and `$AB screenshot "${EVIDENCE_DIR}/home.png"`. After tables, `home-tables.aria.md` / `home-tables.png`.

## Gotchas

- Custom homepage builder is on for many local seeds. `Switch back to classic homepage` / `Customize homepage` mutate user preference — skip them on a read-only verify.
- `Welcome to Lightdash` (no first name) is not seed-user proof.
- If you see org setup instead of Jaffle, the DB is not the seeded demo — stop and doctor.
- Time-of-day greetings (`Good morning` / `Good afternoon` / `Good evening`) all count for `home-welcome` when they include `David`.
- On `/tables`, `Orders` is often below the fold in a virtualized list. `$AB wait --text "Orders"` can time out while the page is healthy. Treat `Select a table` plus `Search tables` as `home-tables` proof; scroll or search for `Orders` only when driving [explore](./explore.md).
