-- =====================================================================
-- SEMI-ADDITIVE METRIC COMPARISON: account_balances
-- =====================================================================
-- daily_account_balance is a semi-additive metric: a point-in-time
-- snapshot. Records are unique per (date, account_id) — the primary key.
--
-- The "correct" approach finds the global MAX date within each time
-- bucket and filters to rows on that date. This assumes all entities
-- have data on the last date in each bucket (no missing data handling).
-- =====================================================================

-- daily_account_balance per year (time dimension selected)

WITH max_date_per_year AS (
    SELECT DATE_TRUNC('year', date) AS year, MAX(date) AS max_date
    FROM {{ ref('account_balances') }}
    GROUP BY DATE_TRUNC('year', date)
),

year_correct AS (
    SELECT m.year, SUM(ab.daily_account_balance) AS correct
    FROM {{ ref('account_balances') }} ab
    INNER JOIN max_date_per_year m ON ab.date = m.max_date
    GROUP BY m.year
),

year_incorrect AS (
    SELECT DATE_TRUNC('year', date) AS year, SUM(daily_account_balance) AS incorrect
    FROM {{ ref('account_balances') }}
    GROUP BY DATE_TRUNC('year', date)
),

-- daily_account_balance per account_region (no time dimension)

max_date_global AS (
    SELECT MAX(date) AS max_date
    FROM {{ ref('account_balances') }}
),

region_correct AS (
    SELECT ab.account_region, SUM(ab.daily_account_balance) AS correct
    FROM {{ ref('account_balances') }} ab
    INNER JOIN max_date_global g ON ab.date = g.max_date
    GROUP BY ab.account_region
),

region_incorrect AS (
    SELECT account_region, SUM(daily_account_balance) AS incorrect
    FROM {{ ref('account_balances') }}
    GROUP BY account_region
)

SELECT
    'year' AS dimensions,
    CAST(EXTRACT(YEAR FROM c.year) AS TEXT) AS dimension_values,
    'daily_account_balance' AS semi_additive_metric,
    c.correct,
    i.incorrect
FROM year_correct c
INNER JOIN year_incorrect i ON c.year = i.year

UNION ALL

SELECT
    'account_region' AS dimensions,
    c.account_region AS dimension_values,
    'daily_account_balance' AS semi_additive_metric,
    c.correct,
    i.incorrect
FROM region_correct c
INNER JOIN region_incorrect i ON c.account_region = i.account_region
