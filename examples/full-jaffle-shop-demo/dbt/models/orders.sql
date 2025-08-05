{% set payment_methods = ['credit_card', 'coupon', 'bank_transfer', 'gift_card'] %}

with orders as (

    select * from {{ ref('stg_orders') }}

),

payments as (

    select * from {{ ref('stg_payments') }}

),

order_payments as (

    select
        order_id,

        {% for payment_method in payment_methods -%}
        sum(case when payment_method = '{{ payment_method }}' then amount else 0 end) as {{ payment_method }}_amount,
        {% endfor -%}

        sum(amount) as total_amount

    from payments

    group by 1

),

final as (

    select
        orders.order_id,
        orders.customer_id,
        orders.order_date,
        orders.status,
        case when status = 'completed' then TRUE else FALSE end AS is_completed,
        orders.order_source,
        orders.shipping_method,
        orders.promo_code,
        orders.order_priority,
        orders.estimated_delivery_days,
        orders.shipping_cost,
        orders.tax_rate,
        orders.currency,
        orders.fulfillment_center,
        orders.order_notes,

        {% for payment_method in payment_methods -%}

        order_payments.{{ payment_method }}_amount,

        {% endfor -%}

        order_payments.total_amount as amount

    from orders

    left join order_payments using (order_id)

)

select * from final
