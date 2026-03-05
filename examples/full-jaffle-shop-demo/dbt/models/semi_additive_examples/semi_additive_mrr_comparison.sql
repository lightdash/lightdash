-- =====================================================================
-- SEMI-ADDITIVE METRIC COMPARISON: monthly_recurring_revenue
-- =====================================================================
-- mrr is a semi-additive metric: it represents a point-in-time snapshot,
-- not a flow. Records are unique per (month, division, sub_division,
-- plan_tier) — the primary key.
--
-- The "correct" approach finds the global MAX month within each time
-- bucket and filters to rows on that month. This assumes all entities
-- have data on the last month in each bucket (no missing data handling).
-- =====================================================================

-- MRR per year (time dimension selected)

WITH max_month_per_year AS (
    SELECT DATE_TRUNC('year', month) AS year, MAX(month) AS max_month
    FROM {{ ref('monthly_recurring_revenue') }}
    GROUP BY DATE_TRUNC('year', month)
),

year_correct AS (
    SELECT m.year,
           SUM(mrr.mrr) AS mrr_correct,
           SUM(mrr.active_subscriptions) AS subs_correct
    FROM {{ ref('monthly_recurring_revenue') }} mrr
    INNER JOIN max_month_per_year m ON mrr.month = m.max_month
    GROUP BY m.year
),

year_incorrect AS (
    SELECT DATE_TRUNC('year', month) AS year,
           SUM(mrr) AS mrr_incorrect,
           SUM(active_subscriptions) AS subs_incorrect
    FROM {{ ref('monthly_recurring_revenue') }}
    GROUP BY DATE_TRUNC('year', month)
),

-- MRR per division / sub_division (no time dimension selected)

max_month_global AS (
    SELECT MAX(month) AS max_month
    FROM {{ ref('monthly_recurring_revenue') }}
),

division_correct AS (
    SELECT mrr.division,
           SUM(mrr.mrr) AS mrr_correct,
           SUM(mrr.active_subscriptions) AS subs_correct
    FROM {{ ref('monthly_recurring_revenue') }} mrr
    INNER JOIN max_month_global g ON mrr.month = g.max_month
    GROUP BY mrr.division
),

division_incorrect AS (
    SELECT division,
           SUM(mrr) AS mrr_incorrect,
           SUM(active_subscriptions) AS subs_incorrect
    FROM {{ ref('monthly_recurring_revenue') }}
    GROUP BY division
),

sub_division_correct AS (
    SELECT mrr.sub_division,
           SUM(mrr.mrr) AS mrr_correct,
           SUM(mrr.active_subscriptions) AS subs_correct
    FROM {{ ref('monthly_recurring_revenue') }} mrr
    INNER JOIN max_month_global g ON mrr.month = g.max_month
    GROUP BY mrr.sub_division
),

sub_division_incorrect AS (
    SELECT sub_division,
           SUM(mrr) AS mrr_incorrect,
           SUM(active_subscriptions) AS subs_incorrect
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
