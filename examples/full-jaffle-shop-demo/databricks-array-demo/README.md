# Array-dimensions demo (Databricks)

Content-as-code exercising native `ARRAY` dimensions: **filtering**, **unnesting**,
and **typed filter values** via `array_element_type`.

Native array support is **Databricks-only**, so this fixture is kept separate from
the Postgres-backed jaffle models. It will not compile against the default
(Postgres) demo connection.

## Prerequisites

1. A project connected to a **Databricks** warehouse.
2. The `array-dimensions` feature flag enabled on the instance:
   `LIGHTDASH_ENABLE_FEATURE_FLAGS=array-dimensions`.
   (When off, Databricks `ARRAY` columns map to `STRING` and this demo shows nothing new.)

## Setup

1. Seed the fixture table (adjust the catalog/schema to your connection):

   ```sql
   -- seed.sql
   ```

   Run `seed.sql` against your Databricks SQL warehouse. It creates
   `lightdash_staging.jaffle.array_tags` with three element kinds:

   | column       | type                          | demo of                        |
   |--------------|-------------------------------|--------------------------------|
   | `tags`       | `ARRAY<STRING>`               | string-array filter + unnest   |
   | `priorities` | `ARRAY<INT>`                  | typed (unquoted) number filter |
   | `line_items` | `ARRAY<STRUCT<sku,qty>>`      | object-array unnest            |

2. Deploy the model + charts:

   ```bash
   lightdash deploy        # picks up models/array_tags.yml
   lightdash upload        # picks up charts/*.yml
   ```

## What each chart covers

| Chart | Case | Compiled SQL (Databricks) |
|-------|------|---------------------------|
| `charts/array-tags-tag-breakdown.yml`     | Unnest a string array | `… LATERAL VIEW explode(tags) … GROUP BY tag` |
| `charts/array-tags-billing-customers.yml` | String-array filter   | `WHERE (array_contains(tags, 'billing'))` |
| `charts/array-tags-priority-filter.yml`   | Number-array filter (typed) | `WHERE (array_contains(priorities, 5))` — `5`, not `'5'` |

## Verified against live Databricks

The compiled SQL was run against the seed data; results:

| Case | SQL | Result |
|------|-----|--------|
| string includes | `array_contains(tags, 'billing')` | alice, carol |
| string overlap   | `arrays_overlap(tags, array('sales','open'))` | alice, bob, carol |
| not-include (NULL-safe) | `NOT array_contains(tags,'billing') OR tags IS NULL` | bob, dave |
| number includes (typed) | `array_contains(priorities, 5)` | alice |
| unnest string | `LATERAL VIEW explode(tags)` | billing×2, open×2, sales×2 |
| unnest objects | `LATERAL VIEW explode(line_items)` | sku A×2, B×1, C×1 |

> Object arrays (`line_items`) unnest fine, but containment filtering on them is
> not meaningful — leave `array_element_type` unset and use them for unnesting only.
