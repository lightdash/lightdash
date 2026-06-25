# GLITCH-265 — Project-default time intervals

**Ticket:** [GLITCH-265](https://linear.app/lightdash/issue/GLITCH-265) — "I want to set a default set of time intervals for my Lightdash project."
**Milestone:** Control the zoom (project: Make date zoom configurable)
**Status:** Design approved 2026-06-25

## Problem

Lightdash hard-codes which time-interval sub-dimensions (granularities) a date/timestamp
dimension gets by default:

- **TIMESTAMP** → `RAW, DAY, WEEK, MONTH, QUARTER, YEAR`
- **DATE** → `DAY, WEEK, MONTH, QUARTER, YEAR`

To get anything else (e.g. `HOUR`, or a project's custom granularity) on a column, an author
must add `time_intervals: [...]` to that column's dbt meta — and repeat it on every date column.

### Customer evidence

- **44pixels** (#14766): wants `HOUR` on *all* timestamps without per-column edits — *"is there a
  way to override the default settings for timestamps? Or do I have to override it everywhere I
  want hour?"* / *"set the default somewhere that then applies to all timestamps."*
- **Octopus Energy** (Jacob Varley): wants a `custom_granularities` entry ("Week starting Friday")
  applied to every date dimension — *"is it possible to configure the default `time_intervals` for
  our dimensions to include it **in addition to the usual defaults** for dates/timestamps … and
  also ensure any new dimensions include it by default."*

Both frame the ask as **additive** ("in addition to the usual defaults"). Neither asked to remove a
standard grain. Relabelling `Week` → `Week starting Monday` is a separate concern (GLITCH-264).

## Goal

Let a project set, in `lightdash.config.yml`, extra time intervals that are appended to the built-in
defaults for date and/or timestamp dimensions — including custom-granularity names — so they apply
to every date/timestamp dimension that doesn't already declare its own `time_intervals`.

Non-goals:
- Removing/replacing built-in default grains (additive only).
- Configurable labels for standard granularities (GLITCH-264).
- Per-dashboard / per-space scoping (handled elsewhere in the project).

## Design

### 1. Config shape

New optional field under the existing `defaults` block of `lightdash.config.yml`:

```yaml
defaults:
  additional_time_intervals:
    date: [week_starting_friday]   # appended to built-in DAY/WEEK/MONTH/QUARTER/YEAR
    timestamp: [HOUR]              # appended to built-in RAW/DAY/WEEK/MONTH/QUARTER/YEAR
```

- **Named `additional_time_intervals` (not `time_intervals`) on purpose.** Per-column
  `time_intervals` (dbt meta) *replaces* the set; this project-level field *adds* to it. Reusing the
  same word for opposite semantics one level apart is a footgun, so the name carries the meaning —
  "added on top." It also fits existing Lightdash vocabulary ("additional dimensions").
- Separate `date` / `timestamp` keys serve both customer asks directly and structurally keep sub-day
  grains away from DATE columns.
- Entries may be **standard `TimeFrames` or custom-granularity names** (keys of `custom_granularities`).

Type change in `packages/common/src/types/lightdashProjectConfig.ts`:

```typescript
export type ProjectDefaults = {
    case_sensitive?: boolean;
    column_totals?: boolean;
    additional_time_intervals?: {
        date?: (TimeFrames | string)[];
        timestamp?: (TimeFrames | string)[];
    };
};
```

**Future iteration path:** if removal/replace is ever requested, add a sibling `defaults.time_intervals`
(replace semantics, matching per-column) — two distinct keys, no overloaded word, no migration of
the meaning of an existing field.

### 2. Merge semantics — additive (decided)

`getDefaultTimeFrames(type)` in `packages/common/src/utils/timeFrames.ts` gains an optional second
argument carrying the project additions and returns the built-in list with the additions appended,
de-duplicated, order preserved (built-ins first):

```
getDefaultTimeFrames(type, projectDefaults?) =>
    dedupe([ ...builtIn(type), ...(additionsFor(type, projectDefaults)) ])
```

When no config is present the output is byte-for-byte the current behavior.

### 3. Precedence — fallback only (Decision A, approved)

The project default replaces only the *fallback* used when a column has no explicit
`time_intervals`. It changes the `else` branch in both call sites; it does not touch columns that
declare their own list.

| Column state | Resulting intervals |
|---|---|
| Explicit per-column `time_intervals: [...]` | unchanged (author owns it) |
| No explicit list | built-in **+ project additions** |

This delivers "every new/uncurated date dimension inherits the extra grain" while leaving
explicitly-curated columns unsurprised.

### 4. Call sites

Both currently call `getDefaultTimeFrames(type)` in their no-explicit-list branch:

1. `processIntervalDimension` — `translator.ts:693` (main column path). Already produces a mixed
   `(TimeFrames | string)[]` array and splits standard vs custom via `validateTimeFrames` +
   `customIntervalNames`, so project-default custom granularities flow through here for free.
2. Synthetic / additional-dimension path — `translator.ts:309`. Standard `TimeFrames` only.

`convertExplores` already threads `lightdashProjectConfig.defaults` (line 1361) and
`custom_granularities` (line 1148) into the compile path, so the new field rides existing plumbing;
`convertTable` gains a `timeIntervalDefaults` parameter alongside the `customGranularities` one.

### 5. Validation — centralized, once at resolution (Decision B, approved)

Validate `defaults.additional_time_intervals` a single time when the project config is resolved (not
per column — that would emit one warning per date dimension):

- Each entry must be a known standard `TimeFrame` **or** a defined `custom_granularities` key;
  otherwise drop it and emit one warning.
- Drop sub-day grains (`HOUR/MINUTE/SECOND/MILLISECOND/RAW`) listed under `date` (meaningless on a
  DATE column) and warn.
- `lightdash-project-config-1.0.json` gains the standard-`TimeFrames` enum under
  `defaults.additional_time_intervals.{date,timestamp}` for editor autocomplete; custom-granularity
  names remain open strings (the schema cannot know project-specific names).

### 6. Scope / blast radius

- **Backend / `common` only.** The new sub-dimensions land in the compiled explore; the date-zoom
  dropdown, explorer sidebar, and queries consume them automatically. **No frontend changes.**
- Changing the config triggers explore recompilation (existing behavior) — no new cache mechanism.

### Known limitation (out of scope)

The synthetic-dimension path (`translator.ts:309`) does not support custom granularities today, so a
project-default *custom* granularity applies via the main column path (real model date columns) but
not to synthetic/additional dimensions. This is a pre-existing gap; not fixed here.

## Testing

Unit (`packages/common`):
- `getDefaultTimeFrames(type, defaults)`: additive merge; de-dup when an addition equals a built-in;
  absent/empty config returns the built-in list unchanged; date vs timestamp keyed correctly.
- Validation helper: unknown name dropped + warned; custom-granularity key accepted; sub-day grain
  under `date` dropped + warned.

Compiler (`translator` tests):
- DATE column with no explicit list → built-in + the configured `date` additions.
- TIMESTAMP column with no explicit list → built-in + `HOUR`.
- Column with explicit `time_intervals` → untouched by the project default.
- Project-default custom-granularity name expands to a sub-dimension on the main column path.
- Invalid project-default entry is dropped and surfaced as a warning.

## Files touched (anticipated)

- `packages/common/src/types/lightdashProjectConfig.ts` — `ProjectDefaults.time_intervals`.
- `packages/common/src/utils/timeFrames.ts` — `getDefaultTimeFrames` gains optional defaults arg;
  validation helper for project additions.
- `packages/common/src/compiler/translator.ts` — thread defaults through `convertTable`; use the new
  fallback at both call sites.
- `packages/common/src/schemas/json/lightdash-project-config-1.0.json` — schema for the new field.
- Tests alongside the above.
