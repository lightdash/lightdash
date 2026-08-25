# Saved charts

Saved charts is the project list of charts the user can open from Browse without building a query from scratch.

## Sub-features

- `charts-list` shows seeded charts on `/saved`.
- `charts-open` opens `How much revenue do we have per payment method?` and renders a chart or results, not an error empty state.

## How to get to it (user POV)

- Navbar `Browse` → `All saved charts`.
- Direct URL `${FRONTEND_URL}/projects/${SEED_PROJECT_UUID}/saved`.
- Home or space lists that link the same chart name.

## Driving it with agent-browser

Preconditions:

- Authenticated as the seed admin.
- Seed data includes the revenue chart (standard Jaffle seed).

- **Open list.** `$AB find role button click --name "Browse"`. `$AB snapshot -i`. `$AB find text "All saved charts" click`. `$AB wait --url "**/saved"`. `$AB wait --text "How much revenue do we have per payment method?"`.
- **Open chart.** `$AB find text "How much revenue do we have per payment method?" click`. `$AB wait --load networkidle`. `$AB snapshot -i` shows that title and no blocking error dialog. `Loading chart` is gone.
- **Proof.** `$AB snapshot -i > "${EVIDENCE_DIR}/saved-list.aria.md"` on the list, `$AB screenshot "${EVIDENCE_DIR}/saved-open.png"` on the opened chart.

## Gotchas

- Opening from a space UUID is a different entry point; if you only used `/saved`, do not claim space browser coverage.
- Chart slugs in the URL are not the display name. Assert the visible title.
- Do not click `Edit chart` unless the task is editing.
