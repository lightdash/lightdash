# Timezones v2 — Design Principles

Distilled from the [research review](./timezone-review.md) and [Q&A](./timezone-questions.md). Each principle is one sentence + a status line.

**Legend.** ✅ already true · ⚠️ partial — gap noted · ❌ change needed.

Each gap has a short slug (`gap-...`) so user-facing documentation can cross-reference which experiences are affected by which unbuilt work. See `draft-user-documentation.md` for the inverse view.

**Change-type tags.** Each gap is tagged with what kind of change it is, which drives how to roll it out:

- **feature** — net-new capability customers can use. Not strictly needed, but improves the TZ experience. Customers opt in by using it; existing behavior unchanged.
- **bug** — current behavior is broken or contradicts user expectations. Fix corrects it.
- **breaking** — fix changes behavior customers experience without opting in. Charts, queries, or output may shift. **Not breaking if shipped behind an opt-in flag** — a `breaking` tag is a flag that we have to either gate it, migrate it, or eat the support cost.
- **refactor** — internal code change with no customer-visible behavior change.hhxisting feature (better UI, clearer doc, more useful indicator). Not a net-new capability.
- **decision** (❓) — behavior is internally inconsistent or undefined and needs a deliberate product call before any fix; the change type follows from the decision.

Tags combine (e.g., `bug + breaking` for a correctness fix that, shipped without opt-in, will shift customer-visible state).

---

## Architecture

1. **Two settings, two problems: a data TZ (what the column means) and a query TZ (what the user means).**
   ✅ `dataTimezone` on credentials + project/user/chart `queryTimezone`.

2. **Push timezone conversion to the warehouse; never post-process in client code.**
   ✅ `CONVERT_TIMEZONE` / `AT TIME ZONE` / `TIMESTAMP_TRUNC` in generated SQL.

3. **Pick one primary conversion mechanism per warehouse, not both.**
   ❌ `gap-dual-conversion` *[refactor]* — Deferred to v3 (GLITCH-460, backlog). We run column-wrap *and* session-`SET TIMEZONE` in parallel — pick column-wrap, demote session-TZ to a documented fallback for warehouse functions that need it.

4. **Resolve "now" server-side in the resolved TZ; never use warehouse** `CURRENT_TIMESTAMP` **for relative dates.**
   ⚠️ `gap-sql-runner-now` *[feature]* — Deferred to v3 (GLITCH-461, `${ldNow}`). True for Lightdash filters, false for user-written SQL Runner queries — fix via `gap-ld-query-tz-var` so user SQL can match.

---

## Resolution chain

5. **Precedence: chart pin → user profile → project → UTC.**
   ✅ Implemented in `resolveQueryTimezone.ts`.

6. **User-level TZ is an admin opt-in (org-wide feature flag).**
   ✅ `EnableTimezoneSupport` — the single timezone feature flag (the former
   `EnableUserTimezones` flag was merged into it).

7. **Disabling the user-TZ feature must actually disable it, not just hide the picker.**
   ✅ When `EnableTimezoneSupport` is off, the surrounding query pipeline (warehouse session setup, timezone-aware `DATE_TRUNC`, returning `displayTimezone`) is short-circuited, so the resolved zone is not applied to the query. The stored `users.timezone` is preserved (non-destructive) and re-applies when the flag is turned back on.

8. **Resolved TZ persists with the query record; downstream paths read it back, never re-resolve.**
   ✅ Stamped onto `metricQuery.timezone` in `executePreparedAsyncQuery`.

9. **Shared materializations use project TZ, not user TZ.**
   ✅ Documented and enforced.

---

## Shared content vs. interactive exploration

10. **Default for saved/shared charts: pin to the author's resolved TZ ("Each Tile" mode).**
    ✅ `gap-auto-pin-default` *[bug + breaking]* — Shipped (GLITCH-459, Phase 2). Saved charts default to the inherited project TZ rather than per-viewer recomputation; the author can opt into viewer-TZ explicitly.

11. **Per-content choice between "pinned" and "viewer TZ" must be surfaced in the save UX, not hidden in a dropdown.**
    ✅ `gap-pin-ux-toggle` *[qol]* — Shipped (GLITCH-456, Phase 2). Save UX is now a project/viewer mode toggle with an advanced override, not a bare TZ-string dropdown.

12. **A viewer looking at a chart in a different TZ from the author/pin should see a clear indicator.**
    ✅ `gap-cross-viewer-indicator` *[qol]* — Shipped (GLITCH-455, Phase 2). The chart-card badge now surfaces the resolved TZ, the cross-viewer divergence, and the override state; a matching tile affordance landed in GLITCH-495.

---

## Output types

13. **Truncated timestamps at day-or-coarser intervals should be** `DATE` **values in the warehouse output, not** `TIMESTAMP` **at midnight.**
    ✅ `gap-date-grain-output` *[bug + breaking]* — Shipped (GLITCH-452, Phase 2). Day-or-coarser truncs `CAST(... AS DATE)` at compile time so the warehouse type matches the dimension metadata; the downstream format-correction layer is retired. Per-adapter cast refactored into `dateTruncTimezoneConversions` (GLITCH-508); fallout closed across exports (GLITCH-503), Date Zoom (GLITCH-505, GLITCH-510), raw-SQL table calcs (GLITCH-506), MIN/MAX (GLITCH-499), the process-TZ raw-value edge (GLITCH-507), and the picker affordance (GLITCH-519).

14. **Sub-day intervals (hour, minute, second, ms) stay** `TIMESTAMP` **— they are real instants.**
    ✅ Naturally true; no change.

15. **DATE columns are wall-clock calendar values; never shift, never anchor.**
    ✅ DATE-base bypass throughout SELECT, WHERE, format, cell-click.

16. **Per-dimension** `convert_timezone: false` **opt-out for system/audit timestamps that should render raw.**
    ✅ Implemented; propagates to interval children.

17. **Filter literals match the column expression's shape** (UTC-offset timestamps on warehouses that accept them; bare timestamps on BigQuery/ClickHouse; bare dates for DATE-grain).
    ✅ Implemented.

18. **A single predicate decides "is this a calendar value?" — every bypass site reads the same answer.**
    ✅ `gap-calendar-predicate` *[refactor]* — Shipped (GLITCH-450, Phase 1). The duplicated logic is consolidated into one `isCalendarValueItem` predicate read by every bypass site. (Internal refactor; no customer surface.)

18a. **The dimension picker makes TZ-sensitivity visible — a user can tell at a glance whether a date/time dimension will move when the resolved TZ changes, and what zone it's anchored to.**
✅ `gap-tz-sensitivity-dim-affordance` *[qol]* — Shipped (GLITCH-458, Phase 2; day-or-coarser correction in GLITCH-519). The picker now distinguishes TZ-immune from TZ-sensitive dimensions with an icon + anchor-naming tooltip. The four cases it disambiguates:

```plaintext
| Source | Moves with chart TZ? | Anchor |
|---|---|---|
| `DATE` base column | No | N/A (wall-clock calendar value) |
| `TIMESTAMP` with `convert_timezone: false` | No | N/A (rendered raw) |
| `TIMESTAMP` with `wall_clock_timezone: X` | Yes | Column-declared zone X |
| Plain `TIMESTAMP` | Yes | Project `dataTimezone` |

Minimum affordance: a distinguishing icon for TZ-immune vs TZ-sensitive dimensions, plus a tooltip that names the anchor for TZ-sensitive ones (e.g. "Timestamp — stored in America/Los_Angeles, bucketed in {resolved TZ}"). Complement to principles 15 and 16: those invariants are correct but currently invisible. Related to [[gap-wall-clock-tz-col]] — without that feature, only three of the four rows can exist; with it, the affordance has to handle all four.
```

---

## Edge cases

19. **DST transitions render correctly in every layer, including any wall-clock shift.**
    ✅ `gap-echarts-dst` *[bug]* — Shipped (GLITCH-449/502/509, Phase 2). Server SQL was already correct; the ECharts shift now applies to all shiftable grains via the companion column, so sub-day and DAY+ both render on the project wall-clock timeline with native adaptive ticks. The earlier sub-day raw-instant carve-out (GLITCH-449/502) is retired now that merge bucketing (GLITCH-509) removed the DST collision that motivated it.
    ✅ `gap-dst-fold-bucketing` *[decision → bug]* — Resolved (GLITCH-504 decision + GLITCH-509 fix, Phase 2). The deliberate call is **merge**: a DST fall-back collapses the two wall-clock-identical 1 AM hours into one `count=2` bucket on **every** warehouse, matching Lightdash's wall-clock contract. BigQuery/ClickHouse previously split (instant-domain trunc → two `01:00` rows); they now merge like the naive-domain adapters. IANA tz handling is preserved. See [`timezone-questions.md`](./timezone-questions.md) → "DST fall-back".

20. **Half-hour and 45-min timezones work end-to-end (India, Nepal, Eucla).**
    ✅ `gap-fractional-offset-tz` — Not a bug: the bare literal on BigQuery/ClickHouse is already a UTC instant (`formatTimestampAsUTCNoOffset`), so the offset is baked in, not dropped, and fractional boundaries are correct. Picker zones added + BigQuery/Postgres api-test coverage (GLITCH-453).

21. **NULL timestamps are excluded from relative filters by standard SQL semantics.**
    ✅ Implicit; no change.

22. **Sub-day grouping with sub-day filters produces shape-identical charts across whole-hour viewer TZs (labels shift, buckets don't).**
    ✅ Structural property; document it.

---

## Power users / extensibility

23. **Expose the resolved TZ as a template variable in user SQL (**`${ldQueryTimezone}` **or similar).**
    ❌ `gap-ld-query-tz-var` *[feature]* — Deferred to v3 (GLITCH-462). Missing — lets user SQL match the resolved TZ.

24. **Per-column wall-clock TZ annotation lets a modeler declare "this column is in PT, not UTC."**
    ❌ `gap-wall-clock-tz-col` *[feature]* — Deferred to v3 (GLITCH-463). Missing — today `dataTimezone` is warehouse-wide. Add `meta.dimension.wall_clock_timezone` or equivalent.

25. **Validate** `dataTimezone` **interactively — show a preview of the resolved time during connection setup.**
    ✅ `gap-datatz-preview` *[qol]* — Shipped (GLITCH-454, Phase 1). Connection setup shows an interactive preview (warehouse value → Lightdash interpretation → project-TZ render) so misconfiguration is caught before it produces silent wrong numbers.

26. **Snowflake** `TIMESTAMP_NTZ` **/** `LTZ` **/** `TZ` **are normalized to a single canonical form at compile time, with a per-warehouse opt-out for non-UTC NTZ.**
    ⚠️ `gap-snowflake-ntz-percolumn` *[feature]* — Per-column opt-out deferred to v3 (GLITCH-464). Implemented via `convertTimezone()` + `disableTimestampConversion`, but the opt-out is warehouse-wide; per-column would be cleaner (see `gap-wall-clock-tz-col`).

---

## Scheduling & delivery

27. **The schedule's cron TZ is separate from the query's TZ; they don't interact.**
    ✅ Structurally separate.

28. **Scheduled-report queries resolve TZ via the schedule owner's profile; embed queries fall through to project unless a `?timezone=` URL param sets a per-session override.**
    ⚠️ Implemented (embed `?timezone=` session override per GLITCH-488, shipped); `gap-schedule-doc` *[qol]* — deferred to v3 (GLITCH-465); scheduled-delivery TZ interaction not yet documented for customers (drafted in `draft-user-documentation.md` → "Scheduled deliveries").

---

## Observability & docs

29. **The resolved TZ is visible to the viewer on every chart.**
    ✅ Resolved-TZ badge on the chart card.

30. **SQL Runner shows the same TZ-conversion expressions the rest of the system uses.**
    ✅ Compiled SQL is always visible; ⚠️ `gap-sql-runner-resolved-label` *[qol]* — deferred to v3 (GLITCH-466); the resolved TZ value should be labeled next to it.
    ❌ `gap-sql-runner-raw-display` *[bug]* — separately, the output *values* are serialized as UTC ISO `Z` regardless of type: TZ-aware values collapse to the UTC instant (offset dropped) and naive values get a false `Z`, so a user's in-SQL conversion is hidden or mislabeled. (GLITCH-489, v3)

31. **A customer-facing doc explains the model — pinned vs viewer-TZ trade-off, DATE vs TIMESTAMP semantics,** `dataTimezone` **vs** `queryTimezone`**.**
    ⚠️ `gap-customer-tz-doc` *[qol]* — Phase 3, pending publish (GLITCH-457, Todo). Draft complete at `draft-user-documentation.md`; publishes at the default-flip. Today only engineer-facing `timezone-handling.md` exists publicly.

---

## Out of scope (call out, don't fix here)

- **Fiscal calendars / custom granularities** (4-4-5 retail, fiscal quarter) — adjacent to TZ, not a TZ concern. Track separately.
- **A separate "viewer TZ" mode** distinct from chart-pin and project-fallback — defer until customer feedback justifies the third axis.
- **Pre-aggregate TZ matching** (materializing per-TZ refreshes) — revisit if pre-agg adoption grows enough to make the materialization-forces-project-TZ behavior surprising.

---

## Rollout playbook

The goal of v2 is **alignment**: every timezone interaction in Lightdash should be explicit, predictable, and match the customer documentation. The customer doc is the contract; v2 closes the gaps between what Lightdash does today and what that contract describes. Anything that doesn't move us toward that alignment is deferred.

### In scope (11 gaps)

- *Refactor (enabling).* `gap-calendar-predicate`
- *QoL required for the contract to be explicit and explainable.* `gap-datatz-preview`, `gap-pin-ux-toggle`, `gap-cross-viewer-indicator`, `gap-tz-sensitivity-dim-affordance`, `gap-customer-tz-doc`
- *Bugs.* `gap-echarts-dst`, `gap-flag-off-leak`, `gap-fractional-offset-tz`, `gap-date-grain-output`, `gap-auto-pin-default`

### Out of scope for v2

All `feature` items, `gap-dual-conversion` (refactor), and the two narrow QoL items (`gap-schedule-doc`, `gap-sql-runner-resolved-label`). They are good ideas; they are not required to close the alignment gap. Trim references to deferred items from `draft-user-documentation.md` before publishing.

### Phases

1. ✅ **Backstage — complete.** `gap-calendar-predicate`, `gap-datatz-preview`. No customer-visible behavior change.
2. ✅ **Correctness behind a flag — complete.** The five bugs gated by a per-project `TimezoneV2` flag, default OFF, paired with `gap-pin-ux-toggle`, `gap-cross-viewer-indicator`, and `gap-tz-sensitivity-dim-affordance` so the UI describes either mode honestly. The phase also closed the GLITCH-452 fallout cluster (exports, Date Zoom, raw-SQL table calcs, MIN/MAX rendering, picker affordance) and the DST fall-back bucketing decision (`gap-dst-fold-bucketing` → merge, GLITCH-509). Customer doc reviewed but unpublished — it describes the flag-ON world.
3. ⏳ **Flip the default — in progress.** After 60 days of opt-in adoption, flip `TimezoneV2` default to ON. Publish the customer doc (`gap-customer-tz-doc`, GLITCH-457). Old behavior survives 90 days as a project-level override, then is removed.

After Phase 3, the design doc and the customer doc describe the same Lightdash.

> **Status (Phases 1 & 2 shipped).** All in-scope correctness and QoL gaps are closed; the only remaining v2 work is the Phase 3 rollout (publish the customer doc, flip the default, retire the old path). Every other open gap in this doc is explicitly deferred to v3. Two follow-ups surfaced in the docs are not yet ticketed: a regression test for pre-aggregate buckets frozen after a project-TZ change, and a `moment-timezone` version-pinning policy.