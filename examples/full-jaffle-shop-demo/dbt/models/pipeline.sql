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

order_payments as (
    select
        order_id,
        sum(amount) as total_amount
    from payments
    group by 1
),

customer_payments as (
    select
        orders.customer_id,
        sum(order_payments.total_amount) as total_amount
    from orders
    left join order_payments using (order_id)
    group by 1
),

pipeline_data as (
    select
        customers.customer_id,
        customers.first_name,
        customers.last_name,
        customers.created as customer_created,
        
        orders.order_id,
        orders.order_date,
        orders.status as order_status,
        case when orders.status = 'completed' then TRUE else FALSE end as is_completed_order,
        
        order_payments.total_amount as order_amount,
        customer_orders.number_of_orders,
        customer_payments.total_amount as customer_lifetime_value,
        
        -- Parameter-based filtering examples
        case 
            when order_payments.total_amount >= CAST('${ld.parameters.min_order_amount}' AS NUMERIC) then TRUE 
            else FALSE 
        end as meets_min_order_threshold,
        
        -- Quarter-based filtering for company quarters
        case 
            when EXTRACT(month from orders.order_date) in (3,4,5) then 'LDQ1'
            when EXTRACT(month from orders.order_date) in (6,7,8) then 'LDQ2'
            when EXTRACT(month from orders.order_date) in (9,10,11) then 'LDQ3'
            when EXTRACT(month from orders.order_date) in (12,1,2) then 'LDQ4'
            else 'Unknown'
        end as company_quarter,
        
        -- Funnel stage calculations for different funnel types
        case 
            when customers.customer_id is not null and customer_orders.number_of_orders > 0 and (customer_orders.number_of_orders > 1 or customer_payments.total_amount > 20) and customer_payments.total_amount > 0 and customer_payments.total_amount > 25 then 5
            when customers.customer_id is not null and customer_orders.number_of_orders > 0 and (customer_orders.number_of_orders > 1 or customer_payments.total_amount > 20) and customer_payments.total_amount > 0 then 4
            when customers.customer_id is not null and customer_orders.number_of_orders > 0 and (customer_orders.number_of_orders > 1 or customer_payments.total_amount > 20) then 3
            when customers.customer_id is not null and customer_orders.number_of_orders > 0 then 2
            when customers.customer_id is not null then 1
            else 0
        end as cj_stage,
        
        case 
            when customers.customer_id is not null and customer_orders.number_of_orders > 0 and customer_orders.number_of_orders > 1 and customer_payments.total_amount > 0 and customer_payments.total_amount > 25 then 5
            when customers.customer_id is not null and customer_orders.number_of_orders > 0 and customer_orders.number_of_orders > 1 and customer_payments.total_amount > 0 then 4
            when customers.customer_id is not null and customer_orders.number_of_orders > 0 and customer_orders.number_of_orders > 1 then 3
            when customers.customer_id is not null and customer_orders.number_of_orders > 0 then 2
            when customers.customer_id is not null then 1
            else 0
        end as ec_stage,
        
        case 
            when customers.customer_id is not null and customer_orders.number_of_orders > 0 and customer_orders.number_of_orders > 1 and customer_payments.total_amount > 30 then 5
            when customers.customer_id is not null and customer_orders.number_of_orders > 0 and customer_orders.number_of_orders > 1 then 4
            when customers.customer_id is not null and customer_orders.number_of_orders > 0 then 3
            when customers.customer_id is not null then 2
            when customers.customer_id is not null then 1
            else 0
        end as mk_stage

    from customers
    inner join orders using (customer_id)
    left join order_payments using (order_id)
    left join customer_orders using (customer_id)
    left join customer_payments using (customer_id)
)

select * from pipeline_data