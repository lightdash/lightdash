{#
  External pre-aggregate tables for the orders explore, simulating
  customer-managed materialized views that Lightdash serves from.
  Bodies are copied verbatim from the Lightdash-generated materialization
  queries (minus ORDER BY/LIMIT) so they conform to the generated column
  contract: metric columns named by fieldId, avg components as
  <fieldId>__sum / <fieldId>__count, time dimension as <dim>_<grain>.
  Recreated on-run-end because dbt table rebuilds drop them via CASCADE.
#}
{% macro create_external_pre_aggregate_tables() %}
  {% if target.type == 'postgres' and execute %}
    {% do run_query('drop materialized view if exists "' ~ target.schema ~ '"."orders_ext_daily_status_mv"') %}
    {% do run_query('
      create materialized view "' ~ target.schema ~ '"."orders_ext_daily_status_mv" as
      SELECT
        "orders".status AS "orders_status",
        "orders".order_source AS "orders_order_source",
        DATE_TRUNC(\'DAY\', "orders".order_date) AS "orders_order_date_day",
        SUM("orders".amount) AS "orders_total_order_amount",
        SUM("orders".amount) AS "orders_average_order_size__sum",
        COUNT("orders".amount) AS "orders_average_order_size__count"
      FROM "' ~ target.schema ~ '"."orders" AS "orders"
      GROUP BY 1,2,3
    ') %}
    {% do run_query('drop materialized view if exists "' ~ target.schema ~ '"."orders_ext_daily_joined_mv"') %}
    {% do run_query('
      create materialized view "' ~ target.schema ~ '"."orders_ext_daily_joined_mv" as
      SELECT
        "orders".status AS "orders_status",
        "customers".first_name AS "customers_first_name",
        DATE_TRUNC(\'DAY\', "orders".order_date) AS "orders_order_date_day",
        SUM("orders".amount) AS "orders_total_order_amount",
        SUM(CASE WHEN (("orders".is_completed) = true) THEN ("orders".amount) ELSE NULL END) AS "orders_total_completed_order_amount"
      FROM "' ~ target.schema ~ '"."orders" AS "orders"
      LEFT OUTER JOIN "' ~ target.schema ~ '"."customers" AS "customers"
        ON ("customers".customer_id) = ("orders".customer_id)
      GROUP BY 1,2,3
    ') %}
    {{ log('Created external pre-aggregate matviews: orders_ext_daily_status_mv, orders_ext_daily_joined_mv', info=True) }}
  {% endif %}
{% endmacro %}
