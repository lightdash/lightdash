-- =====================================================================
-- SEMI-ADDITIVE METRIC COMPARISON: account_balances
-- =====================================================================
-- daily_account_balance is a semi-additive metric: a point-in-time
-- snapshot. Records are unique per (date, account_id) — the primary key.
--
-- Non-time primary key columns: (account_id)
--
-- ROW_NUMBER must always partition by ALL non-time primary key columns
-- to ensure every entity contributes exactly one snapshot value.
-- When a time dimension is in the query, add it to the PARTITION BY.
-- When no time dimension is selected, partition by non-time PK only.
-- =====================================================================

-- daily_account_balance per year (time dimension selected)

WITH latest_per_entity_year AS (
    SELECT
        account_id,
        account_region,
        DATE_TRUNC('year', date) AS year,
        date,
        daily_account_balance,
        ROW_NUMBER() OVER (
            PARTITION BY account_id, DATE_TRUNC('year', date)
            ORDER BY date DESC
        ) AS rn
    FROM {{ ref('account_balances') }}
),

year_correct AS (
    SELECT year, SUM(daily_account_balance) AS correct
    FROM latest_per_entity_year
    WHERE rn = 1
    GROUP BY year
),

year_incorrect AS (
    SELECT DATE_TRUNC('year', date) AS year, SUM(daily_account_balance) AS incorrect
    FROM {{ ref('account_balances') }}
    GROUP BY DATE_TRUNC('year', date)
),

-- daily_account_balance per account_region (no time dimension)

latest_per_entity AS (
    SELECT
        account_id,
        account_region,
        daily_account_balance,
        ROW_NUMBER() OVER (
            PARTITION BY account_id
            ORDER BY date DESC
        ) AS rn
    FROM {{ ref('account_balances') }}
),

region_correct AS (
    SELECT account_region, SUM(daily_account_balance) AS correct
    FROM latest_per_entity
    WHERE rn = 1
    GROUP BY account_region
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
