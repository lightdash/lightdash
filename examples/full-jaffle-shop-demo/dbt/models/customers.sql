
with customers as (

    select * from {{ ref('stg_customers') }}

),

orders as (

    select * from {{ ref('stg_orders') }}

),

payments as (

    select * from {{ ref('stg_payments') }}

),

customer_orders as (

    select
        customer_id,

        min(order_date) as first_order,
        max(order_date) as most_recent_order,
        count(order_id) as number_of_orders
    from orders

    group by 1

),

customer_orders_latest AS (
  SELECT
  customer_id,
  MAX(most_recent_order) OVER(PARTITION BY NULL) AS latest_order -- getting the latest order date from all customers

  FROM customer_orders
),

customer_payments as (

    select
        orders.customer_id,
        sum(amount) as total_amount

    from payments

    left join orders using (order_id)

    group by 1

),

final as (

    select
        customers.customer_id,
        customers.first_name,
        customers.last_name,
        30 as age, -- fixed age is filtered using required_attributes on schema.yml
        customers.created,
        customer_orders.first_order,
        customer_orders.most_recent_order,
        customer_orders.number_of_orders,
        customer_payments.total_amount as customer_lifetime_value,
        customer_orders.first_order::date - customers.created::date AS days_between_created_and_first_order,
        EXTRACT(day FROM customer_orders.most_recent_order::timestamp - customer_orders_latest.latest_order::timestamp) AS days_since_last_order

    from customers

    left join customer_orders using (customer_id)

    left join customer_payments using (customer_id)

    LEFT JOIN customer_orders_latest USING(customer_id)

)

select * from final
