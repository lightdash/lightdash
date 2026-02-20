-- Wide table joining customers, orders, order line items, and payments
-- This creates a compound fanout from two one-to-many relationships:
--   orders -> line_items (1:N)
--   orders -> payments (1:N)
-- Result: line_items × payments rows per order
--
-- Use sum_distinct metrics to deduplicate aggregations at different grains:
--   - Order-level metrics: dedupe by order_id
--   - Line item metrics: dedupe by line_item_id (or order_id + line_item_id if not globally unique)
--   - Payment metrics: no dedup needed at payment grain, but need order_id for order-level

with customers as (
    select * from {{ ref('stg_customers') }}
),

orders as (
    select * from {{ ref('stg_orders') }}
),

order_items as (
    select
        id as line_item_id,
        order_id,
        product_name,
        quantity,
        unit_price,
        quantity * unit_price as line_item_total
    from {{ ref('raw_order_items') }}
),

payments as (
    select * from {{ ref('stg_payments') }}
)

-- Cross join line items and payments for the same order creates the fanout
select
    -- Customer grain (dedupe by customer_id)
    c.customer_id,
    c.first_name,
    c.last_name,

    -- Order grain (dedupe by order_id)
    o.order_id,
    o.order_date,
    o.status as order_status,
    o.shipping_cost,

    -- Line item grain (dedupe by line_item_id)
    li.line_item_id,
    li.product_name,
    li.quantity,
    li.unit_price,
    li.line_item_total,

    -- Payment grain
    p.payment_id,
    p.payment_method,
    p.amount as payment_amount

from orders o
inner join order_items li on o.order_id = li.order_id
inner join payments p on o.order_id = p.order_id
left join customers c on o.customer_id = c.customer_id
