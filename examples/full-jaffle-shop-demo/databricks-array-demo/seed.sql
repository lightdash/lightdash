-- Seed data for the ARRAY-dimension demo.
--
-- Native ARRAY support is Databricks-only, so this fixture lives outside the
-- (Postgres-backed) jaffle models and is meant to be run against a Databricks
-- warehouse. Adjust the catalog/schema to match your connection.
--
-- Covers three element kinds so the demo can exercise every case:
--   tags        ARRAY<STRING>                  -> string-array filter + unnest
--   priorities  ARRAY<INT>                     -> number-array filter (typed)
--   line_items  ARRAY<STRUCT<sku,qty>>         -> object-array unnest

CREATE OR REPLACE TABLE lightdash_staging.jaffle.array_tags AS
SELECT id, customer_name, amount, tags, priorities, line_items FROM (
  SELECT 1 AS id, 'alice' AS customer_name, 100 AS amount,
         array('billing', 'open')                              AS tags,
         array(3, 5)                                           AS priorities,
         array(named_struct('sku', 'A', 'qty', 2),
               named_struct('sku', 'B', 'qty', 1))             AS line_items
  UNION ALL SELECT 2, 'bob', 50,
         array('sales'),
         array(1),
         array(named_struct('sku', 'C', 'qty', 5))
  UNION ALL SELECT 3, 'carol', 200,
         array('billing', 'sales', 'open'),
         array(2, 4, 6),
         array(named_struct('sku', 'A', 'qty', 1))
  -- dave's arrays are NULL, to exercise "is null" / "is not null" / NULL-safe negation
  UNION ALL SELECT 4, 'dave', 25,
         CAST(NULL AS array<string>),
         CAST(NULL AS array<int>),
         CAST(NULL AS array<struct<sku:string, qty:int>>)
);
