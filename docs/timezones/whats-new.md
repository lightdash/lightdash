# Timezones v2 — What's New

Short summary of how v2 changes user-facing behavior vs. today's published docs and shipped implementation. See [`timezones-v2-design.md`](./timezones-v2-design.md) for the full principle list and [`timezone-handling.md`](./timezone-handling.md) for current implementation detail.

## Behavior changes users will notice

- **Saved charts pin to the author's TZ by default.** Today viewers in different TZs silently see different numbers; v2 makes pin-at-save the default, with an explicit viewer-TZ opt-in. (GLITCH-459)
- **Pin vs viewer-TZ becomes a save-time mode toggle**, not a buried TZ-string dropdown. (GLITCH-456)
- **Cross-viewer divergence indicator** when your TZ differs from the chart's pin. (GLITCH-455)
- **Day-grain dimensions return real `DATE`** in warehouse output, not `TIMESTAMP` at project-TZ midnight. Cleaner exports, downstream tools see the right type. (GLITCH-452)
- **Dimension picker shows TZ-sensitivity** — an icon + tooltip naming the anchor zone, so users can tell which dimensions move when the chart TZ changes. (GLITCH-458)
- **`dataTimezone` gets a connection-setup preview** so misconfiguration is caught before it produces silent wrong numbers. (GLITCH-454)
- **Embedded sessions can set their own timezone** via a `?timezone=<IANA>` URL param, so multi-tenant embeds render each tenant in its own zone without separate per-zone charts. (GLITCH-488)

## Bug fixes that may shift numbers

- Disabling the user-TZ feature flag actually stops honoring stored `users.timezone`. (GLITCH-451)
- DST boundaries render correctly in ECharts. (GLITCH-449)
- Sub-day time-axis ticks are adaptive again — density responds to the data span and to zoom instead of one tick per bar — while keeping the DST-correct positioning. (GLITCH-502) *(Superseded by GLITCH-509: sub-day axes now shift to project wall-clock like DAY+, so ticks land on real day boundaries; the raw-UTC carve-out is gone.)*
- **DST fall-back buckets identically on every warehouse.** A fall-back hour now collapses into one `count = 2` bucket everywhere (BigQuery and ClickHouse previously split it into two `count = 1` bars). Hour-grain charts plot on the project wall-clock timeline: the axis shows dates on real day boundaries, the fall-back reads as one doubled bar, and spring-forward leaves the skipped hour empty. (GLITCH-509)
- Half- and 45-minute offset zones (India, Nepal, Eucla) work on BigQuery + ClickHouse. (GLITCH-453)
- Timestamp metrics (a MIN or MAX over a timestamp column) render in the project timezone instead of raw UTC, matching the same column shown as a dimension — across the explore table, Big Number tiles, and cartesian tooltips. (GLITCH-498)

## Internal-only

- One shared "is this a calendar value?" predicate replaces the 5 duplicated call sites. (GLITCH-450)

## Docs

- A real customer-facing TZ doc covering pinned-vs-viewer trade-off, DATE vs TIMESTAMP semantics, and `dataTimezone` vs `queryTimezone`. (GLITCH-457)

## Deferred (called out, not shipping in v2)

GLITCH-462 (template var for SQL Runner), GLITCH-463 (per-column TZ annotation), GLITCH-460 (pick one conversion mechanism), GLITCH-465, GLITCH-466, GLITCH-489 (faithful raw timestamp display in SQL Runner — no UTC collapse / false `Z`).

## Rollout

All five behavior-changing bugs ship behind a per-project `TimezoneV2` flag (default OFF), paired with the UI work so either mode is honestly describable. Flag flips to ON after 60 days of opt-in; old behavior survives 90 more days as a project-level override, then is removed.
