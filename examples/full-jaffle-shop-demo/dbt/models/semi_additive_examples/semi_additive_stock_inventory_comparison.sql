-- =====================================================================
-- SEMI-ADDITIVE METRIC COMPARISON: stock_inventory
-- =====================================================================
-- units_in_stock is a semi-additive metric: a point-in-time snapshot.
-- Records are unique per (month, warehouse, product_category) — the
-- primary key.
--
-- The "correct" approach finds the global MAX month within each time
-- bucket and filters to rows on that month. This assumes all entities
-- have data on the last month in each bucket (no missing data handling).
-- =====================================================================

-- units_in_stock per year (time dimension selected)

WITH max_month_per_year AS (
    SELECT DATE_TRUNC('year', month) AS year, MAX(month) AS max_month
    FROM {{ ref('stock_inventory') }}
    GROUP BY DATE_TRUNC('year', month)
),

year_correct AS (
    SELECT m.year, SUM(si.units_in_stock) AS correct
    FROM {{ ref('stock_inventory') }} si
    INNER JOIN max_month_per_year m ON si.month = m.max_month
    GROUP BY m.year
),

year_incorrect AS (
    SELECT DATE_TRUNC('year', month) AS year, SUM(units_in_stock) AS incorrect
    FROM {{ ref('stock_inventory') }}
    GROUP BY DATE_TRUNC('year', month)
),

-- units_in_stock per warehouse / product_category / region (no time dimension)

max_month_global AS (
    SELECT MAX(month) AS max_month
    FROM {{ ref('stock_inventory') }}
),

warehouse_correct AS (
    SELECT si.warehouse, SUM(si.units_in_stock) AS correct
    FROM {{ ref('stock_inventory') }} si
    INNER JOIN max_month_global g ON si.month = g.max_month
    GROUP BY si.warehouse
),

warehouse_incorrect AS (
    SELECT warehouse, SUM(units_in_stock) AS incorrect
    FROM {{ ref('stock_inventory') }}
    GROUP BY warehouse
),

product_category_correct AS (
    SELECT si.product_category, SUM(si.units_in_stock) AS correct
    FROM {{ ref('stock_inventory') }} si
    INNER JOIN max_month_global g ON si.month = g.max_month
    GROUP BY si.product_category
),

product_category_incorrect AS (
    SELECT product_category, SUM(units_in_stock) AS incorrect
    FROM {{ ref('stock_inventory') }}
    GROUP BY product_category
),

region_correct AS (
    SELECT si.region, SUM(si.units_in_stock) AS correct
    FROM {{ ref('stock_inventory') }} si
    INNER JOIN max_month_global g ON si.month = g.max_month
    GROUP BY si.region
),

region_incorrect AS (
    SELECT region, SUM(units_in_stock) AS incorrect
    FROM {{ ref('stock_inventory') }}
    GROUP BY region
)

SELECT
    'year' AS dimensions,
    CAST(EXTRACT(YEAR FROM c.year) AS TEXT) AS dimension_values,
    'units_in_stock' AS semi_additive_metric,
    c.correct,
    i.incorrect
FROM year_correct c
INNER JOIN year_incorrect i ON c.year = i.year

UNION ALL

SELECT
    'warehouse' AS dimensions,
    c.warehouse AS dimension_values,
    'units_in_stock' AS semi_additive_metric,
    c.correct,
    i.incorrect
FROM warehouse_correct c
INNER JOIN warehouse_incorrect i ON c.warehouse = i.warehouse

UNION ALL

SELECT
    'product_category' AS dimensions,
    c.product_category AS dimension_values,
    'units_in_stock' AS semi_additive_metric,
    c.correct,
    i.incorrect
FROM product_category_correct c
INNER JOIN product_category_incorrect i ON c.product_category = i.product_category

UNION ALL

SELECT
    'region' AS dimensions,
    c.region AS dimension_values,
    'units_in_stock' AS semi_additive_metric,
    c.correct,
    i.incorrect
FROM region_correct c
INNER JOIN region_incorrect i ON c.region = i.region
