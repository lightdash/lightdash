-- =====================================================================
-- SEMI-ADDITIVE METRIC COMPARISON: monthly_recurring_revenue
-- =====================================================================
-- mrr is a semi-additive metric: it represents a point-in-time snapshot,
-- not a flow. Records are unique per (month, division, sub_division,
-- plan_tier) — the primary key.
--
-- WHY ROW_NUMBER MUST PARTITION BY ALL NON-TIME PRIMARY KEY COLUMNS?
--
-- Primary key: (month, division, sub_division, plan_tier)
-- Non-time primary key columns: (division, sub_division, plan_tier)
--
-- MRR is recorded once per month for each (division, sub_division,
-- plan_tier) combination. A naive SUM(mrr) across rows double-counts
-- because it adds up every monthly snapshot — e.g. if Web/Web/Starter
-- has MRR of $30k in Jan, $31k in Feb, and $32k in Mar, a naive SUM
-- returns $93k instead of the actual current MRR of $32k.
--
-- To get the correct MRR we must first collapse to a single row per
-- entity. We use ROW_NUMBER() partitioned by ALL non-time primary key
-- columns (division, sub_division, plan_tier) and ordered by month DESC
-- to pick each entity's most recent snapshot. Only then can we safely
-- SUM across entities — because each entity contributes exactly one
-- MRR value, not one per month.
--
-- It must be ALL non-time primary key columns, not just the dimension
-- in the query. If we partitioned by only (division), each partition
-- would contain multiple sub_division/plan_tier combos, and ROW_NUMBER
-- would arbitrarily keep just one — silently dropping data. The primary
-- key defines the grain, so we always partition at that grain to ensure
-- every entity is represented exactly once.
--
-- When a time dimension IS in the query (e.g. year), we add it to the
-- PARTITION BY so each entity contributes one row per year.
-- When NO time dimension is selected, we partition only by the non-time
-- primary key columns, giving each entity's latest-ever snapshot.
-- =====================================================================

-- MRR per year (time dimension selected)
-- Partition includes year so each entity gets one row per year.

WITH latest_per_entity_year AS (
    SELECT
        division,
        sub_division,
        plan_tier,
        DATE_TRUNC('year', month) AS year,
        month,
        mrr,
        active_subscriptions,
        ROW_NUMBER() OVER (
            PARTITION BY division, sub_division, plan_tier, DATE_TRUNC('year', month)
            ORDER BY month DESC
        ) AS rn
    FROM {{ ref('monthly_recurring_revenue') }}
),

year_correct AS (
    SELECT year, SUM(mrr) AS mrr_correct, SUM(active_subscriptions) AS subs_correct
    FROM latest_per_entity_year
    WHERE rn = 1
    GROUP BY year
),

year_incorrect AS (
    SELECT DATE_TRUNC('year', month) AS year, SUM(mrr) AS mrr_incorrect, SUM(active_subscriptions) AS subs_incorrect
    FROM {{ ref('monthly_recurring_revenue') }}
    GROUP BY DATE_TRUNC('year', month)
),

-- MRR per division / sub_division (no time dimension selected)
-- Partition by all non-time primary key columns only.

latest_per_entity AS (
    SELECT
        division,
        sub_division,
        plan_tier,
        mrr,
        active_subscriptions,
        ROW_NUMBER() OVER (
            PARTITION BY division, sub_division, plan_tier
            ORDER BY month DESC
        ) AS rn
    FROM {{ ref('monthly_recurring_revenue') }}
),

division_correct AS (
    SELECT division, SUM(mrr) AS mrr_correct, SUM(active_subscriptions) AS subs_correct
    FROM latest_per_entity
    WHERE rn = 1
    GROUP BY division
),

division_incorrect AS (
    SELECT division, SUM(mrr) AS mrr_incorrect, SUM(active_subscriptions) AS subs_incorrect
    FROM {{ ref('monthly_recurring_revenue') }}
    GROUP BY division
),

sub_division_correct AS (
    SELECT sub_division, SUM(mrr) AS mrr_correct, SUM(active_subscriptions) AS subs_correct
    FROM latest_per_entity
    WHERE rn = 1
    GROUP BY sub_division
),

sub_division_incorrect AS (
    SELECT sub_division, SUM(mrr) AS mrr_incorrect, SUM(active_subscriptions) AS subs_incorrect
    FROM {{ ref('monthly_recurring_revenue') }}
    GROUP BY sub_division
)

SELECT
    'year' AS dimensions,
    CAST(EXTRACT(YEAR FROM c.year) AS TEXT) AS dimension_values,
    'MRR' AS semi_additive_metric,
    c.mrr_correct,
    i.mrr_incorrect
FROM year_correct c
INNER JOIN year_incorrect i ON c.year = i.year

UNION ALL

SELECT
    'division' AS dimensions,
    c.division AS dimension_values,
    'MRR' AS semi_additive_metric,
    c.mrr_correct,
    i.mrr_incorrect
FROM division_correct c
INNER JOIN division_incorrect i ON c.division = i.division

UNION ALL

SELECT
    'sub_division' AS dimensions,
    c.sub_division AS dimension_values,
    'MRR' AS semi_additive_metric,
    c.mrr_correct,
    i.mrr_incorrect
FROM sub_division_correct c
INNER JOIN sub_division_incorrect i ON c.sub_division = i.sub_division

UNION ALL

-- active_subscriptions per year
SELECT
    'year' AS dimensions,
    CAST(EXTRACT(YEAR FROM c.year) AS TEXT) AS dimension_values,
    'active_subscriptions' AS semi_additive_metric,
    c.subs_correct,
    i.subs_incorrect
FROM year_correct c
INNER JOIN year_incorrect i ON c.year = i.year

UNION ALL

-- active_subscriptions per division
SELECT
    'division' AS dimensions,
    c.division AS dimension_values,
    'active_subscriptions' AS semi_additive_metric,
    c.subs_correct,
    i.subs_incorrect
FROM division_correct c
INNER JOIN division_incorrect i ON c.division = i.division

UNION ALL

-- active_subscriptions per sub_division
SELECT
    'sub_division' AS dimensions,
    c.sub_division AS dimension_values,
    'active_subscriptions' AS semi_additive_metric,
    c.subs_correct,
    i.subs_incorrect
FROM sub_division_correct c
INNER JOIN sub_division_incorrect i ON c.sub_division = i.sub_division
