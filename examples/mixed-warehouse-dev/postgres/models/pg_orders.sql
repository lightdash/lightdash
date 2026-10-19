{{ config(materialized='view', schema='jaffle', alias='orders') }}
select order_id, customer_id, order_date, status, amount from jaffle.orders
