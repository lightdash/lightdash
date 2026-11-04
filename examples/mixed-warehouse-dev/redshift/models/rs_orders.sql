{{ config(materialized='view', schema='public', alias='rs_orders') }}
select order_id, store_id, region, order_date, order_total from public.rs_orders
