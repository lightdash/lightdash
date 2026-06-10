# Working with Timezones in Lightdash

Lightdash handles timezones for you, but it can only do that well if you tell it two things: what your raw data means, and what timezone you want your reports in. Get those right and the rest is automatic.

This guide is in two parts:

1. **Setup** — how to model your warehouse data and configure your project so timezones behave predictably.
2. **Daily use** — how filters, charts, sharing, and scheduling work once you're set up.

If you only read one thing: **set your project timezone to the zone you actually report in, store timestamps as timezone-aware types in your warehouse, and use** `DATE` **for calendar values.** The rest is detail.

> **Editor's note for reviewers.** Inline tags like *— [GLITCH-NNN](https://linear.app/lightdash/issue/GLITCH-NNN)* link this draft to unbuilt design work tracked in the [Timezone Handling Linear project](https://linear.app/lightdash/project/timezone-handling-4659dc553e25). They mark sentences whose accuracy depends on changes that haven't shipped yet. Strip them before publishing to the public docs site. The whole document corresponds to [GLITCH-457](https://linear.app/lightdash/issue/GLITCH-457).

---

# Part 1 — Setup

## Two timezones, one mental model

| Setting | Answers | Where you set it |
| --- | --- | --- |
| **Data timezone** | "What zone is the raw data in?" | Warehouse connection settings |
| **Project timezone** | "What zone do my reports use?" | Project settings |

You set each one once. From then on, every chart, filter, and export converts between the two automatically.

If all your raw data is UTC (recommended) and you report in your local zone, you only need to set the project timezone. The data timezone defaults to UTC.

## Pick the right column types in your warehouse

The single highest-leverage thing you can do for clean timezone behavior is store your timestamps as **timezone-aware types**. They unambiguously identify a moment in time and require no extra configuration.

### Recommended by warehouse

| Warehouse | Use this | Avoid this |
| --- | --- | --- |
| Snowflake | `TIMESTAMP_LTZ` or `TIMESTAMP_TZ` | `TIMESTAMP_NTZ` for event data |
| BigQuery | `TIMESTAMP` | `DATETIME` for event data |
| Postgres / Redshift | `TIMESTAMP WITH TIME ZONE` (a.k.a. `timestamptz`) | `TIMESTAMP WITHOUT TIME ZONE` for event data |
| Databricks | `TIMESTAMP` | naive timestamps |
| DuckDB | `TIMESTAMPTZ` | naive `TIMESTAMP` for event data |

The "avoid" types aren't broken — they're just naive. They don't carry timezone information, so Lightdash has to assume something about them (the data timezone you set on the connection). One global assumption rarely fits every column on a large warehouse — for mixed-zone cases, see `wall_clock_timezone:` below. *— [GLITCH-464](https://linear.app/lightdash/issue/GLITCH-464), [GLITCH-463](https://linear.app/lightdash/issue/GLITCH-463)*

### Use `DATE` for calendar values

If a column represents a calendar date — a birthday, a fiscal period start, an `effective_date` on a contract — store it as `DATE`. Lightdash treats `DATE` columns as wall-clock values and never shifts them. No matter the project timezone, `2024-03-15` stays `2024-03-15`.

This is what you want for things like:

- A user's date of birth
- A subscription start date
- An anniversary
- A fiscal-period boundary

This is **not** what you want for event timestamps. If you store "the moment an order was placed" as a `DATE`, you lose the time-of-day and can't compute things like "orders per hour" later.

### Don't use strings for dates

`'2024-03-15'` as a `VARCHAR` is opaque to the warehouse and to Lightdash. Sorting breaks, ranges break, every operation needs a cast. If you have string dates, convert them to proper `DATE` or `TIMESTAMP` types in your dbt model.

## Configure your connection

When you create or edit a warehouse connection in Lightdash, you'll find a **Data timezone** field in Advanced settings.

- **If all your naive timestamps are in UTC** (very common — most ELT pipelines normalize to UTC): leave it as UTC.
- **If your naive timestamps are in a single non-UTC zone** (e.g. an on-prem system that logs in local time): set the data timezone to that zone. Lightdash will interpret naive values as being in that zone.
- **If you have a mix of zones across columns**: leave the connection default and use per-column annotations (below).

After saving, click **Preview** to see how Lightdash interprets a sample timestamp. The preview shows the current moment in three forms: as your warehouse returns it, as Lightdash interprets it, and as it would render in your project timezone. If those three values agree with what you expect, you're set. *— [GLITCH-454](https://linear.app/lightdash/issue/GLITCH-454)*

## Configure your project timezone

In Project settings → **Timezone**, pick the zone you want reports to use. This is the zone in which:

- "Today" and "yesterday" are computed.
- Bars on a daily chart are bucketed.
- Scheduled deliveries are aligned (e.g., "send at 9am").

Common picks:

- The headquarters timezone for an internal-only org.
- The primary customer timezone for a regional business.
- **UTC** if you have a globally distributed team and want everyone to see the same numbers.

The project timezone is the default for every chart. Authors and viewers can override it (see Part 2), but a sensible project default removes friction for the common case.

## Annotate edge-case columns in your dbt model

Most columns don't need annotations. The exceptions:

### `convert_timezone: false` — show raw warehouse values

For system or audit columns where you want the raw stored value displayed (no shift to the project timezone):

```yaml
columns:
  - name: created_at_utc
    meta:
      dimension:
        type: timestamp
        convert_timezone: false
```

Use cases: audit logs, system timestamps, pre-converted values. The column will render exactly what the warehouse stores.

### `wall_clock_timezone:` — declare a non-UTC source zone for one column

If a specific column is stored as a naive timestamp in a known non-UTC zone (e.g., an event logged in Pacific time on a UTC-default warehouse):

```yaml
columns:
  - name: store_local_event_at
    meta:
      dimension:
        type: timestamp
        wall_clock_timezone: 'America/Los_Angeles'
```

Lightdash will interpret values in this column as Pacific time, regardless of the connection-level data timezone. This is the cleanest way to handle mixed-zone data without forcing every column onto one assumption. *— [GLITCH-463](https://linear.app/lightdash/issue/GLITCH-463)*

### DATE columns need no setup

If you declare a column as `type: date` in dbt, Lightdash treats it as a calendar value with no further configuration. No timezone is applied; the value is rendered as-is.

## What if I don't have timezones in my columns? [NEEDS REWRITING - TOO CLAUDE]

A common case, especially for warehouses or legacy systems that pre-date `TIMESTAMPTZ`. The short version: Lightdash treats naive timestamps and `DATE` columns differently, and the difference is deliberate.

**Naive** `TIMESTAMP` **(no timezone info).** A value like `2026-05-19 14:30:00` has hours and minutes — it implies a clock, but doesn't say which one. Lightdash has to pick a zone to interpret it against; otherwise it can't bucket the value into your project's "day" or convert it for a viewer in another zone. The connection-level **Data timezone** is that pick. Default is UTC. If your pipeline normalizes everything to UTC before loading, leave it alone. If your warehouse logs in local time, set it to that zone. One column in a different zone? Use `wall_clock_timezone:` on that column.

`DATE` **columns.** A value like `2026-05-19` has no clock at all — it's just a square on a calendar. Lightdash never anchors it to a timezone, never shifts it, never converts it. `2026-05-19` is `2026-05-19` for every viewer, in every project timezone. This is intentional: anchoring a DATE to midnight in some zone and then converting to another zone is the classic way to make a date "slip" by a day around midnight. Lightdash refuses to do this, which avoids a well-known class of off-by-one date bugs.

**The asymmetry in one line.** *Naive timestamps need an anchor because they have a clock; DATE values don't because they don't.*

**What this means in practice.**

- If your warehouse only has `DATE` columns: you barely need to think about timezones. Set the project timezone for relative filters ("yesterday") and you're done. See the worked example in Part 2.
- If your warehouse has naive `TIMESTAMP` columns: the **Data timezone** setting is the one thing you have to get right. Verify it with the connection preview before you build dashboards. *— [GLITCH-454](https://linear.app/lightdash/issue/GLITCH-454)*
- If you have both, or mixed-zone naive timestamps: `DATE` columns are unaffected; naive timestamps follow the data-timezone or `wall_clock_timezone:` rules above.

## Naming conventions

A small habit that pays off:

- `..._at` for timezone-aware timestamps (e.g., `created_at`, `purchased_at`).
- `..._date` for calendar `DATE` columns (e.g., `signup_date`, `effective_date`).
- `..._at_utc` for columns you've explicitly marked `convert_timezone: false`.

Lightdash doesn't enforce this, but it helps anyone reading your model know what to expect.

## Verify before you build

Before building dashboards, run a quick smoke test:

1. Open Explore on a model with a known timestamp column.
2. Group by the dimension at "Day" granularity.
3. Compare a few rows against the raw warehouse data.

If the dates match what you'd expect for your project timezone, you're done. If not, the most common causes are: data timezone set incorrectly (check the connection preview), or a specific column needs `wall_clock_timezone:` (it's stored in a zone different from the warehouse default). *— [GLITCH-454](https://linear.app/lightdash/issue/GLITCH-454), [GLITCH-463](https://linear.app/lightdash/issue/GLITCH-463)*

---

# Part 2 — Daily use

## The chart timezone badge

Every chart in Explore and on dashboards shows a small badge with the resolved timezone — for example, `America/New_York`. This tells you exactly what zone the chart's filters, buckets, and rendered values are using.

Read it. If it's not what you expect, click it to change the chart's timezone (see Sharing below).

## How filters work

### Relative date filters

Filters like "last 7 days," "yesterday," and "this month" are computed in the **resolved timezone of the chart**. That means:

- "Yesterday" on a chart in America/New_York means the calendar day that just ended in New York.
- "Last 7 days" means the rolling 7-day window ending at the current moment, with day boundaries in New York.
- "This month" means the calendar month in New York.

### Absolute date filters [FLAGGED FOR REVIEW]

Absolute date filters (a specific date or range) are unambiguous — `2024-03-15` is `2024-03-15`. They behave the same for every viewer.

If you need a precise time-of-day filter (e.g., "events after 9am Pacific on March 15"), use the timestamp filter and set the time explicitly. The picker shows your project timezone next to the time field so there's no guessing.

### Cell-click filters

Clicking a bar or cell to filter ("show me only this month") uses the value as displayed, not the underlying instant. Click "March 2024" and you filter to March 2024 in the chart's timezone — exactly what you saw.

## Day-grouped vs hour-grouped charts

This is the one subtlety worth understanding because it affects how charts look across viewers in different timezones.

### Day-or-coarser grouping

A chart grouped by **day, week, month, quarter, or year** buckets data by calendar boundaries. If the chart's resolved timezone changes — for example, because a viewer in a different zone is using viewer-timezone mode — the bucket boundaries move. The same underlying events can land in different bars.

**Implication:** two viewers in different timezones may see different numbers on a daily chart if the chart is set to use each viewer's timezone. This is correct (each viewer is seeing their own calendar) but can be surprising. See **Sharing charts** below for how to control this. *— [GLITCH-459](https://linear.app/lightdash/issue/GLITCH-459)*

### Sub-day grouping

A chart grouped by **hour, minute, or smaller** buckets data by instants. The boundaries are the same for every viewer — only the labels shift (your "9am EDT" is someone else's "2pm BST," but the bar contains the same events).

**Implication:** sub-day grouping is naturally consistent across viewers. The only exception is half-hour and 45-minute offset zones (India, Nepal, parts of Australia), where bucket boundaries don't align with whole-hour zones. Hour-grain charts spanning a daylight-saving transition may also render with a one-hour visual jump at the boundary. *— [GLITCH-453](https://linear.app/lightdash/issue/GLITCH-453), [GLITCH-449](https://linear.app/lightdash/issue/GLITCH-449)*

## Sharing charts: pinning vs viewer timezone

When you save a chart, Lightdash asks how you want viewers to see it:

| Mode | Behavior | When to use |
| --- | --- | --- |
| **Show every viewer my timezone** *(default)* | Pinned to the timezone you saved with. Every viewer sees identical numbers. | Reports, dashboards you share with others, anything where "look at this chart" needs to mean the same chart for everyone. |
| **Show each viewer their own timezone** | Re-computed in the viewer's timezone (if they've set one) or the project timezone otherwise. | Personal exploration, internal dashboards where each viewer should see their own day boundaries. |

**The default is "Show my timezone"** because it matches what most people expect when they share a chart: the numbers you see are the numbers I sent you. If you want viewer-specific re-bucketing, choose the other mode explicitly. *— [GLITCH-459](https://linear.app/lightdash/issue/GLITCH-459), [GLITCH-456](https://linear.app/lightdash/issue/GLITCH-456)*

You can change the mode at any time on a saved chart. Existing dashboards and links update with the chart.

### If you're a viewer

When you open a chart someone else saved:

- A small indicator on the chart card tells you whether you're seeing **the author's timezone** or **your own timezone**.
- If a chart looks unexpected — different from a screenshot the author sent — check the indicator first. Mode mismatch is the most common cause of "the numbers don't match" tickets.

*— [GLITCH-455](https://linear.app/lightdash/issue/GLITCH-455)*

## Your profile timezone

In your Profile settings, you can set a **Default timezone** (if your admin has enabled the feature). This affects:

- Charts you create that you save in "viewer timezone" mode.
- Charts other people created in "viewer timezone" mode that you open.
- The display of all timestamps in the Lightdash UI (when not pinned).

It does **not** affect:

- Pinned charts (those use the author's pin).
- Project-wide defaults for embeds, scheduled deliveries, or shared dashboards by default.

If you don't set a profile timezone, Lightdash uses the project timezone. If your admin turns the feature off after you've set a profile timezone, your saved value is no longer used. *— [GLITCH-451](https://linear.app/lightdash/issue/GLITCH-451)*

## Dashboards [FLAGGED FOR REVIEW]

Each chart on a dashboard keeps its own timezone setting. A dashboard can mix pinned charts (consistent across viewers) and viewer-timezone charts (varies per viewer). The chart card badge tells you which is which. *— [GLITCH-456](https://linear.app/lightdash/issue/GLITCH-456), [GLITCH-455](https://linear.app/lightdash/issue/GLITCH-455)*

Dashboard-level date filters (e.g., a date picker that controls multiple charts) pass the same value to every chart, but each chart applies its own timezone logic. So a dashboard filter "last 7 days" on a pinned chart and a viewer-timezone chart will produce different numbers — the pinned chart's "last 7 days" is anchored to the author's zone, the viewer-timezone chart's is anchored to the viewer's.

## Scheduled deliveries

Scheduled reports have two independent timezones, and it's worth understanding which is which:

| Setting | Controls | Example |
| --- | --- | --- |
| **Delivery time** | When the report fires | "Send at 9am every Monday" → uses delivery timezone |
| **Data timezone** | What "yesterday" / "last week" mean in the report | "Last 7 days" → uses the chart's pinned or project timezone |

The two don't have to match. A delivery scheduled for "9am New York" can contain a chart pinned to UTC — the report fires at 9am New York and shows UTC-bucketed data.

For most schedules, the cleanest setup is:

- **Delivery time** in the recipient's working timezone (so the report arrives at a useful hour).
- **Chart data** pinned to your reporting timezone (so the numbers are consistent and explicable).

*— [GLITCH-465](https://linear.app/lightdash/issue/GLITCH-465)*

## Embedded charts

When you embed a Lightdash chart in another product, the embed has no user — there's no profile timezone to fall back to. Embedded charts use:

1. The chart's pin, if set.
2. Otherwise, the project timezone.

If you need an embed in a specific timezone, pin the chart explicitly before embedding.

## Custom SQL with `${ldQueryTimezone}`

If you write custom SQL in a dimension or metric (for example, a custom time grain not covered by the built-in intervals), you can reference the resolved timezone using the template variable `${ldQueryTimezone}`:

```yaml
- name: fiscal_quarter
  meta:
    dimension:
      type: date
      sql: |
        DATE_TRUNC('quarter',
          ${TABLE}.created_at AT TIME ZONE '${ldQueryTimezone}'
        )::date
```

Lightdash substitutes the resolved timezone string (e.g., `America/New_York`) into your SQL at query time, in the same way the built-in dimensions do. Your custom logic stays in sync with the rest of the chart automatically. *— [GLITCH-462](https://linear.app/lightdash/issue/GLITCH-462), [GLITCH-461](https://linear.app/lightdash/issue/GLITCH-461)*

## When things go wrong

A few common symptoms and where to look:

| Symptom | Likely cause | Where to check | Tags |
| --- | --- | --- | --- |
| Two viewers see different numbers on the same chart | Chart is in viewer-timezone mode | The badge on the chart card; change to pinned if desired | [GLITCH-459](https://linear.app/lightdash/issue/GLITCH-459), [GLITCH-455](https://linear.app/lightdash/issue/GLITCH-455) |
| A daily chart shows a partial bar for "today" that the author didn't see | Viewer-timezone mode with a viewer further west than the author | Same as above | [GLITCH-459](https://linear.app/lightdash/issue/GLITCH-459) |
| All timestamps are off by an hour or several hours | Data timezone is set wrong on the connection | Project settings → Connection → Data timezone preview | [GLITCH-454](https://linear.app/lightdash/issue/GLITCH-454) |
| One specific column's timestamps are off, others are fine | That column needs a `wall_clock_timezone:` annotation | The column's dbt YAML | [GLITCH-463](https://linear.app/lightdash/issue/GLITCH-463) |
| Times in a CSV export differ from times in the Lightdash UI | Export was taken at a different chart-mode setting | Re-export from a chart with the desired pin | [GLITCH-456](https://linear.app/lightdash/issue/GLITCH-456) |
| "Yesterday" filter returns no data, but yesterday clearly has data | Project timezone is set to a zone where "yesterday" hasn't started yet | Project settings → Timezone | — |
| Hourly chart looks like it skipped or doubled an hour | Daylight-saving transition in the rendered period | Switch to UTC pin to confirm | [GLITCH-449](https://linear.app/lightdash/issue/GLITCH-449) |

If you're stuck, the badge on the chart card and the data-timezone preview on the connection page are the two fastest checks. They tell you exactly what Lightdash is using.

---

## TL;DR checklist

**Modeling:**

- [ ] Use timezone-aware timestamp types in your warehouse.
- [ ] Use `DATE` for calendar values, not strings, not timestamps.
- [ ] Set the connection's data timezone (default UTC is usually right). *— [GLITCH-454](https://linear.app/lightdash/issue/GLITCH-454)*
- [ ] Set the project timezone to your reporting zone.
- [ ] Add `wall_clock_timezone:` only on columns that need it. *— [GLITCH-463](https://linear.app/lightdash/issue/GLITCH-463)*
- [ ] Add `convert_timezone: false` only on columns you want raw.

**Day-to-day:**

- [ ] Set your profile timezone once.
- [ ] When saving a chart, pick "my timezone" (default) or "viewer timezone" deliberately. *— [GLITCH-459](https://linear.app/lightdash/issue/GLITCH-459), [GLITCH-456](https://linear.app/lightdash/issue/GLITCH-456)*
- [ ] Read the badge on the chart card — it tells you the resolved zone.
- [ ] Pin charts you share externally. *— [GLITCH-459](https://linear.app/lightdash/issue/GLITCH-459)*
- [ ] Use `${ldQueryTimezone}` in custom SQL. *— [GLITCH-462](https://linear.app/lightdash/issue/GLITCH-462)*

---

# Appendix — Worked example: one row, four configurations *[DRAFT VERY CLAUDE]*

Imagine one row in your `orders` table:

| Column | Type | Stored value |
| --- | --- | --- |
| `order_date` | `DATE` | `2026-05-19` |
| `order_created_at` | `TIMESTAMP` (UTC) | `2026-05-19 02:00:00 UTC` |

Same row, same warehouse — here's what changes as you layer features on.

### 1. Out of the box — project TZ = UTC, no pins, no user TZ

- `order_created_at` renders as `2026-05-19 02:00`. Grouped by day → bucket `2026-05-19`.
- `order_date` renders as `2026-05-19`.
- "Yesterday" filter on either column = `2026-05-18`.
- Every viewer, everywhere, sees the same thing. ✅

### 2. Change project TZ to America/New_York

- `order_created_at` now renders as `2026-05-18 22:00` (the same instant, shown in NY). Grouped by day → bucket `2026-05-18`. *The row moved buckets.*
- `order_date` still renders as `2026-05-19`. **DATE columns don't shift.**
- "Yesterday" on `order_created_at` = the calendar day that ended in NY → `2026-05-18`.
- "Yesterday" on `order_date` = also `2026-05-18` (the literal is computed in NY, but compared as a plain date).
- Still identical for every viewer.

### 3. Pin one chart to Asia/Tokyo (project remains NY)

- On the pinned chart: `order_created_at` renders as `2026-05-19 11:00 JST`, bucket `2026-05-19`. `order_date` still `2026-05-19`.
- On every *other* chart in the project: still NY behaviour from step 2.
- All viewers see the same numbers on each chart — but the dashboard now mixes zones. A badge tells viewers which zone each chart is in.

### 4. Enable user timezones; viewer A is in London, viewer B in Tokyo, chart is *not* pinned

- Viewer A sees `order_created_at` in London time; "yesterday" is the day that ended in London.
- Viewer B sees the same column in Tokyo time; "yesterday" is the day that ended in Tokyo.
- Around midnight in either zone, the same row can land in a different daily bucket for A vs B, and "yesterday" can resolve to different dates. *Two viewers, same chart, different numbers.*
- `order_date` is unaffected by the viewer's zone for rendering — both see `2026-05-19`. But "yesterday" on `order_date` *still* depends on whose calendar "now" we use, so the filter result can differ.

---

**The pattern.** TIMESTAMP rendering and bucketing shift with the resolved zone. DATE values never shift — but anything derived from "now" (relative filters) always uses the resolved zone, regardless of column type.