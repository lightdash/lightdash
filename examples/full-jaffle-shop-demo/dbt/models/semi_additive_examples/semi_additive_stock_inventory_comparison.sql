-- =====================================================================
-- SEMI-ADDITIVE METRIC COMPARISON: stock_inventory
-- =====================================================================
-- units_in_stock is a semi-additive metric: a point-in-time snapshot.
-- Records are unique per (month, warehouse, product_category) — the
-- primary key.
--
-- Non-time primary key columns: (warehouse, product_category)
--
-- ROW_NUMBER must always partition by ALL non-time primary key columns
-- to ensure every entity contributes exactly one snapshot value.
-- When a time dimension is in the query, add it to the PARTITION BY.
-- When no time dimension is selected, partition by non-time PK only.
-- =====================================================================

-- units_in_stock per year (time dimension selected)

WITH latest_per_entity_year AS (
    SELECT
        warehouse,
        product_category,
        country,
        region,
        DATE_TRUNC('year', month) AS year,
        month,
        units_in_stock,
        ROW_NUMBER() OVER (
            PARTITION BY warehouse, product_category, DATE_TRUNC('year', month)
            ORDER BY month DESC
        ) AS rn
    FROM {{ ref('stock_inventory') }}
),

year_correct AS (
    SELECT year, SUM(units_in_stock) AS correct
    FROM latest_per_entity_year
    WHERE rn = 1
    GROUP BY year
),

year_incorrect AS (
    SELECT DATE_TRUNC('year', month) AS year, SUM(units_in_stock) AS incorrect
    FROM {{ ref('stock_inventory') }}
    GROUP BY DATE_TRUNC('year', month)
),

-- units_in_stock per warehouse / product_category / region (no time dimension)

latest_per_entity AS (
    SELECT
        warehouse,
        product_category,
        country,
        region,
        units_in_stock,
        ROW_NUMBER() OVER (
            PARTITION BY warehouse, product_category
            ORDER BY month DESC
        ) AS rn
    FROM {{ ref('stock_inventory') }}
),

warehouse_correct AS (
    SELECT warehouse, SUM(units_in_stock) AS correct
    FROM latest_per_entity
    WHERE rn = 1
    GROUP BY warehouse
),

warehouse_incorrect AS (
    SELECT warehouse, SUM(units_in_stock) AS incorrect
    FROM {{ ref('stock_inventory') }}
    GROUP BY warehouse
),

product_category_correct AS (
    SELECT product_category, SUM(units_in_stock) AS correct
    FROM latest_per_entity
    WHERE rn = 1
    GROUP BY product_category
),

product_category_incorrect AS (
    SELECT product_category, SUM(units_in_stock) AS incorrect
    FROM {{ ref('stock_inventory') }}
    GROUP BY product_category
),

region_correct AS (
    SELECT region, SUM(units_in_stock) AS correct
    FROM latest_per_entity
    WHERE rn = 1
    GROUP BY region
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
